import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { deriveCategory, makeComponentNameFromPath, makeImportSnippet, normalizeRelativePath } from './path-utils';
import { parseIconSource } from './tsx-parser';
import type { IconCatalog, IconSourceType } from './types';

export const defaultOutputPath = path.resolve('src/generated/icons.json');

export async function scanIconDirectory(sourceDir: string): Promise<IconCatalog> {
  const absoluteSourceDir = path.resolve(sourceDir);
  const entries = await fg(['**/*.{tsx,jsx,svg}'], {
    cwd: absoluteSourceDir,
    onlyFiles: true,
    dot: false
  });

  const catalog: IconCatalog = {
    sourceDir: absoluteSourceDir,
    generatedAt: new Date().toISOString(),
    status: 'ok',
    setupError: null,
    icons: [],
    errors: []
  };

  for (const entry of entries.sort()) {
    const relativePath = normalizeRelativePath(entry);
    const absolutePath = path.join(absoluteSourceDir, relativePath);
    const source = await fs.readFile(absolutePath, 'utf8');
    const parsed = relativePath.toLowerCase().endsWith('.svg')
      ? parseRawSvgSource(source, relativePath)
      : parseIconSource(source, {
          filePath: absolutePath,
          sourceDir: absoluteSourceDir,
          visitedFiles: new Set([absolutePath])
        });

    if (!parsed.ok) {
      catalog.errors.push({ filePath: relativePath, reason: parsed.reason });
      continue;
    }

    catalog.icons.push({
      name: parsed.icon.name,
      category: deriveCategory(relativePath),
      filePath: relativePath,
      sourceType: parsed.icon.sourceType,
      svg: parsed.icon.svg,
      importSnippet: makeImportSnippet(parsed.icon.name, relativePath, parsed.icon.sourceType === 'svg-file'),
      props: 'props' in parsed.icon ? parsed.icon.props : undefined
    });
  }

  catalog.sourceTypes = Array.from(
    new Set(catalog.icons.map((icon) => icon.sourceType).filter(isIconSourceType))
  ).sort();

  return catalog;
}

function isIconSourceType(value: IconSourceType | undefined): value is IconSourceType {
  return value !== undefined;
}

function parseRawSvgSource(source: string, relativePath: string) {
  const svg = source
    .replace(/^\s*<\?xml[\s\S]*?\?>\s*/i, '')
    .replace(/^\s*<!doctype[\s\S]*?>\s*/i, '')
    .replace(/^\s*<!--[\s\S]*?-->\s*/g, '')
    .trim();

  if (!/^<svg[\s>]/i.test(svg)) {
    return { ok: false as const, reason: 'Raw SVG file must start with <svg>' };
  }

  return {
    ok: true as const,
    icon: {
      name: makeComponentNameFromPath(relativePath),
      sourceType: 'svg-file' as const,
      svg
    }
  };
}

export async function writeCatalogForSourceDir(
  sourceDir: string | undefined,
  outputPath = defaultOutputPath
): Promise<IconCatalog> {
  if (!sourceDir) {
    const message = 'RN_ICON_SOURCE_DIR is not set.';
    const catalog = makeSetupErrorCatalog(null, message);
    await writeCatalog(outputPath, catalog);
    throw new Error(message);
  }

  const absoluteSourceDir = path.resolve(sourceDir);

  try {
    const stat = await fs.stat(absoluteSourceDir);
    if (!stat.isDirectory()) {
      const message = `RN_ICON_SOURCE_DIR is not a directory: ${absoluteSourceDir}`;
      const catalog = makeSetupErrorCatalog(absoluteSourceDir, message);
      await writeCatalog(outputPath, catalog);
      throw new Error(message);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const message = `RN_ICON_SOURCE_DIR does not exist: ${absoluteSourceDir}`;
      const catalog = makeSetupErrorCatalog(absoluteSourceDir, message);
      await writeCatalog(outputPath, catalog);
      throw new Error(message);
    }

    throw error;
  }

  try {
    const catalog = await scanIconDirectory(absoluteSourceDir);
    await writeCatalog(outputPath, catalog);
    return catalog;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `Unable to scan icon source: ${detail}`;
    const catalog = makeSetupErrorCatalog(absoluteSourceDir, message);
    await writeCatalog(outputPath, catalog);
    throw new Error(message);
  }
}

async function writeCatalog(outputPath: string, catalog: IconCatalog): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

function makeSetupErrorCatalog(sourceDir: string | null, message: string): IconCatalog {
  return {
    sourceDir,
    generatedAt: new Date().toISOString(),
    status: 'setup-error',
    setupError: message,
    icons: [],
    errors: []
  };
}
