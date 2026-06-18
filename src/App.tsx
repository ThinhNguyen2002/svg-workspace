import { useMemo, useState } from 'react';
import catalog from './generated/icons.json';
import type { IconCatalog, IconRecord } from './types';

const iconCatalog = catalog as IconCatalog;

export default function App() {
  return <IconViewer catalog={iconCatalog} />;
}

export function IconViewer({ catalog }: { catalog: IconCatalog }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedName, setSelectedName] = useState<string | null>(catalog.icons[0]?.name ?? null);
  const [copied, setCopied] = useState<string | null>(null);

  const categories = useMemo(() => {
    return ['all', ...Array.from(new Set(catalog.icons.map((icon) => icon.category))).sort()];
  }, [catalog.icons]);

  const visibleIcons = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return catalog.icons.filter((icon) => {
      const matchesQuery = normalizedQuery === '' || icon.name.toLowerCase().includes(normalizedQuery);
      const matchesCategory = category === 'all' || icon.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [catalog.icons, category, query]);

  const selectedIcon = visibleIcons.find((icon) => icon.name === selectedName) ?? visibleIcons[0] ?? null;

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
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
          <span>{catalog.sourceDir ?? 'No source directory'}</span>
          <span>{formatGeneratedAt(catalog.generatedAt)}</span>
        </div>
      </header>

      {catalog.setupError ? <SetupError message={catalog.setupError} /> : null}

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
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? 'All categories' : item}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="viewer-layout">
        <IconGrid icons={visibleIcons} selectedName={selectedIcon?.name ?? null} onSelect={setSelectedName} />
        <DetailPanel icon={selectedIcon} copied={copied} onCopy={copy} />
      </section>

      {visibleIcons.length === 0 ? (
        <section className="empty-state">
          <h2>No matching icons</h2>
          <p>Adjust search or category filters.</p>
        </section>
      ) : null}

      <UnsupportedFiles errors={catalog.errors} />
    </main>
  );
}

function formatIconCount(count: number) {
  return `${count} ${count === 1 ? 'icon' : 'icons'}`;
}

function formatGeneratedAt(value: string | null) {
  if (!value) {
    return 'Not generated';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
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
  selectedName,
  onSelect
}: {
  icons: IconRecord[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <section className="icon-grid" aria-label="Icon grid">
      {icons.map((icon) => (
        <button
          className={icon.name === selectedName ? 'icon-card selected' : 'icon-card'}
          key={icon.filePath}
          type="button"
          onClick={() => onSelect(icon.name)}
        >
          <span className="icon-preview" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon.svg }} />
          <span className="icon-name">{icon.name}</span>
          <span className="icon-category">{icon.category}</span>
        </button>
      ))}
    </section>
  );
}

function DetailPanel({
  icon,
  copied,
  onCopy
}: {
  icon: IconRecord | null;
  copied: string | null;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  if (!icon) {
    return (
      <aside className="detail-panel" role="region" aria-label="Selected icon details">
        <h2>No icon selected</h2>
      </aside>
    );
  }

  return (
    <aside className="detail-panel" role="region" aria-label="Selected icon details">
      <div className="detail-preview" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon.svg }} />
      <h2>{icon.name}</h2>
      <dl>
        <dt>Category</dt>
        <dd>{icon.category}</dd>
        <dt>Path</dt>
        <dd>{icon.filePath}</dd>
      </dl>
      <button type="button" onClick={() => onCopy(icon.name, 'component name')}>
        Copy component name
      </button>
      <button type="button" onClick={() => onCopy(icon.importSnippet, 'import snippet')}>
        Copy import snippet
      </button>
      {copied ? (
        <p className="copy-status" role="status">
          Copied {copied}.
        </p>
      ) : null}
    </aside>
  );
}

function UnsupportedFiles({ errors }: { errors: IconCatalog['errors'] }) {
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
