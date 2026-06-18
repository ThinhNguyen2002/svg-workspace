import { useEffect, useMemo, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AppHeader } from "./components/AppHeader";
import { AppTabs, type AppTab } from "./components/AppTabs";
import { SetupError } from "./components/SetupError";
import { IconCatalogView } from "./features/icon-catalog/IconCatalogView";
import { SvgToReactNativeConverter } from "./features/svg-converter/SvgToReactNativeConverter";
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

export default function App() {
  return <IconViewer catalog={iconCatalog} />;
}

export function IconViewer({ catalog }: { catalog: IconCatalog }) {
  const [activeTab, setActiveTab] = useState<AppTab>("catalog");
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

  useEffect(() => {
    const storedSources = readStoredSources();
    const storedActiveSource = localStorage.getItem(activeSourceKey);

    setRecentSources(storedSources);
    setActiveSource(storedActiveSource);

    if (storedActiveSource) {
      void scanSource(storedActiveSource);
    }
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
      <AppHeader
        generatedAt={activeCatalog.generatedAt}
        iconCount={visibleIcons.length}
      />

      {activeCatalog.setupError ? (
        <SetupError message={activeCatalog.setupError} />
      ) : null}

      <AppTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "catalog" ? (
        <IconCatalogView
          activeSource={activeSource}
          category={category}
          categories={categories}
          errors={activeCatalog.errors}
          isScanning={isScanning}
          onCategoryChange={setCategory}
          onChooseSourceFolder={chooseSourceFolder}
          onClearSource={clearSource}
          onCopy={copy}
          onQueryChange={setQuery}
          onRescanSourceFolder={rescanSourceFolder}
          onScanSource={(sourceDir) => {
            void scanSource(sourceDir);
          }}
          onSelectIcon={setSelectedFilePath}
          query={query}
          recentSources={recentSources}
          selectedIcon={selectedIcon}
          visibleIcons={visibleIcons}
        />
      ) : (
        <SvgToReactNativeConverter onCopy={copy} />
      )}

      <ToastContainer
        autoClose={2200}
        closeOnClick
        hideProgressBar
        newestOnTop
        position="bottom-right"
      />
    </main>
  );
}
