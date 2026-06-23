export type AppTab = "catalog" | "converter" | "guide";

export const appRoutes: Record<AppTab, string> = {
  catalog: "/",
  converter: "/converter",
  guide: "/guide",
};

export function AppTabs({
  activeTab,
  onNavigate,
}: {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
}) {
  return (
    <nav className="app-tabs" aria-label="Main views">
      <a
        className={activeTab === "catalog" ? "active" : undefined}
        href={appRoutes.catalog}
        onClick={(event) => {
          event.preventDefault();
          onNavigate("catalog");
        }}
      >
        Icon catalog
      </a>
      <a
        className={activeTab === "converter" ? "active" : undefined}
        href={appRoutes.converter}
        onClick={(event) => {
          event.preventDefault();
          onNavigate("converter");
        }}
      >
        SVG converter
      </a>
      <a
        className={activeTab === "guide" ? "active" : undefined}
        href={appRoutes.guide}
        onClick={(event) => {
          event.preventDefault();
          onNavigate("guide");
        }}
      >
        Guide
      </a>
    </nav>
  );
}
