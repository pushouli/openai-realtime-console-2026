import { useEffect, useRef, useState } from "react";
import ConfigDialog from "./ConfigDialog";
import ConsolePage from "./ConsolePage";
import ToolsList from "./ToolsList";
import {
  buildToolDefinitions,
  createToolHandlers,
  fetchDynamicTools,
} from "../lib/tools";
import {
  buildSessionPayload,
  buildSessionUpdate,
  canEditConfig,
  defaultConfig,
  loadConfig,
  saveConfig,
} from "../lib/config";
import { exchangeSdp } from "../lib/endpoints";
import {
  createAnalyser,
  disconnectAnalyser,
  suspendAudioContext,
} from "../lib/audio-analyser";
import {
  addMessage,
  createSession,
  endSession,
  endSessionOnUnload,
  updateSessionConfig,
} from "../lib/session-api";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [conversation, setConversation] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [status, setStatus] = useState(null);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);

  const [config, setConfig] = useState(defaultConfig);
  // "loading" until the backend answers. Connecting before then would start a
  // session with placeholder instructions and the wrong voice, so the call
  // button stays disabled.
  const [configState, setConfigState] = useState("loading");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [analysers, setAnalysers] = useState({ mic: null, remote: null });
  const micTrackRef = useRef(null);

  // Drives the artwork. The server says when the assistant starts and stops
  // talking, so this follows those events rather than guessing from levels.
  const [speakState, setSpeakState] = useState("");
  const [conversationState, setConversationState] = useState(false);
  // True from the click until the data channel opens. The handshake takes a
  // visible moment - fetching tools, minting a key, exchanging SDP - and
  // without this the button just sits there looking done.
  const [isConnecting, setIsConnecting] = useState(false);
  // Bumped by every start and every stop. A connect attempt compares it after
  // each await and bails if it no longer owns the session, so hanging up
  // mid-handshake actually stops rather than letting a late reply carry on.
  const connectTokenRef = useRef(0);

  // The config lives on the backend and decides the prompt, the voice and the
  // turn detection, so there is nothing worth connecting with until it lands.
  useEffect(() => {
    loadConfig()
      .then((loaded) => {
        setConfig(loaded);
        setConfigState("ready");
      })
      .catch((error) => {
        console.error("Could not load the session config", error);
        setConfigState("error");
        setStatus(`配置加载失败：${error.message}`);
      });
  }, []);

  // The data channel listener is installed once per session and would otherwise
  // capture whatever these were when it was attached.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const dynamicToolsRef = useRef([]);

  const sessionIdRef = useRef("");
  // Resolves once the session record exists, so message records never race
  // ahead of the session they belong to.
  const sessionReadyRef = useRef(Promise.resolve());
  // conversation item id -> the item that preceded it, used to thread messages.
  const previousItemRef = useRef({});

  function takePreviousItem(itemId) {
    const previous = previousItemRef.current[itemId];
    delete previousItemRef.current[itemId];
    return previous;
  }

  async function handleSaveConfig(next) {
    await saveConfig(next);
    setConfig(next);
    setIsConfigOpen(false);

    // Apply right away when connected. Voice is left out - it cannot change
    // once the session has started, so it waits for the next connection.
    if (isSessionActive) {
      sendClientEvent(buildSessionUpdate(next, { includeVoice: false }));
    }
  }

  function toggleMic(muted) {
    setMicMuted(muted);
    if (micTrackRef.current) {
      micTrackRef.current.enabled = !muted;
    }
  }

  function toggleSpeaker(muted) {
    setSpeakerMuted(muted);
    if (audioElement.current) {
      audioElement.current.muted = muted;
    }
  }

  async function startSession() {
    const token = ++connectTokenRef.current;
    const aborted = () => connectTokenRef.current !== token;

    // Switch to the conversation view straight away and say what is happening
    // there. Waiting for the data channel would leave the button looking dead
    // through the whole handshake.
    setEvents([]);
    setConversation([]);
    setIsSessionActive(true);
    setIsConnecting(true);
    setStatus("awaiting connection...");

    try {
      const sessionConfig = configRef.current;

      // Load the managed tools first so they can go out with the very first
      // session.update rather than a second round trip.
      dynamicToolsRef.current = await fetchDynamicTools();
      if (aborted()) return;

      const pc = new RTCPeerConnection();
      // Publish it now, not at the end. Hanging up during the handshake has to
      // find something to close, or the connection and the microphone leak.
      peerConnection.current = pc;

      // Set up to play remote audio from the model, and tap it for the
      // waveform. The element is required: a browser will not pump a remote
      // track that nothing is playing.
      audioElement.current = document.createElement("audio");
      audioElement.current.autoplay = true;
      audioElement.current.muted = speakerMuted;
      pc.ontrack = (e) => {
        audioElement.current.srcObject = e.streams[0];
        setAnalysers((prev) => ({ ...prev, remote: createAnalyser(e.streams[0]) }));
      };

      // Add local audio track for microphone input in the browser. A refused
      // permission is the one failure worth dropping back to the idle screen
      // for - there is nothing to retry until the user changes it.
      let ms;
      try {
        ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (mediaError) {
        console.error("getUserMedia error", mediaError);
        if (aborted()) return;
        setStatus("Please allow microphone access");
        setIsSessionActive(false);
        setIsConnecting(false);
        setDataChannel(null);
        return;
      }

      if (aborted()) {
        ms.getTracks().forEach((track) => track.stop());
        return;
      }

      const micTrack = ms.getTracks()[0];
      micTrack.enabled = !micMuted;
      micTrackRef.current = micTrack;
      pc.addTrack(micTrack);
      setAnalysers((prev) => ({ ...prev, mic: createAnalyser(ms) }));

      // Set up data channel for sending and receiving events
      const dc = pc.createDataChannel("oai-events");
      setDataChannel(dc);

      // Start the session using the Session Description Protocol (SDP). The
      // backend mints the ephemeral key and exchanges this with the relay, so
      // one request covers what used to take two.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const answerSdp = await exchangeSdp(
        offer.sdp,
        buildSessionPayload(sessionConfig, { includeVoice: true }),
      );

      if (aborted()) return;

      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (error) {
      // Stay on the conversation view: that is where the message is shown, and
      // dropping back to the idle screen would hide the reason it failed.
      console.error("Could not start the session", error);
      if (aborted()) return;
      setStatus(String(error.message ?? error));
      setIsConnecting(false);
      setDataChannel(null);
    }
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    // Invalidates any connect attempt still in flight.
    connectTokenRef.current++;

    setIsSessionActive(false);
    setIsConnecting(false);
    setStatus(null);
    setEvents([]);
    setConversation([]);
    setSpeakState("");
    setConversationState(false);

    if (dataChannel) {
      dataChannel.close();
    }

    if (peerConnection.current) {
      peerConnection.current.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      peerConnection.current.close();
    }

    disconnectAnalyser(analysers.mic);
    disconnectAnalyser(analysers.remote);
    setAnalysers({ mic: null, remote: null });
    // Stopped directly as well: during the handshake the track may not be
    // attached to a sender yet, and an unstopped one leaves the browser's
    // recording indicator lit.
    micTrackRef.current?.stop();
    micTrackRef.current = null;
    suspendAudioContext();

    if (sessionIdRef.current) {
      endSession(sessionIdRef.current);
      sessionIdRef.current = "";
    }

    setDataChannel(null);
    peerConnection.current = null;
  }

  // Send a message to the model
  function sendClientEvent(message) {
    if (dataChannel) {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();

      // send event before setting timestamp since the backend peer doesn't expect this field
      dataChannel.send(JSON.stringify(message));

      // if guard just in case the timestamp exists by miracle
      if (!message.timestamp) {
        message.timestamp = timestamp;
      }
      message.source = "client";
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error(
        "Failed to send message - no data channel available",
        message,
      );
    }
  }

  // Send a text message to the model
  function sendTextMessage(message) {
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    sendClientEvent({ type: "response.create" });
  }

  /** Append a transcript line, ignoring repeats of one we already have. */
  /**
   * Reserve a line in conversation order, without disturbing one that exists.
   *
   * conversation.item.created arrives in the order the items actually sit in
   * the conversation. Transcripts do not: the user's speech is transcribed by a
   * separate model and often lands after the assistant has already started
   * replying, so ordering by arrival puts the question below the answer.
   */
  function ensureConversationItem(id, role, text = "") {
    if (!id) return;
    setConversation((prev) =>
      prev.some((item) => item.id === id) ? prev : [...prev, { id, role, text }],
    );
  }

  /**
   * Add or update one line of the transcript.
   *
   * Transcripts arrive as a stream of deltas followed by an authoritative final
   * string, so this both appends fragments and replaces the whole line.
   */
  function upsertConversationItem(id, role, { text = "", append = false }) {
    if (!id) return;

    setConversation((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index === -1) {
        return [...prev, { id, role, text }];
      }

      const next = [...prev];
      const current = next[index];
      next[index] = {
        ...current,
        role: role ?? current.role,
        text: append ? current.text + text : text,
      };
      return next;
    });
  }

  // Run any tools the model called, report their results, and let it continue.
  // Without the function_call_output the model never learns what a tool
  // returned and the turn stalls, so this has to run for every function_call in
  // the response.
  async function handleFunctionCalls(event) {
    const calls = (event.response?.output ?? []).filter(
      (output) => output.type === "function_call",
    );
    if (calls.length === 0) return;

    // Extra content a tool wants the model to see, e.g. a photo. Held back
    // until every call has its output so a function_call and its
    // function_call_output stay adjacent in the conversation.
    const extraItems = [];
    const handlers = createToolHandlers({
      addConversationItem: (item) => extraItems.push(item),
      dynamicTools: dynamicToolsRef.current,
    });

    for (const call of calls) {
      let result;
      try {
        const handler = handlers[call.name];
        if (!handler) {
          throw new Error(`No handler registered for tool "${call.name}"`);
        }
        result = await handler(call.arguments ? JSON.parse(call.arguments) : {});
      } catch (error) {
        console.error(`Tool "${call.name}" failed`, error);
        result = { error: String(error) };
      }

      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result),
        },
      });
    }

    for (const item of extraItems) {
      sendClientEvent({ type: "conversation.item.create", item });
    }

    // One response for the batch, after everything is in the conversation.
    sendClientEvent({ type: "response.create" });
  }

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      // Append new server events to the list
      dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        if (!event.timestamp) {
          event.timestamp = new Date().toLocaleTimeString();
        }
        event.source = "server";

        setEvents((prev) => [event, ...prev]);

        const aiName = configRef.current.name ?? "";

        // The server announces the assistant's speech directly - no need to
        // infer it from output levels.
        if (event.type === "output_audio_buffer.started") {
          setSpeakState("start");
        } else if (event.type === "output_audio_buffer.stopped") {
          setSpeakState("stop");
        }

        // Apply the saved config and register every tool in one go - a
        // session.update carrying `tools` replaces the previous list.
        if (event.type === "session.created") {
          sessionIdRef.current = event.session.id;
          sessionReadyRef.current = createSession({
            sessionId: event.session.id,
            config: JSON.stringify(event.session),
            instruction: event.session.instructions,
            voice: event.session.audio?.output?.voice,
            aiName,
          });

          sendClientEvent(
            buildSessionUpdate(configRef.current, {
              tools: buildToolDefinitions(dynamicToolsRef.current),
              includeVoice: true,
            }),
          );
        }

        if (event.type === "session.updated") {
          sessionReadyRef.current.then(() =>
            updateSessionConfig({
              sessionId: event.session.id,
              config: JSON.stringify(event.session),
              createdOn: new Date().toISOString(),
              instruction: event.session.instructions,
              voice: event.session.audio?.output?.voice,
              aiName,
            }),
          );
        }

        if (event.type === "conversation.item.created") {
          previousItemRef.current[event.item.id] = event.previous_item_id ?? "";

          // Only typed messages arrive with their text already present; spoken
          // ones show up later as a transcription.
          const text = event.item.content?.[0]?.text;

          // Claim the row now so it keeps its place, whenever the words land.
          // Tool calls have no bubble.
          if (event.item.type === "message" && event.item.role) {
            ensureConversationItem(event.item.id, event.item.role, text ?? "");
          }

          if (!event.previous_item_id && event.item.role === "user" && text) {
            sessionReadyRef.current.then(() =>
              addMessage({
                sessionId: sessionIdRef.current,
                messageId: event.item.id,
                text,
                roleType: "User",
                previousMessageId: "",
                createdOn: new Date().toISOString(),
              }),
            );
          }
        }

        // Transcripts stream in as fragments. Without these the line only
        // appears once the whole sentence is finished, which reads as a stall.
        if (event.type === "response.output_audio_transcript.delta") {
          upsertConversationItem(event.item_id, "assistant", {
            text: event.delta ?? "",
            append: true,
          });
        }

        if (event.type === "response.text.delta") {
          upsertConversationItem(event.item_id, "assistant", {
            text: event.delta ?? "",
            append: true,
          });
        }

        if (event.type === "conversation.item.input_audio_transcription.delta") {
          upsertConversationItem(event.item_id, "user", {
            text: event.delta ?? "",
            append: true,
          });
        }

        // Spoken turns only become text once they have been transcribed.
        if (event.type === "conversation.item.input_audio_transcription.completed") {
          upsertConversationItem(event.item_id, "user", {
            text: event.transcript,
          });
          const previousMessageId = takePreviousItem(event.item_id);
          sessionReadyRef.current.then(() =>
            addMessage({
              sessionId: sessionIdRef.current,
              messageId: event.item_id,
              text: event.transcript,
              roleType: "User",
              previousMessageId,
              createdOn: new Date().toISOString(),
            }),
          );
        }

        if (event.type === "response.output_audio_transcript.done") {
          upsertConversationItem(event.item_id, "assistant", {
            text: event.transcript,
          });
          const previousMessageId = takePreviousItem(event.item_id);
          sessionReadyRef.current.then(() =>
            addMessage({
              sessionId: sessionIdRef.current,
              messageId: event.item_id,
              text: event.transcript,
              roleType: "Assistant",
              previousMessageId,
              createdOn: new Date().toISOString(),
            }),
          );
        }

        if (event.type === "error") {
          console.error("Received error", event);
        }

        if (event.type === "response.done") {
          handleFunctionCalls(event);
        }
      });

      // The handshake is done once the channel opens.
      dataChannel.addEventListener("open", () => {
        setIsConnecting(false);
        setStatus("Please start speaking; the AI is listening to you.");
        if (configRef.current.opener) {
          sendTextMessage(configRef.current.opener);
        }
        setSpeakState("stop");
      });
    }
  }, [dataChannel]);

  // A normal fetch is killed mid-flight on unload, so close the session record
  // with a beacon instead.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionIdRef.current) {
        endSessionOnUnload(sessionIdRef.current);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return (
    <>
      <ConsolePage
        config={config}
        events={events}
        conversation={conversation}
        isSessionActive={isSessionActive}
        configReady={configState === "ready"}
        canEditConfig={canEditConfig()}
        isConnecting={isConnecting}
        status={status}
        micMuted={micMuted}
        speakerMuted={speakerMuted}
        analysers={analysers}
        speakState={speakState}
        conversationState={conversationState}
        onConversationStateChange={setConversationState}
        onStart={startSession}
        onStop={stopSession}
        onToggleMic={toggleMic}
        onToggleSpeaker={toggleSpeaker}
        onOpenConfig={() => setIsConfigOpen(true)}
        onOpenTools={() => setIsToolsOpen(true)}
      >
        <ConfigDialog
          open={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          config={config}
          onSave={handleSaveConfig}
          isSessionActive={isSessionActive}
        />
        <ToolsList
          open={isToolsOpen}
          onClose={() => setIsToolsOpen(false)}
          isSessionActive={isSessionActive}
        />
      </ConsolePage>
    </>
  );
}
