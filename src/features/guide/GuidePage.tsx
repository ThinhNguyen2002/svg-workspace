export function GuidePage() {
  return (
    <section className="guide-shell" aria-label="Website guide">
      <div className="guide-hero">
        <span>Documentation</span>
        <h2>Browse, inspect, and convert SVG assets across your workspace.</h2>
        <p>
          SVG workspace helps product teams audit SVG components and asset files,
          preview every item by category, copy usage snippets, and convert raw SVG
          files into reusable React Native or React components.
        </p>
      </div>

      <div className="guide-grid">
        <article className="guide-card">
          <h3>1. Scan Your Icon Folder</h3>
          <p>
            Open the Icon catalog tab, choose an SVG source folder, and the app
            will scan supported components and raw SVG files automatically.
          </p>
          <ul>
            <li>Use Choose folder to select a folder with React Native, React, or raw SVG icons.</li>
            <li>Use the re-scan button after adding or editing icons.</li>
            <li>Recent folders are saved locally for the next session.</li>
          </ul>
        </article>

        <article className="guide-card">
          <h3>2. Explore The Catalog</h3>
          <p>
            Icons are grouped by category, so you can scan large libraries without
            losing context.
          </p>
          <ul>
            <li>Click a category name to expand all icons inside it.</li>
            <li>Search by component name to jump directly to a specific icon.</li>
            <li>Select an icon to inspect its preview, path, and usage example.</li>
          </ul>
        </article>

        <article className="guide-card">
          <h3>3. Copy Usage Snippets</h3>
          <p>
            The detail panel shows copy-ready snippets based on the props detected
            from the original component.
          </p>
          <ul>
            <li>Copy the component name for quick imports or search.</li>
            <li>Copy the import snippet generated from the scanned file path.</li>
            <li>Copy a usage block with width, height, fill, and boolean props.</li>
          </ul>
        </article>

        <article className="guide-card">
          <h3>4. Convert Raw SVG</h3>
          <p>
            Use the SVG converter tab when you receive SVG markup from Figma,
            designers, or an asset export.
          </p>
          <ul>
            <li>Paste SVG code, upload a file, or drop an SVG into the editor.</li>
            <li>Use React Native for mobile components.</li>
            <li>Switch to React when you need a web SVG component.</li>
          </ul>
        </article>
      </div>

      <section className="guide-workflow">
        <h3>Recommended Workflow</h3>
        <ol>
          <li>Scan an SVG source folder from your app or asset workspace.</li>
          <li>Review unsupported files and fix parser issues as they appear.</li>
          <li>Use the catalog to compare icons by category and detect duplicates.</li>
          <li>Use the converter for new SVG assets before adding them to the app.</li>
        </ol>
      </section>
    </section>
  );
}
