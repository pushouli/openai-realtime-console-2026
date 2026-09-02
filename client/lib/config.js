/**
 * Session configuration: loading, saving, and the mapping onto the GA session
 * schema (audio.input.turn_detection, audio.output.voice, ...).
 *
 * The stored shape is the backend's, not ours - it is read from and written
 * back to the Configuration endpoint verbatim, so the snake_case field names
 * are deliberate.
 */

import { backendFetch, endpoints, MODEL } from "./endpoints";

const env = import.meta.env;

const TRANSCRIBE_MODEL = env.VITE_TRANSCRIBE_MODEL ?? "whisper-1";

// marin and cedar shipped with gpt-realtime; the rest predate it.
export const VOICES = [
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
];

/** Turn detection modes. server_vad listens to volume, semantic_vad to meaning. */
export const VAD_TYPES = ["server_vad", "semantic_vad"];

/** How long semantic_vad waits before deciding the user is done. */
export const EAGERNESS_LEVELS = ["auto", "low", "medium", "high"];

/**
 * Reasoning budget for gpt-realtime-2.x. Which values a model accepts varies,
 * so an unsupported one comes back as a rejected parameter rather than being
 * silently ignored.
 */
export const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

/** Filters the input before it reaches VAD and the model. */
export const NOISE_REDUCTION_TYPES = ["near_field", "far_field"];

export const defaultConfig = {
  name: "",
  voice: "marin",
  instructions: "",
  opener: "",
  turn_detection: {
    type: "server_vad",
    // server_vad
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 500,
    // semantic_vad
    eagerness: "auto",
  },
  // Everything below is opt-in: left empty it is not sent at all, so the model
  // keeps its own default and the payload stays as it was.
  reasoning_effort: "",
  noise_reduction: "",
  speed: "",
  max_output_tokens: "",
  transcription_language: "",
  // Read-only. The Configuration endpoint merges this in from the shared
  // system.json before answering; it is not part of the user's own config and
  // must never be written back - see saveConfig.
  system_instructions: "",
};

function normalize(config) {
  const merged = {
    ...defaultConfig,
    ...config,
    turn_detection: {
      ...defaultConfig.turn_detection,
      ...config?.turn_detection,
    },
  };
  // Stored configs predate the type field being required.
  if (!merged.turn_detection.type) {
    merged.turn_detection.type = "server_vad";
  }
  return merged;
}

/**
 * The prompt the model actually receives: the user's own instructions with the
 * shared system instructions appended.
 */
function mergeInstructions(config) {
  if (!config.system_instructions) {
    return config.instructions || undefined;
  }
  if (!config.instructions) {
    return config.system_instructions;
  }
  return `${config.instructions}\n${config.system_instructions}`;
}

/**
 * Where this page gets its session config.
 *
 * ?instructions=<key> picks a named file through the anonymous Instructions
 * endpoint; without it the configured Configuration endpoint is used, which is
 * per logged-in user on the in-app deployment and a fixed key on the car.
 */
function instructionsKey() {
  return new URLSearchParams(window.location.search).get("instructions");
}

function configSource() {
  const key = instructionsKey();
  return key
    ? `${endpoints.instructions}/${encodeURIComponent(key)}`
    : endpoints.configuration;
}

/**
 * Whether this page may edit its config.
 *
 * An ?instructions= config is a shared file addressed by the URL, not this
 * user's own settings - saving would write it somewhere else entirely. The
 * original simply left the dialog out of that deployment.
 */
export function canEditConfig() {
  return !instructionsKey();
}

export async function loadConfig() {
  const response = await backendFetch(configSource());
  if (!response.ok) {
    throw new Error(
      `Configuration request failed: ${response.status} ${response.statusText}`,
    );
  }

  // The Instructions endpoint may hold either a full config object or just the
  // prompt as plain text.
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { instructions: text };
  }

  return normalize(parsed);
}

export async function saveConfig(config) {
  // The endpoint writes the body straight into the user's own file with no
  // field filtering, and system_instructions arrived from the shared
  // system.json. Writing it back would freeze a copy into this user's config,
  // so later edits to the shared prompt would never reach them again.
  const { system_instructions, ...ownConfig } = config;

  // No Content-Type on purpose: the action binds [FromBody] string, so the body
  // has to be a JSON string. Declaring application/json makes the model binder
  // expect an object and the request fails.
  const response = await backendFetch(endpoints.configuration, {
    method: "PUT",
    body: JSON.stringify(ownConfig, undefined, 2),
  });
  if (!response.ok) {
    throw new Error(
      `Saving the configuration failed: ${response.status} ${response.statusText}`,
    );
  }
}

/**
 * Build the session payload.
 *
 * Used for two things that need the same shape: the body of the token request,
 * and the `session` of a session.update.
 *
 * Voice is optional because it cannot change once the model has started
 * speaking - a mid-session save applies everything else and leaves the voice
 * for the next connection.
 */
export function buildSessionPayload(
  config,
  { includeVoice = true, includeModel = true, tools } = {},
) {
  const normalized = normalize(config);
  const vad = normalized.turn_detection;

  // Only the fields that belong to the chosen mode. threshold and the padding
  // pair mean nothing to semantic_vad, and eagerness means nothing to
  // server_vad - sending the wrong ones gets the whole update rejected.
  const turnDetection =
    vad.type === "semantic_vad"
      ? { type: "semantic_vad", eagerness: vad.eagerness || "auto" }
      : {
          type: "server_vad",
          threshold: vad.threshold,
          prefix_padding_ms: vad.prefix_padding_ms,
          silence_duration_ms: vad.silence_duration_ms,
        };

  const transcription = { model: TRANSCRIBE_MODEL };
  if (normalized.transcription_language) {
    transcription.language = normalized.transcription_language;
  }

  const audioInput = { turn_detection: turnDetection, transcription };
  if (normalized.noise_reduction) {
    audioInput.noise_reduction = { type: normalized.noise_reduction };
  }

  const audioOutput = includeVoice ? { voice: normalized.voice } : {};
  if (normalized.speed) {
    audioOutput.speed = Number(normalized.speed);
  }

  const payload = {
    type: "realtime",
    instructions: mergeInstructions(normalized),
    audio: {
      input: audioInput,
      ...(Object.keys(audioOutput).length ? { output: audioOutput } : {}),
    },
  };

  if (normalized.reasoning_effort) {
    payload.reasoning = { effort: normalized.reasoning_effort };
  }
  if (normalized.max_output_tokens) {
    payload.max_output_tokens =
      normalized.max_output_tokens === "inf"
        ? "inf"
        : Number(normalized.max_output_tokens);
  }

  if (includeModel) {
    payload.model = MODEL;
  }
  // No temperature - gpt-realtime-2.x rejects the field.
  if (tools) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }

  return payload;
}

export function buildSessionUpdate(config, options = {}) {
  return {
    type: "session.update",
    // The model is fixed for the life of a session.
    session: buildSessionPayload(config, { ...options, includeModel: false }),
  };
}
