import "../styles/Toggle.scss";

/**
 * The pill switch from the original project.
 *
 * Purely CSS-driven off `data-enabled` - the original measured the labels with
 * refs to slide the background, but that code was already commented out.
 */
export default function Toggle({ enabled, labels = [" ", " "], onChange }) {
  return (
    <div
      data-component="Toggle"
      data-enabled={String(Boolean(enabled))}
      onClick={() => onChange(!enabled)}
    >
      <div className="label left">{labels[0]}</div>
      <div className="label right">{labels[1]}</div>
      <div className="toggle-background"></div>
    </div>
  );
}
