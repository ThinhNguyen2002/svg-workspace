export type IconPropUsage = {
  name: string;
  value: string | null;
  shorthand: boolean;
};

export type IconSourceType = 'react-native' | 'react' | 'svg-file';

export type IconRecord = {
  name: string;
  category: string;
  filePath: string;
  sourceType?: IconSourceType;
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
  sourceTypes?: IconSourceType[];
  icons: IconRecord[];
  errors: IconScanError[];
};

export type ParsedIconResult =
  | { ok: true; icon: Omit<IconRecord, 'category' | 'filePath' | 'importSnippet'> }
  | { ok: false; reason: string };
