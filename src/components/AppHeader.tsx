import { formatGeneratedAt, formatIconCount } from "../utils/format";

export function AppHeader({
  generatedAt,
  iconCount,
}: {
  generatedAt: string | null;
  iconCount: number;
}) {
  return (
    <header className="app-header">
      <div>
        <h1>Icon View</h1>
        <p>React Native SVG icon catalog</p>
      </div>
      <div className="scan-meta" aria-label="Catalog metadata">
        <strong>{formatIconCount(iconCount)}</strong>
        <span>{formatGeneratedAt(generatedAt)}</span>
      </div>
    </header>
  );
}
