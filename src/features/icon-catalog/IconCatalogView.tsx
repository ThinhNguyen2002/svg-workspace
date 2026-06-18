import type { IconCatalog, IconRecord } from "../../types";
import { IconGrid } from "./IconGrid";
import { DetailPanel } from "./DetailPanel";

export function IconCatalogView({
  activeSource,
  category,
  categories,
  errors,
  isScanning,
  onCategoryChange,
  onChooseSourceFolder,
  onClearSource,
  onCopy,
  onQueryChange,
  onRescanSourceFolder,
  onScanSource,
  onSelectIcon,
  query,
  recentSources,
  selectedIcon,
  visibleIcons,
}: {
  activeSource: string | null;
  category: string;
  categories: string[];
  errors: IconCatalog["errors"];
  isScanning: boolean;
  onCategoryChange: (category: string) => void;
  onChooseSourceFolder: () => void;
  onClearSource: () => void;
  onCopy: (value: string, label: string) => Promise<void>;
  onQueryChange: (query: string) => void;
  onRescanSourceFolder: () => void;
  onScanSource: (sourceDir: string) => void;
  onSelectIcon: (filePath: string) => void;
  query: string;
  recentSources: string[];
  selectedIcon: IconRecord | null;
  visibleIcons: IconRecord[];
}) {
  return (
    <>
      <section className="source-row" aria-label="Icon source controls">
        <label>
          <span>Icon folder</span>
          <select
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
                {source}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onChooseSourceFolder} disabled={isScanning}>
          Choose folder
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

      <section className="tool-row" aria-label="Icon filters">
        <label>
          <span>Search icons</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search by name"
            type="search"
          />
        </label>
        <label>
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => onCategoryChange(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All categories" : item}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="viewer-layout">
        <IconGrid
          icons={visibleIcons}
          selectedFilePath={selectedIcon?.filePath ?? null}
          onSelect={onSelectIcon}
          autoExpand={query.trim().length > 0}
        />
        <DetailPanel icon={selectedIcon} onCopy={onCopy} />
      </section>

      {visibleIcons.length === 0 ? (
        <section className="empty-state">
          <h2>No matching icons</h2>
          <p>Adjust search or category filters.</p>
        </section>
      ) : null}

      <UnsupportedFiles errors={errors} />
    </>
  );
}

function UnsupportedFiles({ errors }: { errors: IconCatalog["errors"] }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <section className="unsupported-files">
      <h2>Unsupported files</h2>
      <ul>
        {errors.map((error) => (
          <li key={error.filePath}>
            <strong>{error.filePath}</strong>
            <span>{error.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
