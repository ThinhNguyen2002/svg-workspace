import catalog from './generated/icons.json';
import type { IconCatalog } from './types';

const iconCatalog = catalog as IconCatalog;

export default function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Icon View</h1>
          <p>React Native SVG icon catalog</p>
        </div>
      </header>

      {iconCatalog.setupError ? (
        <section className="empty-state">
          <h2>Scanner setup required</h2>
          <p>{iconCatalog.setupError}</p>
        </section>
      ) : null}
    </main>
  );
}
