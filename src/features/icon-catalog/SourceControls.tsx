import { formatStoredSourceLabel } from "../../utils/sourceStorage";

export function SourceControls({
  activeSource,
  isScanning,
  onChooseSourceFolder,
  onClearSource,
  onRescanSourceFolder,
  onScanSource,
  recentSources,
}: {
  activeSource: string | null;
  isScanning: boolean;
  onChooseSourceFolder: () => void;
  onClearSource: () => void;
  onRescanSourceFolder: () => void;
  onScanSource: (sourceDir: string) => void;
  recentSources: string[];
}) {
  return (
    <section className="source-controls" aria-label="Icon source controls">
      <label className="source-select">
        <span aria-hidden="true">
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M3.75 7.5C3.75 6.25736 4.75736 5.25 6 5.25H9.04386C9.6531 5.25 10.2359 5.49705 10.659 5.93498L12.25 7.5814H18C19.2426 7.5814 20.25 8.58876 20.25 9.8314V16.5C20.25 17.7426 19.2426 18.75 18 18.75H6C4.75736 18.75 3.75 17.7426 3.75 16.5V7.5Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </span>
        <select
          aria-label="Icon folder"
          value={activeSource ?? ""}
          onChange={(event) => {
            const nextSource = event.target.value;
            if (nextSource) {
              onScanSource(nextSource);
            } else {
              onClearSource();
            }
          }}
        >
          <option value="">Generated catalog</option>
          {recentSources.map((source) => (
            <option key={source} value={source}>
              {formatStoredSourceLabel(source)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onChooseSourceFolder}
        disabled={isScanning}
      >
        Choose
      </button>
      <button
        aria-label="Re-scan icon folder"
        className="rescan-button"
        type="button"
        onClick={onRescanSourceFolder}
        disabled={isScanning || !activeSource}
      >
        ↻
      </button>
    </section>
  );
}
