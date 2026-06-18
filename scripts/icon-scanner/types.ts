export type IconPropUsage = {
  name: string;
  value: string | null;
  shorthand: boolean;
};

export type IconRecord = {
  name: string;
  category: string;
  filePath: string;
  svg: string;
  importSnippet: string;
  props?: IconPropUsage[];
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

export type ParsedIconResult =
  | { ok: true; icon: Omit<IconRecord, 'category' | 'filePath' | 'importSnippet'> }
  | { ok: false; reason: string };
