/**
 * CRUD against the Tools service.
 *
 * The service stores one array for the whole tool set, so every write is a full
 * replace - read, modify, put back.
 */

import { backendFetch, endpoints } from "./endpoints";

/** Every tool, including disabled ones. The management UI needs those too. */
export async function fetchAllTools() {
  if (!endpoints.tools) {
    throw new Error("The Tools service is not configured for this deployment.");
  }
  const response = await backendFetch(endpoints.tools);
  if (!response.ok) {
    throw new Error(`Loading tools failed: ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function saveTools(tools) {
  if (!endpoints.tools) {
    throw new Error("The Tools service is not configured for this deployment.");
  }
  // No Content-Type on purpose: the action binds [FromBody] string, so the body
  // has to be a JSON string. Declaring application/json makes the model binder
  // expect an object and the request fails.
  const response = await backendFetch(endpoints.tools, {
    method: "PUT",
    body: JSON.stringify(tools),
  });
  if (!response.ok) {
    throw new Error(`Saving tools failed: ${response.status}`);
  }
}
