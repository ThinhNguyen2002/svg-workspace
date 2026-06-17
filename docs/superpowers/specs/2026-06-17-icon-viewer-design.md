# React Native SVG Icon Viewer Design

## Purpose

Build a standalone local website that reads React Native SVG icon components from an external React Native app and displays the currently available icons in a searchable, filterable web UI.

The viewer is intended for local developer use. It should make it easy to inspect available icons, find an icon by name/category, preview it at a larger size, and copy the component name or import snippet.

## Context

- The `icon-view` workspace is currently empty and is not a git repository.
- The React Native app lives outside this website project.
- Icons are written as one component per `.tsx`/`.jsx` file.
- The icon source folder will be configured through `.env`.
- The website should use Vite + React.
- The viewer should parse icon source files into web SVG markup instead of rendering `react-native-svg` components directly in the browser.

## Goals

- Scan an external icon folder configured by `RN_ICON_SOURCE_DIR`.
- Parse simple React Native SVG icon components into browser-renderable SVG markup.
- Show all supported icons in a web grid.
- Support search by icon name.
- Support category filtering based on folder structure.
- Show a detail panel for the selected icon.
- Copy component name and import snippet.
- Report unsupported files without failing the whole scan.

## Non-Goals

- Rendering arbitrary React Native components in the browser.
- Full support for dynamic icon logic, animation, theming, or runtime conditions.
- Editing icons from the viewer.
- Publishing this as a hosted production service.
- Guaranteeing import snippets match the external app's alias configuration in the MVP.

## Recommended Approach

Use a hybrid generated-data architecture:

1. A Node scanner reads `RN_ICON_SOURCE_DIR`.
2. The scanner parses `.tsx` and `.jsx` icon files.
3. The scanner writes `src/generated/icons.json`.
4. The Vite React UI reads the generated JSON and renders the viewer.
5. Dev workflow includes a normal scan command and a watch command for regenerating the JSON while working.

This keeps parser complexity out of the frontend and allows the UI to remain a normal static React app.

The project should include an initial `src/generated/icons.json` fallback with an empty icon list so Vite can start before the first real scan. The scanner overwrites that file when `npm run scan:icons` succeeds.

## Architecture

### Scanner

The scanner is a Node-side module responsible for:

- Loading `.env`.
- Validating `RN_ICON_SOURCE_DIR`.
- Recursively finding `.tsx` and `.jsx` files.
- Parsing each file into an AST.
- Detecting exported React components.
- Converting supported `react-native-svg` JSX into SVG web markup.
- Deriving metadata such as component name, category, relative path, and import snippet.
- Capturing unsupported files as structured errors.
- Writing the generated JSON contract.

### Generated Data Contract

The scanner writes a JSON file shaped like:

```json
{
  "sourceDir": "/absolute/path/to/app/src/icons",
  "generatedAt": "2026-06-17T00:00:00.000Z",
  "icons": [
    {
      "name": "ArrowLeftIcon",
      "category": "navigation",
      "filePath": "navigation/ArrowLeftIcon.tsx",
      "svg": "<svg viewBox=\"0 0 24 24\">...</svg>",
      "importSnippet": "import { ArrowLeftIcon } from '@/icons/navigation/ArrowLeftIcon';"
    }
  ],
  "errors": [
    {
      "filePath": "complex/AnimatedIcon.tsx",
      "reason": "Unsupported dynamic JSX expression in Path.d"
    }
  ]
}
```

`icons` contains successfully parsed icon components. `errors` contains files that were found but could not be safely converted.

### Frontend

The Vite React UI only consumes `src/generated/icons.json`.

The frontend should not:

- Import files from the React Native app directly.
- Know about parser internals.
- Attempt to evaluate arbitrary TSX at runtime.

## Parser Rules

The MVP parser optimizes for simple icon components.

Supported behavior:

- Detect named exported React components in each `.tsx` or `.jsx` file.
- Convert these JSX elements:
  - `Svg`
  - `Path`
  - `Circle`
  - `Rect`
  - `Line`
  - `Polyline`
  - `Polygon`
  - `G`
  - `Defs`
  - `ClipPath`
  - `Mask`
  - `LinearGradient`
  - `Stop`
- Convert common React Native SVG prop casing to web SVG attributes:
  - `strokeWidth` to `stroke-width`
  - `strokeLinecap` to `stroke-linecap`
  - `strokeLinejoin` to `stroke-linejoin`
  - `fillRule` to `fill-rule`
  - `clipRule` to `clip-rule`
  - `clipPath` to `clip-path`
  - `stopColor` to `stop-color`
  - `stopOpacity` to `stop-opacity`
- Normalize common dynamic preview props:
  - `width={size}` to `width="24"`
  - `height={size}` to `height="24"`
  - `fill={color}` to `fill="currentColor"`
  - `stroke={color}` to `stroke="currentColor"`

Unsupported behavior:

- Conditional JSX branches.
- Array mapping that creates SVG children.
- Runtime expressions in path data or element names.
- Theme token resolution that requires importing the app.
- Animated or gesture-driven SVG components.

Unsupported files are recorded in `errors` and do not fail the entire scan.

## Category Derivation

Category is derived from the first folder segment under `RN_ICON_SOURCE_DIR`.

Examples:

- `icons/navigation/ArrowLeftIcon.tsx` -> `navigation`
- `icons/actions/CloseIcon.tsx` -> `actions`
- `icons/HomeIcon.tsx` -> `uncategorized`

## Import Snippet

The MVP generates a default import snippet from the relative file path and component name.

Because the React Native app is external, this snippet may not perfectly match the app's TypeScript alias configuration. A later phase can add configuration such as `RN_ICON_IMPORT_ALIAS` or an `icon-view.config.ts` file.

## UI Requirements

The main viewer screen contains:

- A top tool row with:
  - Search input.
  - Category filter.
  - Total visible icon count.
  - Source directory and generated timestamp.
- An icon grid where each card shows:
  - SVG preview.
  - Component name.
  - Category.
- A detail panel for the selected icon showing:
  - Large SVG preview.
  - Component name.
  - Category.
  - Relative file path.
  - Copy component name button.
  - Copy import snippet button.
- An unsupported files section showing:
  - File path.
  - Parse failure reason.

## Empty and Error States

The UI should clearly handle:

- Generated JSON exists but has no icons.
- Generated JSON indicates scanner setup failed.
- `RN_ICON_SOURCE_DIR` missing.
- Source folder does not exist.
- No icon files found.
- All files unsupported.
- Search returns no matches.
- Some files supported and some unsupported.

The scanner should write a valid generated JSON file even for setup-level failures, including a top-level status/error message for the UI, then exit with a non-zero status. Per-file parse failures should be represented in the generated JSON without failing the scan.

## Scripts

Expected scripts:

- `npm run scan:icons`: scan once and write generated JSON.
- `npm run dev`: start Vite.
- `npm run dev:watch`: watch icon source files, regenerate JSON on change, and run Vite.
- `npm test`: run scanner and UI tests.

Exact script names can be adjusted during implementation if the chosen tooling suggests clearer names.

## Testing

### Scanner Tests

Use fixture icon files to test:

- Recursively finding `.tsx` and `.jsx` files.
- Category derivation from folder structure.
- Component name detection.
- SVG element conversion.
- Prop casing conversion.
- Dynamic `size` and `color` normalization.
- Unsupported expression handling.
- Generated JSON shape.

### UI Tests

Test:

- Grid renders generated icons.
- Search filters by component name.
- Category filter limits results.
- Selecting an icon updates the detail panel.
- Copy component name uses the selected icon name.
- Copy import snippet uses the generated snippet.
- Unsupported files are visible in the error section.
- Empty states render without crashing.

### Manual Verification

Create a small sample icon fixture folder, set `RN_ICON_SOURCE_DIR`, run the scan, start Vite, and verify:

- Icons appear in the grid.
- Search and category filtering work.
- Detail preview renders at large size.
- Copy actions work.
- Unsupported file errors are visible.

## Future Enhancements

- Add `RN_ICON_IMPORT_ALIAS` for more accurate snippets.
- Add optional `icon-view.config.ts` for scanner options.
- Add optional manifest metadata for tags and custom categories.
- Add color/background preview controls.
- Add size preview controls.
- Add exportable icon catalog.
- Add deep links to selected icons.
- Add a rescan button backed by a local dev API.

## Open Decisions

No open decisions remain for the MVP spec. The approved defaults are:

- Standalone Vite + React app.
- External React Native icon folder via `.env`.
- Parse TSX/JSX into web SVG markup.
- Category from folder structure.
- Hybrid generated JSON workflow.
- Search, category filter, grid, detail panel, copy actions, and unsupported file reporting in MVP.
