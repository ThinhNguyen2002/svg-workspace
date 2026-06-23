import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
// @ts-ignore
import "react-toastify/dist/ReactToastify.css";
import { AppHeader } from "./components/AppHeader";
import { AppTabs, appRoutes, type AppTab } from "./components/AppTabs";
import { SetupError } from "./components/SetupError";
import { IconCatalogView } from "./features/icon-catalog/IconCatalogView";
import { SourceControls } from "./features/icon-catalog/SourceControls";
import catalog from "./generated/icons.json";
import type { IconCatalog } from "./types";
import { formatIconCount } from "./utils/format";
import {
  activeSourceKey,
  readApiResponse,
  readStoredSources,
  rememberSource,
} from "./utils/sourceStorage";

const iconCatalog = catalog as IconCatalog;
const SvgToReactNativeConverter = lazy(() =>
  import("./features/svg-converter/SvgToReactNativeConverter").then(
    (module) => ({
      default: module.SvgToReactNativeConverter,
    }),
  ),
);
const GuidePage = lazy(() =>
  import("./features/guide/GuidePage").then((module) => ({
    default: module.GuidePage,
  })),
);

export default function App() {
  return <IconViewer catalog={iconCatalog} />;
}

export function IconViewer({ catalog }: { catalog: IconCatalog }) {
  const [activeTab, setActiveTab] = useState<AppTab>(() =>
    getTabFromPath(window.location.pathname),
  );
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
      ...Array.from(
        new Set(activeCatalog.icons.map((icon) => icon.category)),
      ).sort(),
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

  useEffect(() => {
    const storedSources = readStoredSources();
    const storedActiveSource = localStorage.getItem(activeSourceKey);

    setRecentSources(storedSources);
    setActiveSource(storedActiveSource);

    if (storedActiveSource) {
      void scanSource(storedActiveSource);
    }
  }, []);

  useEffect(() => {
    function syncRoute() {
      setActiveTab(getTabFromPath(window.location.pathname));
    }

    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${label}.`);
  }

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
    localStorage.setItem(activeSourceKey, sourceDir);
    setActiveSource(sourceDir);
    await scanFromApi("/api/scan-icon-folder", { sourceDir });
  }

  function clearSource() {
    localStorage.removeItem(activeSourceKey);
    setActiveSource(null);
    setActiveCatalog(catalog);
    setSelectedFilePath(catalog.icons[0]?.filePath ?? null);
  }

  function navigateTo(tab: AppTab) {
    const nextPath = appRoutes[tab];
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }

    setActiveTab(tab);
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
      toast.success(
        `Scanned ${formatIconCount(payload.catalog.icons.length)}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <main className="app-shell">
      <AppHeader />

      {activeCatalog.setupError ? (
        <SetupError message={activeCatalog.setupError} />
      ) : null}

      <div className="app-nav-row">
        <AppTabs activeTab={activeTab} onNavigate={navigateTo} />
        {activeTab === "catalog" ? (
          <SourceControls
            activeSource={activeSource}
            isScanning={isScanning}
            onChooseSourceFolder={chooseSourceFolder}
            onClearSource={clearSource}
            onRescanSourceFolder={rescanSourceFolder}
            onScanSource={(sourceDir) => {
              void scanSource(sourceDir);
            }}
            recentSources={recentSources}
          />
        ) : null}
      </div>

      {activeTab === "catalog" ? (
        <IconCatalogView
          category={category}
          categories={categories}
          errors={activeCatalog.errors}
          iconCount={visibleIcons.length}
          onCategoryChange={setCategory}
          onCopy={copy}
          onQueryChange={setQuery}
          onSelectIcon={setSelectedFilePath}
          query={query}
          selectedIcon={selectedIcon}
          visibleIcons={visibleIcons}
        />
      ) : activeTab === "converter" ? (
        <Suspense fallback={<PageLoading />}>
          <SvgToReactNativeConverter onCopy={copy} />
        </Suspense>
      ) : (
        <Suspense fallback={<PageLoading />}>
          <GuidePage />
        </Suspense>
      )}

      <ToastContainer
        autoClose={2200}
        closeOnClick
        hideProgressBar
        newestOnTop
        position="top-right"
      />
    </main>
  );
}

function getTabFromPath(pathname: string): AppTab {
  if (pathname === appRoutes.converter) {
    return "converter";
  }

  if (pathname === appRoutes.guide) {
    return "guide";
  }

  return "catalog";
}

function PageLoading() {
  return (
    <section className="empty-state" aria-live="polite">
      <h2>Loading page</h2>
      <p>Preparing view.</p>
    </section>
  );
}
