import { useEffect, useMemo, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import catalog from "./generated/icons.json";
import type { IconCatalog, IconRecord } from "./types";

const iconCatalog = catalog as IconCatalog;
const recentSourcesKey = "icon-view:recent-sources";
const activeSourceKey = "icon-view:active-source";

export default function App() {
  return <IconViewer catalog={iconCatalog} />;
}

export function IconViewer({ catalog }: { catalog: IconCatalog }) {
  const [activeCatalog, setActiveCatalog] = useState<IconCatalog>(catalog);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
    catalog.icons[0]?.filePath ?? null,
  );
  const [recentSources, setRecentSources] = useState<string[]>([]);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const categories = useMemo(() => {
    return [
      "all",
      ...Array.from(new Set(activeCatalog.icons.map((icon) => icon.category))).sort(),
    ];
  }, [activeCatalog.icons]);

  const visibleIcons = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return activeCatalog.icons.filter((icon) => {
      const matchesQuery =
        normalizedQuery === "" ||
        icon.name.toLowerCase().includes(normalizedQuery);
      const matchesCategory = category === "all" || icon.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [activeCatalog.icons, category, query]);

  const selectedIcon =
    visibleIcons.find((icon) => icon.filePath === selectedFilePath) ??
    visibleIcons[0] ??
    null;

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${label}.`);
  }

  useEffect(() => {
    const storedSources = readStoredSources();
    const storedActiveSource = localStorage.getItem(activeSourceKey);

    setRecentSources(storedSources);
    setActiveSource(storedActiveSource);

    if (storedActiveSource) {
      void scanSource(storedActiveSource);
    }
  }, []);

  async function chooseSourceFolder() {
    await scanFromApi("/api/select-icon-folder");
  }

  async function rescanSourceFolder() {
    if (!activeSource) {
      toast.info("Choose an icon folder first.");
      return;
    }

    await scanSource(activeSource);
  }

  async function scanSource(sourceDir: string) {
    await scanFromApi("/api/scan-icon-folder", { sourceDir });
  }

  async function scanFromApi(endpoint: string, body?: Record<string, string>) {
    setIsScanning(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await readApiResponse(response);

      if (!response.ok || !payload.catalog || !payload.sourceDir) {
        throw new Error(payload.error ?? "Unable to scan icon folder.");
      }

      const nextSources = rememberSource(payload.sourceDir);
      setRecentSources(nextSources);
      setActiveSource(payload.sourceDir);
      setActiveCatalog(payload.catalog);
      setSelectedFilePath(payload.catalog.icons[0]?.filePath ?? null);
      setCategory("all");
      setQuery("");
      localStorage.setItem(activeSourceKey, payload.sourceDir);
      toast.success(`Scanned ${formatIconCount(payload.catalog.icons.length)}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Icon View</h1>
          <p>React Native SVG icon catalog</p>
        </div>
        <div className="scan-meta" aria-label="Catalog metadata">
          <strong>{formatIconCount(visibleIcons.length)}</strong>
          <span>{formatGeneratedAt(activeCatalog.generatedAt)}</span>
        </div>
      </header>

      {activeCatalog.setupError ? <SetupError message={activeCatalog.setupError} /> : null}

      <section className="source-row" aria-label="Icon source controls">
        <label>
          <span>Icon folder</span>
          <select
            value={activeSource ?? ""}
            onChange={(event) => {
              const nextSource = event.target.value;
              setActiveSource(nextSource || null);
              if (nextSource) {
                localStorage.setItem(activeSourceKey, nextSource);
                void scanSource(nextSource);
              } else {
                localStorage.removeItem(activeSourceKey);
                setActiveCatalog(catalog);
                setSelectedFilePath(catalog.icons[0]?.filePath ?? null);
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
        <button type="button" onClick={chooseSourceFolder} disabled={isScanning}>
          Choose folder
        </button>
        <button
          aria-label="Re-scan icon folder"
          className="rescan-button"
          type="button"
          onClick={rescanSourceFolder}
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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
            type="search"
          />
        </label>
        <label>
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
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
          onSelect={setSelectedFilePath}
          autoExpand={query.trim().length > 0}
        />
        <DetailPanel icon={selectedIcon} onCopy={copy} />
      </section>

      {visibleIcons.length === 0 ? (
        <section className="empty-state">
          <h2>No matching icons</h2>
          <p>Adjust search or category filters.</p>
        </section>
      ) : null}

      <UnsupportedFiles errors={activeCatalog.errors} />
      <ToastContainer autoClose={2200} closeOnClick hideProgressBar newestOnTop position="bottom-right" />
    </main>
  );
}

async function readApiResponse(response: Response): Promise<{ sourceDir?: string; catalog?: IconCatalog; error?: string }> {
  const text = await response.text();

  if (!text.trim()) {
    return { error: `Empty response from ${response.url || "icon scanner API"}.` };
  }

  try {
    return JSON.parse(text) as { sourceDir?: string; catalog?: IconCatalog; error?: string };
  } catch {
    return { error: `Invalid response from icon scanner API: ${text.slice(0, 160)}` };
  }
}

function readStoredSources() {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentSourcesKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rememberSource(sourceDir: string) {
  const nextSources = [sourceDir, ...readStoredSources().filter((source) => source !== sourceDir)].slice(0, 8);
  localStorage.setItem(recentSourcesKey, JSON.stringify(nextSources));
  return nextSources;
}

function formatIconCount(count: number) {
  return `${count} ${count === 1 ? "icon" : "icons"}`;
}

function formatGeneratedAt(value: string | null) {
  if (!value) {
    return "Not generated";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function SetupError({ message }: { message: string }) {
  return (
    <section className="empty-state">
      <h2>Scanner setup required</h2>
      <p>{message}</p>
    </section>
  );
}

function IconGrid({
  icons,
  selectedFilePath,
  onSelect,
  autoExpand,
}: {
  icons: IconRecord[];
  selectedFilePath: string | null;
  onSelect: (filePath: string) => void;
  autoExpand: boolean;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const groupedIcons = useMemo(() => {
    const groups = new Map<string, IconRecord[]>();

    for (const icon of icons) {
      const group = groups.get(icon.category) ?? [];
      group.push(icon);
      groups.set(icon.category, group);
    }

    return Array.from(groups.entries()).sort(([first], [second]) =>
      first.localeCompare(second),
    );
  }, [icons]);

  function toggleCategory(category: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  return (
    <section className="icon-grid" aria-label="Icon grid">
      {groupedIcons.map(([categoryName, categoryIcons]) => (
        <section className="icon-category-group" key={categoryName}>
          <button
            aria-expanded={autoExpand || expandedCategories.has(categoryName)}
            className="category-toggle"
            type="button"
            onClick={() => toggleCategory(categoryName)}
          >
            <span>{categoryName}</span>
            <span>{formatIconCount(categoryIcons.length)}</span>
          </button>
          {autoExpand || expandedCategories.has(categoryName) ? (
            <div className="category-icon-grid">
              {categoryIcons.map((icon) => (
                <button
                  className={
                    icon.filePath === selectedFilePath
                      ? "icon-card selected"
                      : "icon-card"
                  }
                  key={icon.filePath}
                  type="button"
                  onClick={() => onSelect(icon.filePath)}
                >
                  <span
                    className="icon-preview"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: icon.svg }}
                  />
                  <span className="icon-name">{icon.name}</span>
                  <span className="icon-category">{icon.category}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </section>
  );
}

function DetailPanel({
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
