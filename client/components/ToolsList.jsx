import { useCallback, useEffect, useState } from "react";
import Toggle from "./Toggle";
import ToolEditor from "./ToolEditor";
import { fetchAllTools, saveTools } from "../lib/tools-api";
import "../styles/ToolsList.scss";
import "../styles/ToolsList.add.scss";

/**
 * Management UI for the tools held by the Tools service.
 *
 * The service stores one array for the whole set, so each change writes the
 * full list back and then reloads.
 */
export default function ToolsList({ open, onClose, isSessionActive }) {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTools(await fetchAllTools());
    } catch (loadError) {
      setError(String(loadError.message ?? loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  async function commit(nextTools) {
    await saveTools(nextTools);
    await load();
  }

  async function handleSaveTool(tool) {
    const clashes = tools.some(
      (existing) =>
        existing.definition.name === tool.definition.name &&
        existing.definition.name !== editing?.definition.name,
    );
    if (clashes) {
      return `Tool name "${tool.definition.name}" already exists. Please use another name.`;
    }

    const nextTools = editing
      ? tools.map((existing) =>
          existing.definition.name === editing.definition.name ? tool : existing,
        )
      : [...tools, tool];

    await commit(nextTools);
    setIsEditorOpen(false);
    setEditing(null);
    return undefined;
  }

  async function handleDelete(name) {
    if (!window.confirm(`Delete the tool "${name}"?`)) return;
    try {
      await commit(tools.filter((tool) => tool.definition.name !== name));
    } catch (deleteError) {
      setError(String(deleteError.message ?? deleteError));
    }
  }

  async function handleToggleDisable(name) {
    try {
      await commit(
        tools.map((tool) =>
          tool.definition.name === name
            ? { ...tool, disabled: !tool.disabled }
            : tool,
        ),
      );
    } catch (toggleError) {
      setError(String(toggleError.message ?? toggleError));
    }
  }

  return (
    <div className="tools-list-container">
      <div className="tools-list-header">
        <h2>Tools List</h2>
        <div className="tools-list-actions">
          <button
            data-component="Button"
            className="refresh-button"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            data-component="Button"
            className="ok add-button"
            onClick={() => {
              setEditing(null);
              setIsEditorOpen(true);
            }}
            disabled={isSessionActive}
          >
            Add Tool
          </button>
          <button
            data-component="Button"
            className="cancel close-button"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading-indicator">Loading...</div>
      ) : tools.length === 0 ? (
        <div className="empty-state">
          No tool configuration. Click "Add Tool" to create one.
        </div>
      ) : (
        <div className="tools-grid">
          {tools.map((tool) => (
            <div
              key={tool.definition.name}
              className={`tool-card ${tool.disabled ? "tool-card-disabled" : ""}`}
            >
              <div className="tool-card-header">
                <h3 className="tool-name">{tool.definition.name}</h3>
                <div className="tool-actions">
                  <button
                    data-component="Button"
                    className="edit-button"
                    onClick={() => {
                      setEditing(tool);
                      setIsEditorOpen(true);
                    }}
                    disabled={isSessionActive}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    data-component="Button"
                    className="delete-button"
                    onClick={() => handleDelete(tool.definition.name)}
                    disabled={isSessionActive}
                    title="Delete"
                  >
                    🗑️
                  </button>
                  <Toggle
                    enabled={!tool.disabled}
                    onChange={() => handleToggleDisable(tool.definition.name)}
                  />
                </div>
              </div>

              <div className="tool-description">{tool.definition.description}</div>

              <div className="tool-params">
                <strong>Parameters:</strong>
                <ul>
                  {Object.keys(tool.definition.parameters?.properties ?? {}).map(
                    (key) => (
                      <li key={key}>
                        <code>{key}</code>
                        {tool.definition.parameters?.required?.includes(key) && (
                          <span className="required-badge">Required</span>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      <ToolEditor
        open={isEditorOpen}
        tool={editing}
        isSessionActive={isSessionActive}
        onClose={() => {
          setIsEditorOpen(false);
          setEditing(null);
        }}
        onSave={handleSaveTool}
      />
    </div>
  );
}
