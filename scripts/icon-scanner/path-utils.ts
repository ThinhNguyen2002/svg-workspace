import path from 'node:path';

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function deriveCategory(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 1 ? segments[0] : 'uncategorized';
}

export function stripExtension(relativePath: string): string {
  return normalizeRelativePath(relativePath).replace(/\.(?:[jt]sx|svg)$/i, '');
}

export function makeImportSnippet(componentName: string, relativePath: string, importAsAsset = false): string {
  if (importAsAsset) {
    return `import ${componentName} from '@/icons/${normalizeRelativePath(relativePath)}';`;
  }

  return `import { ${componentName} } from '@/icons/${stripExtension(relativePath)}';`;
}

export function makeComponentNameFromPath(relativePath: string): string {
  const baseName = path.basename(stripExtension(relativePath));
  const words = baseName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  const name = words
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('');

  return name || 'SvgIcon';
}
