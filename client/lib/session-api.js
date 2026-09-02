/**
 * Conversation recording.
 *
 * Every call is best-effort: a failure here is logged and swallowed, because
 * losing a transcript record should never interrupt a live call.
 *
 * Any of these endpoints can be left blank in .env to switch that part off -
 * the car deployment has no login, and these all require one, so calling them
 * there would just produce a stream of 401s.
 */

import { backendFetch, endpoints } from "./endpoints";

async function post(url, body) {
  if (!url) return null;

  try {
    const response = await backendFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Recording call to ${url} failed`, error);
    return null;
  }
}

export function createSession({ sessionId, config, instruction, voice, aiName }) {
  return post(endpoints.createSession, {
    sessionId,
    config,
    instruction,
    url: window.location.href,
    aIName: aiName,
    voice,
  });
}

export function updateSessionConfig({
  sessionId,
  config,
  createdOn,
  instruction,
  voice,
  aiName,
}) {
  return post(endpoints.addSessionConfigRecord, {
    sessionId,
    config,
    createdOn,
    instruction,
    voice,
    aIName: aiName,
  });
}

export function addMessage({
  sessionId,
  messageId,
  text,
  roleType,
  previousMessageId,
  createdOn,
}) {
  return post(endpoints.addMessage, {
    sessionId,
    messageId,
    text,
    roleType,
    previousMessageId,
    createdOn,
  });
}

export function endSession(sessionId) {
  return post(endpoints.endSession, { sessionId });
}

/**
 * Close out a session while the page is going away. A normal fetch is killed
 * mid-flight on unload, so this hands the request to the browser to finish.
 */
export function endSessionOnUnload(sessionId) {
  if (!endpoints.endSession) return;

  const body = new Blob([JSON.stringify({ sessionId })], {
    type: "application/json",
  });
  navigator.sendBeacon(endpoints.endSession, body);
}
