/**
 * External service addresses.
 *
 * The app is a static page: the ephemeral key, the session config, the managed
 * tools and the conversation records all come from your own backend, and the
 * Realtime traffic goes through your relay. Nothing here needs a Node server.
 *
 * Every address is overridable through VITE_* variables in the project-root
 * .env (vite.config.js points envDir there), so the same build can be aimed at
 * a different relay or backend.
 */

const env = import.meta.env;

export const MODEL = env.VITE_REALTIME_MODEL ?? "gpt-realtime-2.1";

/**
 * Optional API key for deployments with no logged-in user.
 *
 * There are two deployment shapes:
 *
 *   in-app     the built files are served by the Bot project itself, so the
 *              page is same-origin and already behind the login. Cookies carry
 *              the identity and this stays unset.
 *   standalone a separate site, such as the car. Cross-origin, no login, so it
 *              authenticates with this key instead.
 *
 * Note the key ends up in the JavaScript bundle: it identifies a deployment,
 * it does not keep a determined attacker out.
 */
const API_KEY = env.VITE_API_KEY ?? "";

export const endpoints = {
  calls: env.VITE_CALLS_SERVER_URL ?? "/api/realtime/Calls",
  configuration:
    env.VITE_CONFIGURATION_SERVER_URL ?? "/api/realtime/Configuration",
  // Used when the URL carries ?instructions=<key>. Anonymous, and the key
  // names a file rather than a user.
  instructions:
    env.VITE_INSTRUCTIONS_SERVER_URL ?? "/api/realtime/Instructions",
  tools: env.VITE_TOOLS_SERVER_URL ?? "/api/realtime/Tools",

  // Conversation recording. Blank any of these to switch that part off.
  createSession: env.VITE_CREATE_SESSION_URL ?? "/api/realtime/CreateSession",
  addSessionConfigRecord:
    env.VITE_ADD_SESSION_CONFIG_RECORD_URL ??
    "/api/realtime/AddSessionConfigRecord",
  addMessage: env.VITE_ADD_MESSAGE_URL ?? "/api/realtime/AddMessage",
  endSession: env.VITE_END_SESSION_URL ?? "/api/realtime/EndSession",
};

/**
 * Every backend call goes through here so the two deployment shapes stay in
 * one place.
 *
 * The credentials mode is not a detail: sending cookies cross-origin obliges
 * the server to answer with Access-Control-Allow-Credentials, which the API
 * does not do. The standalone site therefore omits them and relies on the key.
 */
export function backendFetch(url, init = {}) {
  const headers = { ...init.headers };
  if (API_KEY) {
    headers.ApiKey = API_KEY;
  }

  return fetch(url, {
    ...init,
    headers,
    credentials: API_KEY ? "omit" : "include",
  });
}

/**
 * Hand the SDP offer to the backend and get the answer back.
 *
 * The backend mints the ephemeral key and exchanges the SDP itself, so the
 * browser never holds a credential and never talks to the relay directly.
 * Only the handshake goes this way - once it completes, audio flows straight
 * between the browser and the media server.
 */
export async function exchangeSdp(offerSdp, sessionPayload) {
  const response = await backendFetch(endpoints.calls, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sdp: offerSdp, session: sessionPayload }),
  });

  const body = await response.text();
  if (!response.ok) {
    // The backend passes the upstream failure through verbatim, and that text
    // is the only thing that says which parameter or model was rejected.
    throw new Error(`Connecting failed (${response.status}): ${body}`);
  }
  return body;
}
