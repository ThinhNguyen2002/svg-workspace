# React Native SVG Icon Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Vite + React website that scans an external React Native SVG icon folder, generates `src/generated/icons.json`, and renders a searchable/filterable icon catalog with detail and copy actions.

**Architecture:** A Node scanner owns filesystem access, TSX/JSX parsing, SVG conversion, category derivation, and generated JSON output. The React app imports only `src/generated/icons.json`, so the browser never imports the external React Native app or evaluates arbitrary icon code. The generated JSON file always exists, including an empty fallback and setup-error states.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, Babel parser/traverse/types, fast-glob, dotenv, chokidar, concurrently, tsx.

---

## Source Spec

Implementation follows `docs/superpowers/specs/2026-06-17-icon-viewer-design.md`.

## Planned File Structure

- `package.json`: npm scripts and dependencies.
- `index.html`: Vite HTML entry.
- `vite.config.ts`: Vite and Vitest config.
- `tsconfig.json`: app TypeScript config.
- `tsconfig.node.json`: Node script TypeScript config.
- `.gitignore`: local/generated ignore rules.
- `.env.example`: documents `RN_ICON_SOURCE_DIR`.
- `src/main.tsx`: React entry.
- `src/App.tsx`: top-level viewer state and layout.
- `src/App.test.tsx`: UI behavior tests.
- `src/styles.css`: app styling.
- `src/types.ts`: generated JSON contract shared by UI.
- `src/generated/icons.json`: committed fallback data file.
- `scripts/icon-scanner/types.ts`: scanner data types.
- `scripts/icon-scanner/path-utils.ts`: path/category/import snippet utilities.
- `scripts/icon-scanner/svg-attributes.ts`: SVG element and prop conversion helpers.
- `scripts/icon-scanner/tsx-parser.ts`: AST parsing and SVG markup extraction.
- `scripts/icon-scanner/scan.ts`: filesystem scanner and generated JSON writer.
- `scripts/scan-icons.ts`: CLI entry for one-shot scans.
- `scripts/watch-icons.ts`: watch-mode scanner entry.
- `scripts/icon-scanner/__tests__/path-utils.test.ts`: utility tests.
- `scripts/icon-scanner/__tests__/tsx-parser.test.ts`: parser tests.
- `scripts/icon-scanner/__tests__/scan.test.ts`: scanner CLI behavior tests.
- `test/fixtures/icons/...`: sample supported and unsupported React Native SVG icon files.
- `test/setup.ts`: Testing Library setup.

## Task 1: Scaffold Vite React Project

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/types.ts`
- Create: `src/generated/icons.json`
- Create: `test/setup.ts`

- [ ] **Step 1: Initialize git if the workspace is still not a repo**

Run:

```bash
git status --short
```

Expected if not initialized:

```text
fatal: not a git repository (or any of the parent directories): .git
```

If that output appears, run:

```bash
git init
```

Expected:

```text
Initialized empty Git repository
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "icon-view",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "scan:icons": "tsx scripts/scan-icons.ts",
    "dev:watch": "concurrently \"npm run scan:icons -- --watch\" \"vite\""
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0",
    "typescript": "^5.8.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "dotenv": "^16.4.7",
    "fast-glob": "^3.3.3",
    "chokidar": "^4.0.3",
    "concurrently": "^9.1.2",
    "@babel/parser": "^7.26.0",
    "@babel/traverse": "^7.26.0",
    "@babel/types": "^7.26.0",
    "tsx": "^4.19.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/babel__traverse": "^7.20.6",
    "@types/node": "^22.10.7",
    "@types/react": "^19.0.7",
    "@types/react-dom": "^19.0.3",
    "jsdom": "^26.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Create Vite and TypeScript config files**

`vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true
  }
});
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "test"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["vite.config.ts", "scripts/**/*.ts"]
}
```

- [ ] **Step 4: Create base app files**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Icon View</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`src/types.ts`:

```ts
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
```

`src/generated/icons.json`:

```json
{
  "sourceDir": null,
  "generatedAt": null,
  "status": "setup-error",
  "setupError": "Run npm run scan:icons after setting RN_ICON_SOURCE_DIR in .env.",
  "icons": [],
  "errors": []
}
```

`src/App.tsx`:

```tsx
import catalog from './generated/icons.json';
import type { IconCatalog } from './types';

const iconCatalog = catalog as IconCatalog;

export default function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Icon View</h1>
          <p>React Native SVG icon catalog</p>
        </div>
      </header>

      {iconCatalog.setupError ? (
        <section className="empty-state">
          <h2>Scanner setup required</h2>
          <p>{iconCatalog.setupError}</p>
        </section>
      ) : null}
    </main>
  );
}
```

`src/styles.css`:

```css
:root {
  color: #202124;
  background: #f7f8fa;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 auto 20px;
  max-width: 1280px;
}

.app-header h1 {
  margin: 0;
  font-size: 28px;
}

.app-header p {
  margin: 4px 0 0;
  color: #5f6368;
}

.empty-state {
  max-width: 720px;
  margin: 80px auto;
  padding: 24px;
  border: 1px solid #dadce0;
  border-radius: 8px;
  background: #fff;
}
```

`test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

`.env.example`:

```bash
RN_ICON_SOURCE_DIR=/absolute/path/to/react-native-app/src/icons
```

`.gitignore`:

```gitignore
node_modules/
dist/
.env
.DS_Store
.superpowers/
```

- [ ] **Step 5: Install dependencies**

Run:

```bash
npm install
```

Expected:

```text
added
```

- [ ] **Step 6: Verify scaffold**

Run:

```bash
npm run build
```

Expected:

```text
vite build
built in
```

- [ ] **Step 7: Commit scaffold**

```bash
git add package.json package-lock.json index.html vite.config.ts tsconfig.json tsconfig.node.json .gitignore .env.example src test
git commit -m "chore: scaffold icon viewer app"
```

## Task 2: Add Scanner Path and Attribute Utilities

**Files:**
- Create: `scripts/icon-scanner/types.ts`
- Create: `scripts/icon-scanner/path-utils.ts`
- Create: `scripts/icon-scanner/svg-attributes.ts`
- Create: `scripts/icon-scanner/__tests__/path-utils.test.ts`

- [ ] **Step 1: Write failing utility tests**

`scripts/icon-scanner/__tests__/path-utils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveCategory, makeImportSnippet, normalizeRelativePath } from '../path-utils';
import { convertSvgAttributeName, isSupportedSvgElement } from '../svg-attributes';

describe('path utilities', () => {
  it('derives category from the first relative folder segment', () => {
    expect(deriveCategory('navigation/ArrowLeftIcon.tsx')).toBe('navigation');
    expect(deriveCategory('actions/CloseIcon.jsx')).toBe('actions');
    expect(deriveCategory('HomeIcon.tsx')).toBe('uncategorized');
  });

  it('normalizes platform separators to posix paths', () => {
    expect(normalizeRelativePath('navigation\\\\ArrowLeftIcon.tsx')).toBe('navigation/ArrowLeftIcon.tsx');
  });

  it('creates a default import snippet from component name and relative path', () => {
    expect(makeImportSnippet('ArrowLeftIcon', 'navigation/ArrowLeftIcon.tsx')).toBe(
      "import { ArrowLeftIcon } from '@/icons/navigation/ArrowLeftIcon';"
    );
  });
});

describe('svg attribute utilities', () => {
  it('recognizes supported React Native SVG element names', () => {
    expect(isSupportedSvgElement('Svg')).toBe(true);
    expect(isSupportedSvgElement('Path')).toBe(true);
    expect(isSupportedSvgElement('Text')).toBe(false);
  });

  it('converts React Native SVG prop names to web SVG attribute names', () => {
    expect(convertSvgAttributeName('strokeWidth')).toBe('stroke-width');
    expect(convertSvgAttributeName('fillRule')).toBe('fill-rule');
    expect(convertSvgAttributeName('stopColor')).toBe('stop-color');
    expect(convertSvgAttributeName('viewBox')).toBe('viewBox');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- scripts/icon-scanner/__tests__/path-utils.test.ts
```

Expected:

```text
FAIL
Cannot find module '../path-utils'
```

- [ ] **Step 3: Implement scanner shared types**

`scripts/icon-scanner/types.ts`:

```ts
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

export type ParsedIconResult =
  | { ok: true; icon: Omit<IconRecord, 'category' | 'filePath' | 'importSnippet'> }
  | { ok: false; reason: string };
```

- [ ] **Step 4: Implement path utilities**

`scripts/icon-scanner/path-utils.ts`:

```ts
import path from 'node:path';

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/').replace(/\\/g, '/');
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
```

- [ ] **Step 5: Implement SVG attribute utilities**

`scripts/icon-scanner/svg-attributes.ts`:

```ts
const supportedElements = new Set([
  'Svg',
  'Path',
  'Circle',
  'Rect',
  'Line',
  'Polyline',
  'Polygon',
  'G',
  'Defs',
  'ClipPath',
  'Mask',
  'LinearGradient',
  'Stop'
]);

const elementNameMap = new Map<string, string>([
  ['Svg', 'svg'],
  ['Path', 'path'],
  ['Circle', 'circle'],
  ['Rect', 'rect'],
  ['Line', 'line'],
  ['Polyline', 'polyline'],
  ['Polygon', 'polygon'],
  ['G', 'g'],
  ['Defs', 'defs'],
  ['ClipPath', 'clipPath'],
  ['Mask', 'mask'],
  ['LinearGradient', 'linearGradient'],
  ['Stop', 'stop']
]);

const attributeNameMap = new Map<string, string>([
  ['strokeWidth', 'stroke-width'],
  ['strokeLinecap', 'stroke-linecap'],
  ['strokeLinejoin', 'stroke-linejoin'],
  ['fillRule', 'fill-rule'],
  ['clipRule', 'clip-rule'],
  ['clipPath', 'clip-path'],
  ['stopColor', 'stop-color'],
  ['stopOpacity', 'stop-opacity']
]);

export function isSupportedSvgElement(name: string): boolean {
  return supportedElements.has(name);
}

export function convertSvgElementName(name: string): string {
  return elementNameMap.get(name) ?? name;
}

export function convertSvgAttributeName(name: string): string {
  return attributeNameMap.get(name) ?? name;
}
```

- [ ] **Step 6: Run utility tests**

Run:

```bash
npm test -- scripts/icon-scanner/__tests__/path-utils.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 7: Commit utilities**

```bash
git add scripts/icon-scanner
git commit -m "test: add scanner path and svg utilities"
```

## Task 3: Implement TSX Icon Parser

**Files:**
- Create: `scripts/icon-scanner/tsx-parser.ts`
- Create: `scripts/icon-scanner/__tests__/tsx-parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

`scripts/icon-scanner/__tests__/tsx-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseIconSource } from '../tsx-parser';

describe('parseIconSource', () => {
  it('extracts a simple exported icon component', () => {
    const result = parseIconSource(`
      import Svg, { Path } from 'react-native-svg';

      export const ArrowLeftIcon = ({ size = 24, color = '#111' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    `);

    expect(result).toEqual({
      ok: true,
      icon: {
        name: 'ArrowLeftIcon',
        svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      }
    });
  });

  it('supports default exported named function declarations', () => {
    const result = parseIconSource(`
      import Svg, { Circle } from 'react-native-svg';

      export default function UserIcon() {
        return (
          <Svg viewBox="0 0 24 24">
            <Circle cx="12" cy="8" r="4" fill="currentColor" />
          </Svg>
        );
      }
    `);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.icon.name).toBe('UserIcon');
      expect(result.icon.svg).toContain('<circle cx="12" cy="8" r="4" fill="currentColor"/>');
    }
  });

  it('returns a structured error for unsupported conditional JSX', () => {
    const result = parseIconSource(`
      import Svg, { Path } from 'react-native-svg';

      export const AlertIcon = ({ filled }) => (
        <Svg viewBox="0 0 24 24">
          {filled ? <Path d="M1 1" /> : <Path d="M2 2" />}
        </Svg>
      );
    `);

    expect(result).toEqual({
      ok: false,
      reason: 'Unsupported JSX expression container in Svg children'
    });
  });
});
```

- [ ] **Step 2: Run parser tests to verify they fail**

Run:

```bash
npm test -- scripts/icon-scanner/__tests__/tsx-parser.test.ts
```

Expected:

```text
FAIL
Cannot find module '../tsx-parser'
```

- [ ] **Step 3: Implement parser**

`scripts/icon-scanner/tsx-parser.ts`:

```ts
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { convertSvgAttributeName, convertSvgElementName, isSupportedSvgElement } from './svg-attributes';
import type { ParsedIconResult } from './types';

type ComponentCandidate = {
  name: string;
  body: t.Node;
};

export function parseIconSource(source: string): ParsedIconResult {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx']
  });

  const candidate = findExportedComponent(ast);
  if (!candidate) {
    return { ok: false, reason: 'No exported icon component found' };
  }

  const jsx = findReturnedJsx(candidate.body);
  if (!jsx) {
    return { ok: false, reason: `No JSX return found for ${candidate.name}` };
  }

  if (!t.isJSXElement(jsx)) {
    return { ok: false, reason: `Unsupported JSX return type for ${candidate.name}` };
  }

  const rootName = getJsxElementName(jsx.openingElement.name);
  if (rootName !== 'Svg') {
    return { ok: false, reason: `Root JSX element must be Svg, found ${rootName}` };
  }

  const rendered = renderJsxElement(jsx, 'root');
  if (!rendered.ok) {
    return { ok: false, reason: rendered.reason };
  }

  return {
    ok: true,
    icon: {
      name: candidate.name,
      svg: rendered.svg
    }
  };
}

function findExportedComponent(ast: t.File): ComponentCandidate | null {
  let found: ComponentCandidate | null = null;

  traverse(ast, {
    ExportNamedDeclaration(path) {
      const declaration = path.node.declaration;
      if (found || !declaration) {
        return;
      }

      if (t.isVariableDeclaration(declaration)) {
        for (const declarator of declaration.declarations) {
          if (t.isIdentifier(declarator.id) && declarator.init) {
            found = { name: declarator.id.name, body: declarator.init };
            return;
          }
        }
      }

      if (t.isFunctionDeclaration(declaration) && declaration.id) {
        found = { name: declaration.id.name, body: declaration };
      }
    },
    ExportDefaultDeclaration(path) {
      if (found) {
        return;
      }

      const declaration = path.node.declaration;
      if (t.isFunctionDeclaration(declaration) && declaration.id) {
        found = { name: declaration.id.name, body: declaration };
      }
    }
  });

  return found;
}

function findReturnedJsx(node: t.Node): t.JSXElement | t.JSXFragment | null {
  if (t.isArrowFunctionExpression(node)) {
    if (t.isJSXElement(node.body) || t.isJSXFragment(node.body)) {
      return node.body;
    }

    if (t.isBlockStatement(node.body)) {
      return findReturnStatementJsx(node.body);
    }
  }

  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) {
    return findReturnStatementJsx(node.body);
  }

  return null;
}

function findReturnStatementJsx(block: t.BlockStatement): t.JSXElement | t.JSXFragment | null {
  for (const statement of block.body) {
    if (t.isReturnStatement(statement) && statement.argument) {
      if (t.isJSXElement(statement.argument) || t.isJSXFragment(statement.argument)) {
        return statement.argument;
      }
    }
  }

  return null;
}

function renderJsxElement(element: t.JSXElement, context: string): { ok: true; svg: string } | { ok: false; reason: string } {
  const sourceName = getJsxElementName(element.openingElement.name);
  if (!isSupportedSvgElement(sourceName)) {
    return { ok: false, reason: `Unsupported SVG element ${sourceName}` };
  }

  const tagName = convertSvgElementName(sourceName);
  const attributes = renderAttributes(element.openingElement.attributes);
  if (!attributes.ok) {
    return attributes;
  }

  const childParts: string[] = [];
  for (const child of element.children) {
    if (t.isJSXText(child)) {
      const text = child.value.trim();
      if (text.length > 0) {
        childParts.push(escapeText(text));
      }
      continue;
    }

    if (t.isJSXElement(child)) {
      const renderedChild = renderJsxElement(child, sourceName);
      if (!renderedChild.ok) {
        return renderedChild;
      }
      childParts.push(renderedChild.svg);
      continue;
    }

    if (t.isJSXExpressionContainer(child)) {
      if (t.isJSXEmptyExpression(child.expression)) {
        continue;
      }
      return { ok: false, reason: `Unsupported JSX expression container in ${context === 'root' ? sourceName : context} children` };
    }

    return { ok: false, reason: `Unsupported child node in ${sourceName}` };
  }

  const attrs = attributes.attributes.length > 0 ? ` ${attributes.attributes.join(' ')}` : '';
  if (childParts.length === 0 && tagName !== 'svg') {
    return { ok: true, svg: `<${tagName}${attrs}/>` };
  }

  return { ok: true, svg: `<${tagName}${attrs}>${childParts.join('')}</${tagName}>` };
}

function renderAttributes(attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[]): { ok: true; attributes: string[] } | { ok: false; reason: string } {
  const rendered: string[] = [];

  for (const attribute of attributes) {
    if (t.isJSXSpreadAttribute(attribute)) {
      return { ok: false, reason: 'Unsupported JSX spread attribute' };
    }

    const name = getJsxAttributeName(attribute.name);
    const value = renderAttributeValue(name, attribute.value);
    if (!value.ok) {
      return value;
    }

    rendered.push(`${convertSvgAttributeName(name)}="${escapeAttribute(value.value)}"`);
  }

  return { ok: true, attributes: rendered };
}

function renderAttributeValue(
  name: string,
  value: t.JSXAttribute['value']
): { ok: true; value: string } | { ok: false; reason: string } {
  if (!value) {
    return { ok: true, value: 'true' };
  }

  if (t.isStringLiteral(value)) {
    return { ok: true, value: value.value };
  }

  if (t.isJSXExpressionContainer(value)) {
    const expression = value.expression;

    if (t.isNumericLiteral(expression) || t.isStringLiteral(expression)) {
      return { ok: true, value: String(expression.value) };
    }

    if (t.isIdentifier(expression)) {
      if ((name === 'width' || name === 'height') && expression.name === 'size') {
        return { ok: true, value: '24' };
      }

      if ((name === 'fill' || name === 'stroke') && expression.name === 'color') {
        return { ok: true, value: 'currentColor' };
      }
    }
  }

  return { ok: false, reason: `Unsupported dynamic JSX expression in ${name}` };
}

function getJsxElementName(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): string {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }

  return 'unsupported';
}

function getJsxAttributeName(name: t.JSXIdentifier | t.JSXNamespacedName): string {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }

  return 'unsupported';
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
npm test -- scripts/icon-scanner/__tests__/tsx-parser.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit parser**

```bash
git add scripts/icon-scanner/tsx-parser.ts scripts/icon-scanner/__tests__/tsx-parser.test.ts
git commit -m "feat: parse react native svg icon components"
```

## Task 4: Implement Scanner Filesystem and CLI

**Files:**
- Create: `scripts/icon-scanner/scan.ts`
- Create: `scripts/icon-scanner/__tests__/scan.test.ts`
- Create: `scripts/scan-icons.ts`
- Create: `scripts/watch-icons.ts`
- Create: `test/fixtures/icons/navigation/ArrowLeftIcon.tsx`
- Create: `test/fixtures/icons/actions/CloseIcon.jsx`
- Create: `test/fixtures/icons/complex/ConditionalIcon.tsx`

- [ ] **Step 1: Create fixture icons**

`test/fixtures/icons/navigation/ArrowLeftIcon.tsx`:

```tsx
import Svg, { Path } from 'react-native-svg';

export const ArrowLeftIcon = ({ size = 24, color = '#111' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
```

`test/fixtures/icons/actions/CloseIcon.jsx`:

```jsx
import Svg, { Path } from 'react-native-svg';

export const CloseIcon = ({ size = 24, color = '#111' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 6l12 12" stroke={color} strokeWidth={2} />
    <Path d="M18 6L6 18" stroke={color} strokeWidth={2} />
  </Svg>
);
```

`test/fixtures/icons/complex/ConditionalIcon.tsx`:

```tsx
import Svg, { Path } from 'react-native-svg';

export const ConditionalIcon = ({ filled }: { filled?: boolean }) => (
  <Svg viewBox="0 0 24 24">
    {filled ? <Path d="M1 1" /> : <Path d="M2 2" />}
  </Svg>
);
```

- [ ] **Step 2: Write failing scanner tests**

`scripts/icon-scanner/__tests__/scan.test.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanIconDirectory, writeCatalogForSourceDir } from '../scan';

const fixtureDir = path.resolve('test/fixtures/icons');

describe('scanIconDirectory', () => {
  it('scans supported icons and records unsupported files', async () => {
    const catalog = await scanIconDirectory(fixtureDir);

    expect(catalog.status).toBe('ok');
    expect(catalog.sourceDir).toBe(fixtureDir);
    expect(catalog.icons.map((icon) => icon.name).sort()).toEqual(['ArrowLeftIcon', 'CloseIcon']);
    expect(catalog.icons.find((icon) => icon.name === 'ArrowLeftIcon')).toMatchObject({
      category: 'navigation',
      filePath: 'navigation/ArrowLeftIcon.tsx',
      importSnippet: "import { ArrowLeftIcon } from '@/icons/navigation/ArrowLeftIcon';"
    });
    expect(catalog.errors).toEqual([
      {
        filePath: 'complex/ConditionalIcon.tsx',
        reason: 'Unsupported JSX expression container in Svg children'
      }
    ]);
  });

  it('writes setup-error JSON for a missing directory and throws after writing', async () => {
    const outputPath = path.resolve('test/.tmp/missing-icons.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.rm(outputPath, { force: true });

    await expect(writeCatalogForSourceDir('/path/that/does/not/exist', outputPath)).rejects.toThrow(
      'RN_ICON_SOURCE_DIR does not exist'
    );

    const written = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(written).toMatchObject({
      sourceDir: '/path/that/does/not/exist',
      status: 'setup-error',
      setupError: 'RN_ICON_SOURCE_DIR does not exist: /path/that/does/not/exist',
      icons: [],
      errors: []
    });
  });
});
```

- [ ] **Step 3: Run scanner tests to verify they fail**

Run:

```bash
npm test -- scripts/icon-scanner/__tests__/scan.test.ts
```

Expected:

```text
FAIL
Cannot find module '../scan'
```

- [ ] **Step 4: Implement scanner module**

`scripts/icon-scanner/scan.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { deriveCategory, makeImportSnippet, normalizeRelativePath } from './path-utils';
import { parseIconSource } from './tsx-parser';
import type { IconCatalog } from './types';

export const defaultOutputPath = path.resolve('src/generated/icons.json');

export async function scanIconDirectory(sourceDir: string): Promise<IconCatalog> {
  const absoluteSourceDir = path.resolve(sourceDir);
  const entries = await fg(['**/*.{tsx,jsx}'], {
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
    const parsed = parseIconSource(source);

    if (!parsed.ok) {
      catalog.errors.push({ filePath: relativePath, reason: parsed.reason });
      continue;
    }

    catalog.icons.push({
      name: parsed.icon.name,
      category: deriveCategory(relativePath),
      filePath: relativePath,
      svg: parsed.icon.svg,
      importSnippet: makeImportSnippet(parsed.icon.name, relativePath)
    });
  }

  return catalog;
}

export async function writeCatalogForSourceDir(sourceDir: string | undefined, outputPath = defaultOutputPath): Promise<IconCatalog> {
  if (!sourceDir) {
    const catalog = makeSetupErrorCatalog(null, 'RN_ICON_SOURCE_DIR is not set.');
    await writeCatalog(outputPath, catalog);
    throw new Error(catalog.setupError);
  }

  const absoluteSourceDir = path.resolve(sourceDir);

  try {
    const stat = await fs.stat(absoluteSourceDir);
    if (!stat.isDirectory()) {
      const catalog = makeSetupErrorCatalog(absoluteSourceDir, `RN_ICON_SOURCE_DIR is not a directory: ${absoluteSourceDir}`);
      await writeCatalog(outputPath, catalog);
      throw new Error(catalog.setupError);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const catalog = makeSetupErrorCatalog(absoluteSourceDir, `RN_ICON_SOURCE_DIR does not exist: ${absoluteSourceDir}`);
      await writeCatalog(outputPath, catalog);
      throw new Error(catalog.setupError);
    }

    throw error;
  }

  const catalog = await scanIconDirectory(absoluteSourceDir);
  await writeCatalog(outputPath, catalog);
  return catalog;
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
```

- [ ] **Step 5: Implement one-shot CLI**

`scripts/scan-icons.ts`:

```ts
import 'dotenv/config';
import { writeCatalogForSourceDir } from './icon-scanner/scan';

const watch = process.argv.includes('--watch');

if (watch) {
  const { runWatch } = await import('./watch-icons');
  await runWatch();
} else {
  try {
    const catalog = await writeCatalogForSourceDir(process.env.RN_ICON_SOURCE_DIR);
    console.log(`Scanned ${catalog.icons.length} icons with ${catalog.errors.length} unsupported files.`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 6: Implement watch CLI**

`scripts/watch-icons.ts`:

```ts
import 'dotenv/config';
import chokidar from 'chokidar';
import { writeCatalogForSourceDir } from './icon-scanner/scan';

export async function runWatch(): Promise<void> {
  const sourceDir = process.env.RN_ICON_SOURCE_DIR;

  async function scan() {
    try {
      const catalog = await writeCatalogForSourceDir(sourceDir);
      console.log(`[icon-view] scanned ${catalog.icons.length} icons, ${catalog.errors.length} unsupported`);
    } catch (error) {
      console.error(`[icon-view] ${(error as Error).message}`);
    }
  }

  await scan();

  if (!sourceDir) {
    return;
  }

  chokidar
    .watch(['**/*.tsx', '**/*.jsx'], {
      cwd: sourceDir,
      ignoreInitial: true
    })
    .on('add', scan)
    .on('change', scan)
    .on('unlink', scan);

  console.log(`[icon-view] watching ${sourceDir}`);
}
```

- [ ] **Step 7: Run scanner tests**

Run:

```bash
npm test -- scripts/icon-scanner/__tests__/scan.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 8: Verify scanner writes generated JSON from fixtures**

Run:

```bash
RN_ICON_SOURCE_DIR="$(pwd)/test/fixtures/icons" npm run scan:icons
```

Expected:

```text
Scanned 2 icons with 1 unsupported files.
```

Then run:

```bash
node -e "const data=require('./src/generated/icons.json'); console.log(data.icons.length, data.errors.length, data.status)"
```

Expected:

```text
2 1 ok
```

- [ ] **Step 9: Restore fallback generated JSON before commit**

Replace `src/generated/icons.json` with:

```json
{
  "sourceDir": null,
  "generatedAt": null,
  "status": "setup-error",
  "setupError": "Run npm run scan:icons after setting RN_ICON_SOURCE_DIR in .env.",
  "icons": [],
  "errors": []
}
```

- [ ] **Step 10: Commit scanner**

```bash
git add scripts test src/generated/icons.json
git commit -m "feat: scan icon components into generated catalog"
```

## Task 5: Build Icon Viewer UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/App.test.tsx`

- [ ] **Step 1: Write failing UI tests**

`src/App.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./generated/icons.json', () => ({
  default: {
    sourceDir: '/tmp/icons',
    generatedAt: '2026-06-17T00:00:00.000Z',
    status: 'ok',
    setupError: null,
    icons: [
      {
        name: 'ArrowLeftIcon',
        category: 'navigation',
        filePath: 'navigation/ArrowLeftIcon.tsx',
        svg: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
        importSnippet: "import { ArrowLeftIcon } from '@/icons/navigation/ArrowLeftIcon';"
      },
      {
        name: 'CloseIcon',
        category: 'actions',
        filePath: 'actions/CloseIcon.jsx',
        svg: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12"/></svg>',
        importSnippet: "import { CloseIcon } from '@/icons/actions/CloseIcon';"
      }
    ],
    errors: [
      {
        filePath: 'complex/ConditionalIcon.tsx',
        reason: 'Unsupported JSX expression container in Svg children'
      }
    ]
  }
}));

describe('App', () => {
  it('renders icon grid, metadata, and unsupported file errors', () => {
    render(<App />);

    expect(screen.getByText('2 icons')).toBeInTheDocument();
    expect(screen.getByText('/tmp/icons')).toBeInTheDocument();
    expect(screen.getByText('ArrowLeftIcon')).toBeInTheDocument();
    expect(screen.getByText('CloseIcon')).toBeInTheDocument();
    expect(screen.getByText('complex/ConditionalIcon.tsx')).toBeInTheDocument();
  });

  it('filters icons by search text', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Search icons'), 'close');

    expect(screen.queryByText('ArrowLeftIcon')).not.toBeInTheDocument();
    expect(screen.getByText('CloseIcon')).toBeInTheDocument();
    expect(screen.getByText('1 icon')).toBeInTheDocument();
  });

  it('filters icons by category', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText('Category'), 'actions');

    expect(screen.queryByText('ArrowLeftIcon')).not.toBeInTheDocument();
    expect(screen.getByText('CloseIcon')).toBeInTheDocument();
  });

  it('updates detail panel when selecting an icon', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /CloseIcon/ }));

    const detail = screen.getByRole('region', { name: 'Selected icon details' });
    expect(within(detail).getByText('CloseIcon')).toBeInTheDocument();
    expect(within(detail).getByText('actions/CloseIcon.jsx')).toBeInTheDocument();
  });

  it('copies selected icon name', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Copy component name' }));

    expect(writeText).toHaveBeenCalledWith('ArrowLeftIcon');
  });
});
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected:

```text
FAIL
Unable to find
```

- [ ] **Step 3: Implement viewer UI**

`src/App.tsx`:

```tsx
import { useMemo, useState } from 'react';
import catalog from './generated/icons.json';
import type { IconCatalog, IconRecord } from './types';

const iconCatalog = catalog as IconCatalog;

function pluralizeIcon(count: number) {
  return `${count} ${count === 1 ? 'icon' : 'icons'}`;
}

export default function App() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedName, setSelectedName] = useState<string | null>(iconCatalog.icons[0]?.name ?? null);
  const [copied, setCopied] = useState<string | null>(null);

  const categories = useMemo(() => {
    return ['all', ...Array.from(new Set(iconCatalog.icons.map((icon) => icon.category))).sort()];
  }, []);

  const visibleIcons = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return iconCatalog.icons.filter((icon) => {
      const matchesQuery = normalizedQuery.length === 0 || icon.name.toLowerCase().includes(normalizedQuery);
      const matchesCategory = category === 'all' || icon.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [category, query]);

  const selectedIcon =
    iconCatalog.icons.find((icon) => icon.name === selectedName) ?? visibleIcons[0] ?? iconCatalog.icons[0] ?? null;

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Icon View</h1>
          <p>React Native SVG icon catalog</p>
        </div>
        <div className="scan-meta">
          <strong>{pluralizeIcon(visibleIcons.length)}</strong>
          <span>{iconCatalog.sourceDir ?? 'No source directory'}</span>
          <span>{iconCatalog.generatedAt ? new Date(iconCatalog.generatedAt).toLocaleString() : 'Not generated'}</span>
        </div>
      </header>

      {iconCatalog.setupError ? <SetupError message={iconCatalog.setupError} /> : null}

      <section className="tool-row" aria-label="Icon filters">
        <label>
          <span>Search icons</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" />
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="viewer-layout">
        <IconGrid icons={visibleIcons} selectedName={selectedIcon?.name ?? null} onSelect={setSelectedName} />
        <DetailPanel icon={selectedIcon} copied={copied} onCopy={copy} />
      </section>

      {visibleIcons.length === 0 ? (
        <section className="empty-state">
          <h2>No matching icons</h2>
          <p>Adjust search or category filters.</p>
        </section>
      ) : null}

      <UnsupportedFiles errors={iconCatalog.errors} />
    </main>
  );
}

function SetupError({ message }: { message: string }) {
  return (
    <section className="empty-state">
      <h2>Scanner setup required</h2>
      <p>{message}</p>
    </section>
  );
}

function IconGrid({
  icons,
  selectedName,
  onSelect
}: {
  icons: IconRecord[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <section className="icon-grid" aria-label="Icon grid">
      {icons.map((icon) => (
        <button
          className={icon.name === selectedName ? 'icon-card selected' : 'icon-card'}
          key={icon.filePath}
          type="button"
          onClick={() => onSelect(icon.name)}
        >
          <span className="icon-preview" dangerouslySetInnerHTML={{ __html: icon.svg }} />
          <span className="icon-name">{icon.name}</span>
          <span className="icon-category">{icon.category}</span>
        </button>
      ))}
    </section>
  );
}

function DetailPanel({
  icon,
  copied,
  onCopy
}: {
  icon: IconRecord | null;
  copied: string | null;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  if (!icon) {
    return (
      <aside className="detail-panel" role="region" aria-label="Selected icon details">
        <h2>No icon selected</h2>
      </aside>
    );
  }

  return (
    <aside className="detail-panel" role="region" aria-label="Selected icon details">
      <div className="detail-preview" dangerouslySetInnerHTML={{ __html: icon.svg }} />
      <h2>{icon.name}</h2>
      <dl>
        <dt>Category</dt>
        <dd>{icon.category}</dd>
        <dt>Path</dt>
        <dd>{icon.filePath}</dd>
      </dl>
      <button type="button" onClick={() => onCopy(icon.name, 'name')}>
        Copy component name
      </button>
      <button type="button" onClick={() => onCopy(icon.importSnippet, 'snippet')}>
        Copy import snippet
      </button>
      {copied ? <p className="copy-status">Copied {copied}.</p> : null}
    </aside>
  );
}

function UnsupportedFiles({ errors }: { errors: IconCatalog['errors'] }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <section className="unsupported-files">
      <h2>Unsupported files</h2>
      <ul>
        {errors.map((error) => (
          <li key={error.filePath}>
            <strong>{error.filePath}</strong>
            <span>{error.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Replace styles with full viewer layout**

`src/styles.css`:

```css
:root {
  color: #202124;
  background: #f7f8fa;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
}

.app-header,
.tool-row,
.viewer-layout,
.unsupported-files,
.empty-state {
  max-width: 1280px;
  margin-left: auto;
  margin-right: auto;
}

.app-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.app-header h1 {
  margin: 0;
  font-size: 28px;
}

.app-header p,
.scan-meta,
.icon-category,
.copy-status {
  color: #5f6368;
}

.app-header p {
  margin: 4px 0 0;
}

.scan-meta {
  display: grid;
  gap: 4px;
  max-width: 520px;
  text-align: right;
  overflow-wrap: anywhere;
}

.tool-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 220px;
  gap: 12px;
  margin-bottom: 16px;
}

.tool-row label {
  display: grid;
  gap: 6px;
  color: #3c4043;
  font-weight: 600;
}

.tool-row input,
.tool-row select {
  width: 100%;
  min-height: 40px;
  border: 1px solid #c9ced6;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fff;
}

.viewer-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.icon-card {
  display: grid;
  min-height: 148px;
  gap: 8px;
  justify-items: center;
  align-content: center;
  border: 1px solid #dadce0;
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  color: inherit;
  text-align: center;
}

.icon-card.selected,
.icon-card:focus-visible {
  border-color: #1a73e8;
  outline: 2px solid #1a73e8;
  outline-offset: 1px;
}

.icon-preview,
.detail-preview {
  display: grid;
  place-items: center;
  color: #202124;
}

.icon-preview svg {
  width: 32px;
  height: 32px;
}

.icon-name {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-weight: 700;
}

.detail-panel,
.unsupported-files,
.empty-state {
  border: 1px solid #dadce0;
  border-radius: 8px;
  background: #fff;
}

.detail-panel {
  position: sticky;
  top: 16px;
  display: grid;
  gap: 12px;
  padding: 16px;
}

.detail-preview {
  min-height: 180px;
  border: 1px solid #edf0f2;
  border-radius: 8px;
  background: #fafafa;
}

.detail-preview svg {
  width: 96px;
  height: 96px;
}

.detail-panel h2 {
  margin: 0;
  overflow-wrap: anywhere;
}

.detail-panel dl {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 8px;
  margin: 0;
}

.detail-panel dt {
  color: #5f6368;
}

.detail-panel dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.detail-panel button {
  min-height: 40px;
  border: 1px solid #c9ced6;
  border-radius: 6px;
  background: #fff;
}

.unsupported-files,
.empty-state {
  margin-top: 16px;
  padding: 16px;
}

.unsupported-files h2,
.empty-state h2 {
  margin: 0 0 12px;
}

.unsupported-files ul {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.unsupported-files li {
  display: grid;
  gap: 4px;
}

@media (max-width: 860px) {
  .app-header,
  .viewer-layout,
  .tool-row {
    grid-template-columns: 1fr;
  }

  .app-header {
    display: grid;
  }

  .scan-meta {
    text-align: left;
  }

  .detail-panel {
    position: static;
  }
}
```

- [ ] **Step 5: Run UI tests**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected:

```text
PASS
```

- [ ] **Step 6: Run full tests and build**

Run:

```bash
npm test
npm run build
```

Expected:

```text
PASS
vite build
built in
```

- [ ] **Step 7: Commit UI**

```bash
git add src test package.json package-lock.json
git commit -m "feat: build icon catalog viewer UI"
```

## Task 6: End-to-End Manual Verification

**Files:**
- Modify only if verification finds defects in files from previous tasks.

- [ ] **Step 1: Generate catalog from fixtures**

Run:

```bash
RN_ICON_SOURCE_DIR="$(pwd)/test/fixtures/icons" npm run scan:icons
```

Expected:

```text
Scanned 2 icons with 1 unsupported files.
```

- [ ] **Step 2: Start local dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected:

```text
Local:   http://127.0.0.1:
```

- [ ] **Step 3: Verify in browser**

Open the printed local URL and verify:

- The header shows `2 icons`.
- `ArrowLeftIcon` and `CloseIcon` appear in the grid.
- Search `close` leaves only `CloseIcon`.
- Category `navigation` leaves only `ArrowLeftIcon`.
- Clicking `CloseIcon` updates the detail panel.
- Copy component name writes `CloseIcon` to clipboard.
- Unsupported files section shows `complex/ConditionalIcon.tsx`.

- [ ] **Step 4: Stop the dev server**

Press `Ctrl+C` in the terminal running Vite.

Expected:

```text
^C
```

- [ ] **Step 5: Restore fallback generated JSON**

Replace `src/generated/icons.json` with:

```json
{
  "sourceDir": null,
  "generatedAt": null,
  "status": "setup-error",
  "setupError": "Run npm run scan:icons after setting RN_ICON_SOURCE_DIR in .env.",
  "icons": [],
  "errors": []
}
```

- [ ] **Step 6: Run final verification**

Run:

```bash
npm test
npm run build
```

Expected:

```text
PASS
vite build
built in
```

- [ ] **Step 7: Commit verification fixes or fallback restoration**

```bash
git add src/generated/icons.json
git commit -m "chore: restore generated catalog fallback"
```

If `git status --short` shows no changes after restoring the fallback, skip this commit.

## Self-Review

Spec coverage:

- External folder via `.env`: Task 4.
- Generated fallback JSON: Task 1 and Task 6.
- TSX/JSX parser to web SVG: Tasks 2 and 3.
- Category from folder structure: Task 2 and Task 4.
- Search, category filter, grid, detail panel, copy actions: Task 5.
- Unsupported file reporting: Tasks 3, 4, and 5.
- Scanner and UI tests: Tasks 2 through 5.
- Manual verification: Task 6.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified "add tests" steps remain.
- Each task names exact files, commands, expected results, and implementation snippets.

Type consistency:

- `IconCatalog`, `IconRecord`, and `IconScanError` fields match across scanner, generated JSON, and UI.
- Scanner status values are `ok` and `setup-error` in every task.
- Parser returns `ParsedIconResult` consistently across tests and implementation.
