import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "react-feather";
import logo from "/assets/logo.png";
import userAvatar from "/assets/t.apng";
import assistantAvatar from "/assets/s.apng";
import {
  CallEndIcon,
  CallStartIcon,
  MicOffIcon,
  MicOnIcon,
  SetupIcon,
  SpeakerOffIcon,
  SpeakerOnIcon,
  TelephoneIcon,
  ToolsIcon,
} from "./Icons";
import { drawSpectrum } from "../lib/audio-analyser";
import "../styles/ConsolePage.scss";

/**
 * The custom console UI, ported from the original project.
 *
 * The markup deliberately mirrors the original class names - ConsolePage.scss
 * came over unchanged, so the structure is what makes it render.
 */
export default function ConsolePage({
  config,
  events,
  conversation,
  isSessionActive,
  configReady,
  canEditConfig,
  isConnecting,
  status,
  micMuted,
  speakerMuted,
  analysers,
  speakState,
  conversationState,
  onConversationStateChange,
  onStart,
  onStop,
  onToggleMic,
  onToggleSpeaker,
  onOpenConfig,
  onOpenTools,
  children,
}) {
  const clientCanvasRef = useRef(null);
  const serverCanvasRef = useRef(null);
  const eventsScrollRef = useRef(null);
  const conversationScrollRef = useRef(null);
  const [expandedEvents, setExpandedEvents] = useState({});

  // One animation loop drives both canvases. It reads the analysers through a
  // ref so it never has to be torn down and rebuilt mid-call.
  const analysersRef = useRef(analysers);
  analysersRef.current = analysers;

  useEffect(() => {
    let frame = 0;

    const render = () => {
      const { mic, remote } = analysersRef.current ?? {};
      drawSpectrum(clientCanvasRef.current, mic, "#86ff86");
      drawSpectrum(serverCanvasRef.current, remote, "#9d86ff");
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Keep the newest event in view.
  useEffect(() => {
    const el = eventsScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  // Transcripts grow a fragment at a time, so follow them down.
  useEffect(() => {
    const el = conversationScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation]);

  const rootClass = [
    isSessionActive ? speakState : "",
    conversationState ? "conversation" : "",
    isSessionActive ? "isConnected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div data-component="ConsolePage" className={rootClass}>
      <div className="content-top page-header">
        <div className="logo">
          <div className="logo-pic">
            <img src={logo} alt="logo" />
          </div>
          <div className="logo-text">{config.name} realtime AI</div>
        </div>
        <div className="user-info-placeholder"></div>
      </div>

      <div className="content-main">
        {isSessionActive && (
          <div className="content-logs">
            <div className="content-block events">
              <div className="content-block-title">events</div>
              <div className="content-block-body" ref={eventsScrollRef}>
                {!events.length && `awaiting connection...`}
                {events.map((event) => (
                  <div className="event" key={event.event_id}>
                    <div className="event-timestamp">{event.timestamp}</div>
                    <div className="event-details">
                      <div
                        className="event-summary"
                        onClick={() =>
                          setExpandedEvents((prev) => ({
                            ...prev,
                            [event.event_id]: !prev[event.event_id],
                          }))
                        }
                      >
                        <div
                          className={`event-source ${
                            event.type === "error" ? "error" : event.source
                          }`}
                        >
                          {event.source === "client" ? (
                            <ArrowUp />
                          ) : (
                            <ArrowDown />
                          )}
                          <span>
                            {event.type === "error" ? "error!" : event.source}
                          </span>
                        </div>
                        <div className="event-type">{event.type}</div>
                      </div>
                      {!!expandedEvents[event.event_id] && (
                        <div className="event-payload">
                          {JSON.stringify(event, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="content-block conversation">
              <div className="content-block-title">conversation</div>
              <div
                className="content-block-body"
                data-conversation-content
                ref={conversationScrollRef}
              >
                <div className="AAA">
                  {!conversation.length && (status ?? "awaiting conversation...")}
                  {isConnecting && (
                    <span className="connecting-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                  )}
                </div>
                {conversation.map((item) => (
                  <div
                    className={`conversation-item ${item.role}`}
                    key={item.id}
                  >
                    <div className={`speaker ${item.role}`}>
                      <div>{item.role}</div>
                    </div>
                    <div className="speaker-content">
                      <div className="speaker-content_bd">
                        <div>{item.text}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="content-right">
          <div className="visualization">
            <div className="visualization-entry client">
              <div className="sound-wave">
                <canvas ref={clientCanvasRef} />
              </div>
              <div
                className="profile-pic"
                onClick={() => onConversationStateChange(false)}
              >
                <img src={userAvatar} alt="user" />
              </div>
            </div>
            <div className="visualization-entry server">
              <div className="sound-wave">
                <canvas ref={serverCanvasRef} />
              </div>
              <div
                className="profile-pic"
                onClick={() => onConversationStateChange(false)}
              >
                <img src={assistantAvatar} alt="assistant" />
              </div>
            </div>
          </div>

          <div className="content-actions">
            {/* Kept separate from the button on purpose: the button has to go
                on looking like a hang-up so it stays obviously clickable. */}
            {isConnecting && (
              <div className="connecting-indicator">
                <span className="spinner"></span>
                <span>Connecting...</span>
              </div>
            )}

            <button
              data-component="Button"
              className={`button-style-${
                isSessionActive ? "regular" : "action"
              } ${isSessionActive ? "connected" : "disconnected"}`}
              // Nothing worth connecting with until the config lands - it
              // carries the prompt, the voice and the turn detection.
              disabled={!configReady}
              onClick={isSessionActive ? onStop : onStart}
            >
              {!isSessionActive && (
                <span className="icon icon-start">
                  <CallStartIcon />
                </span>
              )}
              <span className="label">{isSessionActive ? "End" : "Start"}</span>
              {isSessionActive && (
                <span className="icon icon-end">
                  <CallEndIcon />
                </span>
              )}
            </button>
            <div
              className="toggle-btn"
              onClick={() => onConversationStateChange(true)}
            >
              <TelephoneIcon />
            </div>
          </div>

          <div className="app-dash-content">
            {canEditConfig && (
              <button
                className="app-button configuration-button"
                onClick={onOpenConfig}
              >
                <span className="btn-icon">
                  <SetupIcon />
                </span>
                <span className="btn-text">Setup</span>
              </button>
            )}

            {!isSessionActive && (
              <button
                className="app-button configuration-button"
                onClick={onOpenTools}
              >
                <span className="btn-icon">
                  <ToolsIcon />
                </span>
                <span className="btn-text">Tools</span>
              </button>
            )}

            <button
              className={`app-button spk-button ${
                speakerMuted ? "spk-off" : "spk-on"
              }`}
              onClick={() => onToggleSpeaker(!speakerMuted)}
            >
              <span className="btn-icon">
                {speakerMuted ? <SpeakerOffIcon /> : <SpeakerOnIcon />}
              </span>
              <span className="btn-text">
                {speakerMuted ? "SPK off" : "SPK on"}
              </span>
            </button>

            <button
              className={`app-button mic-button ${
                micMuted ? "mic-off" : "mic-on"
              }`}
              onClick={() => onToggleMic(!micMuted)}
            >
              <span className="btn-icon">
                {micMuted ? <MicOffIcon /> : <MicOnIcon />}
              </span>
              <span className="btn-text">{micMuted ? "Mic off" : "Mic on"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* The dialogs live inside this root, as they did originally. The tools
          panel sizes itself against it - as a sibling it would be laid out
          below a full-height page and clipped away. */}
      {children}
    </div>
  );
}
