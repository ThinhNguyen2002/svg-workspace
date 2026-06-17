export type IconRecord = {
  name: string;
  category: string;
  filePath: string;
  svg: string;
  importSnippet: string;
};

export type IconScanError = {
  filePath: string;
  reason: string;
};

export type IconCatalog = {
  sourceDir: string | null;
  generatedAt: string | null;
  status: 'ok' | 'setup-error';
  setupError: string | null;
  icons: IconRecord[];
  errors: IconScanError[];
};
