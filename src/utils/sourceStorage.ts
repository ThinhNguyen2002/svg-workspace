import type { IconCatalog } from "../types";

const recentSourcesKey = "icon-view:recent-sources";
export const activeSourceKey = "icon-view:active-source";
export const browserSourcePrefix = "browser:";

export async function readApiResponse(
  response: Response,
): Promise<{ sourceDir?: string; catalog?: IconCatalog; error?: string }> {
  const text = await response.text();

  if (!text.trim()) {
    return { error: `Empty response from ${response.url || "icon scanner API"}.` };
  }

  try {
    return JSON.parse(text) as {
      sourceDir?: string;
      catalog?: IconCatalog;
      error?: string;
    };
  } catch {
    return { error: `Invalid response from icon scanner API: ${text.slice(0, 160)}` };
  }
}

export function readStoredSources() {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentSourcesKey) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeStoredSources(sources: string[]) {
  localStorage.setItem(recentSourcesKey, JSON.stringify(sources));
}

export function rememberSource(sourceDir: string) {
  const nextSources = [
    sourceDir,
    ...readStoredSources().filter((source) => source !== sourceDir),
  ].slice(0, 8);
  localStorage.setItem(recentSourcesKey, JSON.stringify(nextSources));
  return nextSources;
}

export function makeBrowserSourceKey(label: string) {
  return `${browserSourcePrefix}${label}`;
}

export function isBrowserSource(source: string | null | undefined) {
  return Boolean(source?.startsWith(browserSourcePrefix));
}

export function isLikelyServerSource(source: string) {
  return source.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(source);
}

export function formatStoredSourceLabel(source: string) {
  return isBrowserSource(source)
    ? `${source.slice(browserSourcePrefix.length)} (browser)`
    : source;
}
