/**
 * Build a tool from a Dify workflow.
 *
 * Reads the workflow's own metadata and input form, turns that into a JSON
 * Schema, and writes a handler that calls the workflow. Ported from the
 * original ToolsDialog.
 */

export const DIFY_URL =
  import.meta.env.VITE_DIFY_URL ?? "https://dify.ycyw.com";

/** Map one Dify form entry onto a JSON Schema property. */
function toSchemaProperty(type, config) {
  const { label, allowed_file_types, allowed_file_upload_methods = [] } = config;

  if (type === "number") {
    return { type: "number", description: label };
  }

  if (type === "file" || type === "file-list") {
    const fileTypes = allowed_file_types?.join(", ") || "所有文件";
    const uploadMethods = allowed_file_upload_methods
      .map((m) => (m === "local_file" ? "base64" : m))
      .join(" 或 ");
    return {
      type: "string",
      description: `${label}。支持的文件类型: ${fileTypes}。输入格式: ${uploadMethods}`,
    };
  }

  const property = { type: "string", description: label };
  if (type === "select" && config.options?.length > 0) {
    property.enum = config.options;
  }
  return property;
}

const FILE_HELPER = `
  // 辅助函数：处理文件参数（支持 base64 或 URL）
  const processFileParam = async (value) => {
    if (!value) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    if (value.includes('base64,')) {
      return value;
    }
    if (/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
      return \`data:image/png;base64,\${value}\`;
    }
    return value;
  };
`;

/**
 * Returns { definition, handler } as formatted source, ready to drop into the
 * editors.
 *
 * NOTE: the generated handler embeds the Dify key, and handlers are served to
 * every browser that loads the app. Whoever can open the page can read it.
 */
export async function generateToolFromDify(apiKey) {
  if (!DIFY_URL) {
    throw new Error("VITE_DIFY_URL is not configured for this deployment.");
  }

  const headers = { Authorization: `Bearer ${apiKey}` };

  const infoRes = await fetch(`${DIFY_URL}/v1/info`, { headers });
  if (!infoRes.ok) {
    throw new Error(`Failed to get workflow info: ${infoRes.status}`);
  }
  const { name, description = "" } = await infoRes.json();

  const paramsRes = await fetch(`${DIFY_URL}/v1/parameters`, { headers });
  if (!paramsRes.ok) {
    throw new Error(`Failed to get parameters: ${paramsRes.status}`);
  }
  const formConfig = (await paramsRes.json()).user_input_form ?? [];

  const properties = {};
  const required = [];
  let hasFileParam = false;

  for (const item of formConfig) {
    const [type, config] = Object.entries(item)[0];
    properties[config.variable] = toSchemaProperty(type, config);
    if (config.required) required.push(config.variable);
    if (type === "file" || type === "file-list") hasFileParam = true;
  }

  const definition = {
    name: name || "run_workflow",
    description,
    parameters: { type: "object", properties, required },
  };

  const inputs = formConfig
    .map((item) => {
      const [type, config] = Object.entries(item)[0];
      return type === "file" || type === "file-list"
        ? `${config.variable}: await processFileParam(${config.variable})`
        : `${config.variable}: ${config.variable}`;
    })
    .join(",\n    ");

  const handler = `async ({ ${Object.keys(properties).join(", ")} }) => {${
    hasFileParam ? FILE_HELPER : ""
  }
  const processedInputs = {
    ${inputs}
  };

  const res = await fetch("${DIFY_URL}/v1/workflows/run", {
    method: "POST",
    headers: {
      "Authorization": "Bearer ${apiKey}",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: processedInputs,
      response_mode: "blocking",
      user: "abc-123"
    })
  });
  if (!res.ok)
    throw new Error("Request failed: " + res.status);
  return await res.text();
}`;

  return { definition: JSON.stringify(definition, null, 2), handler };
}
