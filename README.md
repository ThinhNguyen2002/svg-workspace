# SVG workspace

SVG workspace is a free web tool for browsing, previewing, and converting SVG assets across React Native, React, and raw SVG workflows.

It includes:

- Icon catalog for scanned SVG components and `.svg` files
- Category grouping, search, source type filtering, and detail usage snippets
- SVG converter with preview, React Native JSX output, and React JSX output
- Drag-and-drop SVG input
- Production SEO config with Open Graph, sitemap, robots, manifest, Vercel, and Netlify support

## Tech Stack

- Vite
- React
- TypeScript
- `react-native-svg` source parsing through Babel AST utilities
- CodeMirror for code input/output
- React Toastify for copy feedback

## Requirements

- Node.js 20+
- npm

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://localhost:5173
```

## App Pages

- `/` - Icon catalog
- `/converter` - SVG converter
- `/guide` - Product guide and usage notes

## Icon Catalog Usage

The catalog can scan:

- React Native SVG components using `react-native-svg`, for example `<Svg><Path /></Svg>`
- React web SVG components, for example `<svg><path /></svg>`
- Raw `.svg` files

In local development, use the folder selector in the header to choose a source folder. The app scans the folder, groups icons by category, and stores recent folders in local storage.

Categories are derived from the first folder segment. For example:

```text
icons/actions/CloseIcon.tsx -> actions
icons/navigation/ArrowLeftIcon.tsx -> navigation
icons/logo.svg -> uncategorized
```

## Local Scanner CLI

You can also scan a folder from the CLI and write `src/generated/icons.json`.

Create `.env`:

```bash
cp .env.example .env
```

Set the source folder:

```env
RN_ICON_SOURCE_DIR=/absolute/path/to/your/svg-icons
```

Run scan:

```bash
npm run scan:icons
```

Run scanner and Vite together:

```bash
npm run dev:watch
```

Note: the env var is still named `RN_ICON_SOURCE_DIR` for backward compatibility, but the scanner now supports React Native components, React components, and raw `.svg` files.

## SVG Converter Usage

Open `/converter`.

You can:

- Paste SVG markup
- Upload an `.svg` file
- Drag and drop an `.svg` file into the input panel
- Enter a component name
- Copy React Native JSX or React JSX output

The converter defaults to a sample SVG on first load.

## Production Deploy

The app is a static Vite app after build.

Set your public domain before building:

```bash
VITE_SITE_URL=https://your-domain.com npm run build
```

The build outputs to:

```text
dist/
```

Generated SEO files:

- `dist/robots.txt`
- `dist/sitemap.xml`
- Open Graph and Twitter meta tags in `dist/index.html`
- JSON-LD structured data
- `site.webmanifest`
- `og-image.svg`

## Deploy To Vercel

This repo includes `vercel.json`.

Recommended Vercel settings:

```text
Build command: npm run build
Output directory: dist
Environment variable: VITE_SITE_URL=https://your-domain.com
```

## Deploy To Netlify

This repo includes `netlify.toml`.

Recommended Netlify settings:

```text
Build command: npm run build
Publish directory: dist
Environment variable: VITE_SITE_URL=https://your-domain.com
```

## SEO Checklist

After deploy:

1. Add your domain to Google Search Console.
2. Submit the sitemap:

```text
https://your-domain.com/sitemap.xml
```

3. Use URL Inspection for the homepage and request indexing.
4. Share the URL once on public pages or docs so crawlers can discover it naturally.

## Production Folder Scanning

Public deployments use the browser File System Access API when available.

That means:

- Chrome and Edge users can click Choose and scan folders directly in the browser.
- Local files stay on the user's machine; the app reads them client-side.
- Browsers without `showDirectoryPicker()` support cannot use production folder scanning yet.
- The Vite `/api/select-icon-folder` endpoint is only a local development fallback.

For unsupported browsers, add a future upload flow or drag-and-drop folder flow.

## Scripts

```bash
npm run dev        # Start Vite dev server
npm run build      # Type-check and build production assets
npm run preview    # Preview production build locally
npm run test       # Run Vitest
npm run scan:icons # Scan configured source folder into generated catalog
npm run dev:watch  # Watch icon source folder and run Vite
```

## Known Limitations

- The parser supports common SVG JSX patterns, not arbitrary React rendering logic.
- Dynamic SVG attributes may be unsupported unless they can be resolved from default props.
- Production folder scanning requires a browser with File System Access API support.
- Large converter chunks may trigger a Vite warning because CodeMirror is bundled into the converter route.

## License

Add a license before public release if you want others to reuse, modify, or redistribute the code.
