export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header-main">
        <div className="app-mark" aria-hidden="true">
          <img src="/favicon.svg" alt="" />
        </div>
        <div className="app-heading">
          <div className="app-title">
            <h1>
              <span>SVG</span>
              <span>workspace</span>
            </h1>
          </div>
          <p>
            Browse SVG assets and components, inspect usage, and convert files
            for React Native or React.
          </p>
        </div>
      </div>
    </header>
  );
}
