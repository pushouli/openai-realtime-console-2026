/**
 * Tool registry.
 *
 * Definitions are sent to the model once, in a single session.update - a
 * session.update carrying `tools` replaces the whole list, so every tool has to
 * be registered from here rather than from individual components.
 *
 * Tools come from three places:
 *   builtin.js     every deployment has these
 *   deployment.js  whatever this deployment adds - the only file a deployment
 *                  branch needs to touch
 *   Tools service  managed at runtime, fetched at connect time
 *
 * A tool is { definition, createHandler }. createHandler(context) returns the
 * async function that runs when the model calls it; its return value is sent
 * back as function_call_output.
 *
 * context.addConversationItem(item) puts extra content in front of the model.
 * Those items are appended after every function_call_output, so each call stays
 * next to its own output and the extra content is the last thing the model sees
 * before it answers. See see_with_camera.
 */

import { endpoints } from "../endpoints";
import { fetchAllTools } from "../tools-api";
import { builtinTools } from "./builtin";
import { deploymentTools } from "./deployment";

const localTools = [...builtinTools, ...deploymentTools];

/**
 * Fetch the tools managed through the Tools service.
 *
 * Returns [] rather than throwing when the service is unreachable or switched
 * off - losing the managed tools should still leave the local ones working.
 */
export async function fetchDynamicTools() {
  // Blank the URL in .env to run with the local tools only.
  if (!endpoints.tools) return [];

  try {
    const tools = await fetchAllTools();
    return tools.filter((tool) => !tool.disabled && tool.definition?.name);
  } catch (error) {
    console.error("Could not load tools from the Tools service", error);
    return [];
  }
}

/**
 * Turn a stored handler into a callable.
 *
 * SECURITY: `handler` is JavaScript source held by the Tools service, and this
 * evaluates it in the page. Write access to that service is therefore
 * equivalent to script execution in every browser that loads this app. The
 * service must be authenticated and its contents treated as trusted code.
 */
function compileHandler(tool) {
  const name = tool.definition.name;

  if (!tool.handler) {
    return async (params) => ({
      status: "error",
      message: `Tool "${name}" has no handler`,
      params,
    });
  }

  try {
    return new Function(`return ${tool.handler}`)();
  } catch (error) {
    console.error(`Handler for tool "${name}" did not compile`, error);
    return async (params) => ({
      status: "error",
      message: `Handler for "${name}" did not compile`,
      params,
    });
  }
}

/** Local definitions plus whatever the Tools service supplied. */
export function buildToolDefinitions(dynamicTools = []) {
  return [
    ...localTools.map((tool) => tool.definition),
    ...dynamicTools.map((tool) => ({ type: "function", ...tool.definition })),
  ];
}

export function createToolHandlers({ addConversationItem, dynamicTools = [] }) {
  const handlers = {};

  for (const tool of localTools) {
    handlers[tool.definition.name] = tool.createHandler({ addConversationItem });
  }

  // A managed tool with the same name as a local one wins, so behaviour can be
  // patched from the service without a redeploy.
  for (const tool of dynamicTools) {
    handlers[tool.definition.name] = compileHandler(tool);
  }

  return handlers;
}
