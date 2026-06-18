import type { IconRecord } from "../../types";

export function DetailPanel({
  icon,
  onCopy,
}: {
  icon: IconRecord | null;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  if (!icon) {
    return (
      <aside
        className="detail-panel"
        role="region"
        aria-label="Selected icon details"
      >
        <h2>No icon selected</h2>
      </aside>
    );
  }

  const usageExample = buildUsageExample(icon);

  return (
    <aside
      className="detail-panel"
      role="region"
      aria-label="Selected icon details"
    >
      <div
        className="detail-preview"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: icon.svg }}
      />
      <h2>{icon.name}</h2>
      <dl>
        <dt>Category</dt>
        <dd>{icon.category}</dd>
        <dt>Path</dt>
        <dd>{icon.filePath}</dd>
      </dl>

      <div className="usage-block">
        <div className="usage-block-header">
          <span>Usage</span>
          <button
            aria-label="Copy usage example"
            type="button"
            onClick={() => onCopy(usageExample, "usage example")}
          >
            ⧉
          </button>
        </div>
        <pre>
          <code>{usageExample}</code>
        </pre>
      </div>
      <button type="button" onClick={() => onCopy(icon.name, "component name")}>
        Copy component name
      </button>
      <button
        type="button"
        onClick={() => onCopy(icon.importSnippet, "import snippet")}
      >
        Copy import snippet
      </button>
    </aside>
  );
}

function buildUsageExample(icon: IconRecord): string {
  const props = icon.props ?? [];

  if (props.length === 0) {
    return `<${icon.name} />`;
  }

  return [
    `<${icon.name}`,
    ...props.map((prop) => {
      if (prop.shorthand) {
        return `  ${prop.name}`;
      }

      return `  ${prop.name}=${prop.value ?? "{/* value */}"}`;
    }),
    "/>",
  ].join("\n");
}
