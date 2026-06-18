export type AppTab = "catalog" | "converter";

export function AppTabs({
  activeTab,
  onChange,
}: {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}) {
  return (
    <nav className="app-tabs" aria-label="Main views">
      <button
        className={activeTab === "catalog" ? "active" : undefined}
        type="button"
        onClick={() => onChange("catalog")}
      >
        Icon catalog
      </button>
      <button
        className={activeTab === "converter" ? "active" : undefined}
        type="button"
        onClick={() => onChange("converter")}
      >
        SVG to RN JSX
      </button>
    </nav>
  );
}
