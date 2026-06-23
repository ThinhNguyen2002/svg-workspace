import type { IconCatalog, IconRecord } from "../../types";
import { IconGrid } from "./IconGrid";
import { DetailPanel } from "./DetailPanel";
import { formatIconCount } from "../../utils/format";

export function IconCatalogView({
  category,
  categories,
  errors,
  iconCount,
  onCategoryChange,
  onCopy,
  onQueryChange,
  onSelectIcon,
  query,
  selectedIcon,
  visibleIcons,
}: {
  category: string;
  categories: string[];
  errors: IconCatalog["errors"];
  iconCount: number;
  onCategoryChange: (category: string) => void;
  onCopy: (value: string, label: string) => Promise<void>;
  onQueryChange: (query: string) => void;
  onSelectIcon: (filePath: string) => void;
  query: string;
  selectedIcon: IconRecord | null;
  visibleIcons: IconRecord[];
}) {
  return (
    <>
      <section className="catalog-controls" aria-label="Icon catalog controls">
        <section className="tool-row" aria-label="Icon filters">
          <label className="control-field search-field">
            <span>Search icons</span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search by name"
              type="search"
            />
          </label>
          <label className="control-field category-field">
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
        <div className="catalog-summary">
          {errors.length > 0 ? (
            <a href="#unsupported-files">
              {errors.length} unsupported
            </a>
          ) : null}
          <div className="catalog-count-pill" aria-label="Visible icon count">
            <strong>{formatIconCount(iconCount)}</strong>
          </div>
        </div>
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
    <section className="unsupported-files" id="unsupported-files">
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
