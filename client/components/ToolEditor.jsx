import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { generateToolFromDify } from "../lib/dify";
import "../styles/ToolsDialog.scss";

// Drives validation and completion in the definition editor.
const TOOL_CONFIG_SCHEMA = {
  type: "object",
  required: ["name", "description", "parameters"],
  properties: {
    name: {
      type: "string",
      description: "Tool name, should be short and descriptive",
    },
    description: {
      type: "string",
      description:
        "Detailed description of the tool, explaining its function and usage",
    },
    parameters: {
      type: "object",
      required: ["type", "properties"],
      properties: {
        type: {
          type: "string",
          enum: ["object"],
          description: "Parameter type, currently only object type is supported",
        },
        properties: {
          type: "object",
          description: "Property definition of tool parameters",
          additionalProperties: {
            type: "object",
            required: ["type"],
            properties: {
              type: {
                type: "string",
                enum: ["string", "number", "boolean", "array", "object"],
                description: "Data type of the parameter",
              },
              description: {
                type: "string",
                description: "Detailed description of the parameter",
              },
              enum: {
                type: "array",
                description: "Optional value list, if applicable",
              },
            },
          },
        },
        required: {
          type: "array",
          items: { type: "string" },
          description: "List of required parameter names",
        },
      },
    },
  },
};

// The starting point for a new tool, kept as it was in the original: the empty
// property is a placeholder to fill in, not a mistake.
const EMPTY_DEFINITION = `{
  "name": "",
  "description": "",
  "parameters": {
    "type": "object",
    "properties": {
      "": {
        "type": "string",
        "description": ""
      }
    },
    "required": []
  }
}`;

const EMPTY_HANDLER = `async ({ }) => {
}`;

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 14,
  tabSize: 2,
  formatOnPaste: true,
  automaticLayout: true,
};

const TYPES_FILE = "ts:filename/tool-handler.d.ts";

/**
 * Turn the parameters in the definition into a TypeScript interface, so the
 * handler editor can complete on them.
 */
function buildParamsInterface(definitionSource) {
  const fallback = "interface Params { [key: string]: any }";

  try {
    const parsed = JSON.parse(definitionSource);
    const properties = parsed?.parameters?.properties ?? {};
    const required = parsed?.parameters?.required ?? [];
    const entries = Object.entries(properties).filter(([name]) => name);
    if (entries.length === 0) return fallback;

    const lines = entries.map(([name, param]) => {
      const optional = required.includes(name) ? "" : "?";
      const description = param?.description || `${name} parameter`;
      return `    /** ${description} */\n    ${name}${optional}: ${param?.type || "any"};`;
    });
    return `interface Params {\n${lines.join("\n")}\n}`;
  } catch {
    // Mid-edit the JSON is often invalid; fall back rather than blow up.
    return fallback;
  }
}

/**
 * Editor for a single managed tool.
 *
 * `handler` is JavaScript source that the app evaluates at runtime - see the
 * security note on compileHandler in lib/tools/index.js.
 */
export default function ToolEditor({
  open,
  tool,
  isSessionActive,
  onClose,
  onSave,
}) {
  const dialogRef = useRef(null);
  const monacoRef = useRef(null);
  const [definition, setDefinition] = useState(EMPTY_DEFINITION);
  const [handler, setHandler] = useState(EMPTY_HANDLER);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      dialogRef.current?.close();
      return;
    }

    setDefinition(tool ? JSON.stringify(tool.definition, null, 2) : EMPTY_DEFINITION);
    setHandler(tool?.handler || EMPTY_HANDLER);
    setApiKey("");
    setError(null);
    dialogRef.current?.showModal();
  }, [open, tool]);

  // Keep the handler editor's completions in step with the parameters as they
  // are edited next door.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      `
        /**
         * Tool parameter object, generated from the JSON definition.
         */
        ${buildParamsInterface(definition)}

        /**
         * Tool handler function
         * @param params Parameter object received from the model
         * @returns Response result
         */
        declare function handler(params: Params): Promise<any>;
      `,
      TYPES_FILE,
    );
  }, [definition]);

  function handleJsonWillMount(monaco) {
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemas: [
        {
          uri: "http://myserver/tool-schema.json",
          fileMatch: ["*"],
          schema: TOOL_CONFIG_SCHEMA,
        },
      ],
    });
  }

  function handleJsWillMount(monaco) {
    monacoRef.current = monaco;

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      typeRoots: ["node_modules/@types"],
    });

    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      `${buildParamsInterface(definition)}
       declare function handler(params: Params): Promise<any>;`,
      TYPES_FILE,
    );
  }

  async function handleGenerate() {
    setError(null);
    try {
      const generated = await generateToolFromDify(apiKey.trim());
      setDefinition(generated.definition);
      setHandler(generated.handler);
    } catch (generateError) {
      setError(String(generateError.message ?? generateError));
    }
  }

  async function handleSave() {
    let parsed;
    try {
      parsed = JSON.parse(definition);
    } catch (parseError) {
      setError(`Invalid config: ${parseError.message}`);
      return;
    }

    if (!parsed.name || typeof parsed.name !== "string") {
      setError("Invalid config: Tool name must be a string");
      return;
    }
    if (!parsed.description || typeof parsed.description !== "string") {
      setError("Invalid config: Tool description must be a string");
      return;
    }

    // Compile it here rather than discovering it is broken mid-call.
    try {
      // eslint-disable-next-line no-new-func
      new Function(`return ${handler}`);
    } catch (handlerError) {
      setError(`Invalid handler function: ${handlerError.message}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // onSave returns a string when it rejects the tool, e.g. a name clash.
      const message = await onSave({
        definition: parsed,
        handler,
        disabled: tool?.disabled ?? false,
      });
      if (message) setError(message);
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="tools-dialog">
      <div className="tools-dialog-header">
        <h2>Tool Configuration</h2>
        <button onClick={onClose} className="close-button">
          ×
        </button>
      </div>

      <div className="tools-dialog-content">
        <div className="key-input-section">
          <label>Import from Dify</label>
          <input
            type="text"
            placeholder="Enter ApiKey..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="key-input"
          />
          <button
            onClick={handleGenerate}
            className="generate-button"
            disabled={!apiKey.trim()}
          >
            Generate
          </button>
        </div>

        <div className="editor-sections">
          <div className="editor-section">
            <h3>Tool Definition (JSON)</h3>
            <div className="editor-container">
              <Editor
                defaultLanguage="json"
                value={definition}
                onChange={(value) => {
                  setDefinition(value ?? "");
                  setError(null);
                }}
                theme="vs-dark"
                beforeMount={handleJsonWillMount}
                options={EDITOR_OPTIONS}
              />
            </div>
          </div>

          <div className="editor-section">
            <h3>Handler Function (JavaScript)</h3>
            <div className="editor-container">
              <Editor
                defaultLanguage="javascript"
                value={handler}
                onChange={(value) => setHandler(value ?? "")}
                theme="vs-dark"
                beforeMount={handleJsWillMount}
                options={EDITOR_OPTIONS}
              />
            </div>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
      </div>

      <div className="tools-dialog-footer">
        <button
          data-component="Button"
          className="ok"
          onClick={handleSave}
          disabled={isSessionActive}
        >
          {isSessionActive
            ? "Cannot save while connected"
            : saving
              ? "Saving..."
              : "Save"}
        </button>
        &nbsp;
        <button data-component="Button" className="cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
