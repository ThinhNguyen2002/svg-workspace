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
  return normalizeRelativePath(relativePath).replace(/\.[jt]sx$/, '');
}

export function makeImportSnippet(componentName: string, relativePath: string): string {
  return `import { ${componentName} } from '@/icons/${stripExtension(relativePath)}';`;
}
