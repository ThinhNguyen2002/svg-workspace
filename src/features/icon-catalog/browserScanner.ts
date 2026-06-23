import { parse } from "@babel/parser";
import * as t from "@babel/types";
import type { IconCatalog, IconPropUsage, IconSourceType } from "../../types";
import { makeBrowserSourceKey } from "../../utils/sourceStorage";

type BrowserDirectoryHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<BrowserFileSystemHandle>;
  queryPermission?: (descriptor?: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode: "read" }) => Promise<PermissionState>;
};

type BrowserFileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
};

type BrowserFileSystemHandle = BrowserDirectoryHandle | BrowserFileHandle;

type BrowserWindow = Window & {
  showDirectoryPicker?: () => Promise<BrowserDirectoryHandle>;
};

type ParsedBrowserIcon =
  | {
      ok: true;
      icon: {
        name: string;
        sourceType: IconSourceType;
        svg: string;
        props?: IconPropUsage[];
      };
    }
  | { ok: false; reason: string };

type ComponentCandidate = {
  name: string;
  body: t.Node;
  defaultProps: Map<string, string>;
  props: IconPropUsage[];
};

type ParseContext = {
  ast: t.File;
  localComponents: Map<string, ComponentCandidate>;
  filePath: string;
  sourceMap: Map<string, string>;
  visitedFiles: Set<string>;
};

type ReturnedExpression = t.Expression | t.JSXElement | t.JSXFragment;

const svgElementMap = new Map<string, string>([
  ["Svg", "svg"],
  ["Path", "path"],
  ["Circle", "circle"],
  ["Ellipse", "ellipse"],
  ["Rect", "rect"],
  ["Line", "line"],
  ["Polyline", "polyline"],
  ["Polygon", "polygon"],
  ["Text", "text"],
  ["G", "g"],
  ["Defs", "defs"],
  ["ClipPath", "clipPath"],
  ["Mask", "mask"],
  ["LinearGradient", "linearGradient"],
  ["RadialGradient", "radialGradient"],
  ["Pattern", "pattern"],
  ["Use", "use"],
  ["Image", "image"],
  ["Stop", "stop"],
]);

const svgAttributeMap = new Map<string, string>([
  ["strokeWidth", "stroke-width"],
  ["strokeLinecap", "stroke-linecap"],
  ["strokeLinejoin", "stroke-linejoin"],
  ["strokeMiterlimit", "stroke-miterlimit"],
  ["strokeMiterLimit", "stroke-miterlimit"],
  ["strokeDasharray", "stroke-dasharray"],
  ["strokeDashoffset", "stroke-dashoffset"],
  ["strokeOpacity", "stroke-opacity"],
  ["fillOpacity", "fill-opacity"],
  ["fillRule", "fill-rule"],
  ["clipRule", "clip-rule"],
  ["clipPath", "clip-path"],
  ["stopColor", "stop-color"],
  ["stopOpacity", "stop-opacity"],
  ["fontSize", "font-size"],
  ["fontFamily", "font-family"],
  ["fontWeight", "font-weight"],
  ["textAnchor", "text-anchor"],
  ["shapeRendering", "shape-rendering"],
  ["xlinkHref", "href"],
  ["xlink:href", "href"],
  ["className", "class"],
]);

const ignoredAttributes = new Set(["testID", "key"]);
const supportedRawExtensions = new Set([".tsx", ".jsx", ".svg"]);
const browserSourceDbName = "svg-workspace-browser-sources";
const browserSourceStoreName = "folders";

export function canUseBrowserFolderPicker() {
  return typeof (window as BrowserWindow).showDirectoryPicker === "function";
}

export async function scanBrowserIconFolder(): Promise<IconCatalog> {
  const picker = (window as BrowserWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error("Folder scanning is not supported in this browser.");
  }

  const root = await picker();
  await saveBrowserDirectoryHandle(root);
  return scanBrowserDirectoryHandle(root);
}

export async function chooseBrowserIconFolder() {
  const picker = (window as BrowserWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error("Folder scanning is not supported in this browser.");
  }

  const root = await picker();
  await saveBrowserDirectoryHandle(root);
  return {
    catalog: await scanBrowserDirectoryHandle(root),
    sourceKey: makeBrowserSourceKey(root.name),
    sourceLabel: root.name,
  };
}

export async function scanStoredBrowserIconFolder(sourceKey: string) {
  const root = await readBrowserDirectoryHandle(sourceKey);
  if (!root) {
    throw new Error("Choose this folder again to restore browser permission.");
  }

  await ensureBrowserDirectoryPermission(root);
  return {
    catalog: await scanBrowserDirectoryHandle(root),
    sourceKey,
    sourceLabel: root.name,
  };
}

async function scanBrowserDirectoryHandle(root: BrowserDirectoryHandle): Promise<IconCatalog> {
  const files = await collectSupportedFiles(root);
  const sourceMap = new Map<string, string>();
  for (const item of files) {
    sourceMap.set(item.path, await item.file.text());
  }
  const catalog: IconCatalog = {
    sourceDir: root.name,
    generatedAt: new Date().toISOString(),
    status: "ok",
    setupError: null,
    sourceTypes: [],
    icons: [],
    errors: [],
  };

  for (const item of files.sort((first, second) => first.path.localeCompare(second.path))) {
    const source = sourceMap.get(item.path) ?? "";
    const parsed = item.path.toLowerCase().endsWith(".svg")
      ? parseRawSvgSource(source, item.path)
      : parseJsxIconSource(source, {
          filePath: item.path,
          sourceMap,
          visitedFiles: new Set([item.path]),
        });

    if (!parsed.ok) {
      catalog.errors.push({ filePath: item.path, reason: parsed.reason });
      continue;
    }

    catalog.icons.push({
      name: parsed.icon.name,
      category: deriveCategory(item.path),
      filePath: item.path,
      sourceType: parsed.icon.sourceType,
      svg: parsed.icon.svg,
      importSnippet: makeImportSnippet(parsed.icon.name, item.path, parsed.icon.sourceType === "svg-file"),
      props: parsed.icon.props,
    });
  }

  catalog.sourceTypes = Array.from(
    new Set(catalog.icons.map((icon) => icon.sourceType).filter(Boolean)),
  ) as IconSourceType[];

  return catalog;
}

async function saveBrowserDirectoryHandle(handle: BrowserDirectoryHandle) {
  const db = await openBrowserSourceDb();
  await idbRequest(
    db.transaction(browserSourceStoreName, "readwrite")
      .objectStore(browserSourceStoreName)
      .put(handle, makeBrowserSourceKey(handle.name)),
  );
  db.close();
}

async function readBrowserDirectoryHandle(sourceKey: string) {
  const db = await openBrowserSourceDb();
  const handle = await idbRequest<BrowserDirectoryHandle | undefined>(
    db.transaction(browserSourceStoreName, "readonly")
      .objectStore(browserSourceStoreName)
      .get(sourceKey),
  );
  db.close();
  return handle ?? null;
}

async function ensureBrowserDirectoryPermission(handle: BrowserDirectoryHandle) {
  const descriptor = { mode: "read" as const };
  const currentPermission = await handle.queryPermission?.(descriptor);
  if (currentPermission === "granted") {
    return;
  }

  const nextPermission = await handle.requestPermission?.(descriptor);
  if (nextPermission && nextPermission !== "granted") {
    throw new Error("Folder permission was not granted.");
  }
}

function openBrowserSourceDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(browserSourceDbName, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(browserSourceStoreName);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function collectSupportedFiles(root: BrowserDirectoryHandle) {
  const files: Array<{ path: string; file: File }> = [];

  async function visit(directory: BrowserDirectoryHandle, segments: string[]) {
    for await (const handle of directory.values()) {
      if (handle.kind === "directory") {
        await visit(handle, [...segments, handle.name]);
        continue;
      }

      if (!isSupportedFileName(handle.name)) {
        continue;
      }

      files.push({
        path: [...segments, handle.name].join("/"),
        file: await handle.getFile(),
      });
    }
  }

  await visit(root, []);
  return files;
}

function isSupportedFileName(fileName: string) {
  const normalized = fileName.toLowerCase();
  return Array.from(supportedRawExtensions).some((extension) => normalized.endsWith(extension));
}

function parseRawSvgSource(source: string, relativePath: string): ParsedBrowserIcon {
  const svg = source
    .replace(/^\s*<\?xml[\s\S]*?\?>\s*/i, "")
    .replace(/^\s*<!doctype[\s\S]*?>\s*/i, "")
    .replace(/^\s*<!--[\s\S]*?-->\s*/g, "")
    .trim();

  if (!/^<svg[\s>]/i.test(svg)) {
    return { ok: false, reason: "Raw SVG file must start with <svg>" };
  }

  return {
    ok: true,
    icon: {
      name: makeComponentNameFromPath(relativePath),
      sourceType: "svg-file",
      svg,
    },
  };
}

function parseJsxIconSource(
  source: string,
  options: {
    filePath: string;
    sourceMap: Map<string, string>;
    visitedFiles: Set<string>;
  },
): ParsedBrowserIcon {
  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
  } catch (error) {
    return { ok: false, reason: `Unable to parse source: ${error instanceof Error ? error.message : String(error)}` };
  }

  const localComponents = collectLocalComponents(ast);
  const context: ParseContext = {
    ast,
    localComponents,
    filePath: options.filePath,
    sourceMap: options.sourceMap,
    visitedFiles: options.visitedFiles,
  };
  const candidate = findExportedComponent(ast, localComponents);
  if (!candidate) {
    return { ok: false, reason: "No exported icon component found" };
  }

  const returned = findReturnedExpression(candidate.body, candidate.defaultProps);
  if (!returned) {
    return { ok: false, reason: `No JSX return found for ${candidate.name}` };
  }

  const root = findSvgElement(returned, candidate.defaultProps, context);
  if (!root) {
    const mapped = renderMappedComponent(candidate, context);
    if (mapped.ok) {
      return {
        ok: true,
        icon: {
          name: candidate.name,
          sourceType: "react-native",
          svg: mapped.svg,
          ...(candidate.props.length > 0 ? { props: candidate.props } : {}),
        },
      };
    }

    return { ok: false, reason: "Root JSX element must be Svg or svg" };
  }

  const rendered = renderJsxElement(root, candidate.defaultProps, context);
  if (!rendered.ok) {
    return rendered;
  }

  return {
    ok: true,
    icon: {
      name: candidate.name,
      sourceType: getJsxElementName(root.openingElement.name) === "svg" ? "react" : "react-native",
      svg: rendered.svg,
      ...(candidate.props.length > 0 ? { props: candidate.props } : {}),
    },
  };
}

function findExportedComponent(ast: t.File, localComponents = collectLocalComponents(ast)): ComponentCandidate | null {
  for (const statement of ast.program.body) {
    if (t.isExportNamedDeclaration(statement) && statement.declaration) {
      const candidate = getNamedExportCandidate(statement.declaration);
      if (candidate) {
        return candidate;
      }
    }

    if (t.isExportNamedDeclaration(statement)) {
      for (const specifier of statement.specifiers) {
        if (t.isExportSpecifier(specifier) && t.isIdentifier(specifier.local)) {
          const candidate = localComponents.get(specifier.local.name);
          if (candidate) {
            return candidate;
          }
        }
      }
    }

    if (t.isExportDefaultDeclaration(statement)) {
      const declaration = statement.declaration;
      if (t.isFunctionDeclaration(declaration) && declaration.id) {
        return buildCandidate(declaration.id.name, declaration);
      }

      if (t.isIdentifier(declaration)) {
        const candidate = localComponents.get(declaration.name);
        if (candidate) {
          return candidate;
        }
      }

      if (t.isCallExpression(declaration)) {
        const firstArg = declaration.arguments[0];
        if (t.isIdentifier(firstArg)) {
          const candidate = localComponents.get(firstArg.name);
          if (candidate) {
            return candidate;
          }
        }
      }
    }
  }

  return null;
}

function collectLocalComponents(ast: t.File) {
  const components = new Map<string, ComponentCandidate>();

  for (const statement of ast.program.body) {
    if (t.isVariableDeclaration(statement)) {
      for (const declarator of statement.declarations) {
        if (t.isIdentifier(declarator.id) && declarator.init) {
          components.set(declarator.id.name, buildCandidate(declarator.id.name, declarator.init));
        }
      }
    }

    if (t.isFunctionDeclaration(statement) && statement.id) {
      components.set(statement.id.name, buildCandidate(statement.id.name, statement));
    }
  }

  return components;
}

function getNamedExportCandidate(declaration: t.Declaration): ComponentCandidate | null {
  if (t.isVariableDeclaration(declaration)) {
    for (const declarator of declaration.declarations) {
      if (t.isIdentifier(declarator.id) && declarator.init) {
        return buildCandidate(declarator.id.name, declarator.init);
      }
    }
  }

  if (t.isFunctionDeclaration(declaration) && declaration.id) {
    return buildCandidate(declaration.id.name, declaration);
  }

  return null;
}

function buildCandidate(name: string, body: t.Node): ComponentCandidate {
  return {
    name,
    body,
    defaultProps: collectDefaultProps(body),
    props: collectPropUsage(body),
  };
}

function renderMappedComponent(candidate: ComponentCandidate, context: ParseContext): { ok: true; svg: string } | { ok: false; reason: string } {
  const mappedComponentName = findFirstMappedComponentName(candidate.body);
  if (!mappedComponentName) {
    return { ok: false, reason: `Unsupported JSX return type for ${candidate.name}` };
  }

  const importPath = findDefaultImportSource(context.ast, mappedComponentName);
  if (!importPath) {
    return { ok: false, reason: `Unsupported JSX return type for ${candidate.name}` };
  }

  const resolvedPath = resolveImportPath(context.filePath, importPath, context.sourceMap);
  if (!resolvedPath) {
    return { ok: false, reason: `Unable to resolve mapped component ${mappedComponentName}` };
  }

  if (context.visitedFiles.has(resolvedPath)) {
    return { ok: false, reason: `Circular mapped component reference ${mappedComponentName}` };
  }

  const source = context.sourceMap.get(resolvedPath);
  if (!source) {
    return { ok: false, reason: `Unable to read mapped component ${mappedComponentName}` };
  }

  const parsed = parseJsxIconSource(source, {
    filePath: resolvedPath,
    sourceMap: context.sourceMap,
    visitedFiles: new Set([...context.visitedFiles, resolvedPath]),
  });

  return parsed.ok ? { ok: true, svg: parsed.icon.svg } : { ok: false, reason: parsed.reason };
}

function findFirstMappedComponentName(node: t.Node): string | null {
  const body = t.isArrowFunctionExpression(node) || t.isFunctionExpression(node) || t.isFunctionDeclaration(node) ? node.body : null;
  if (!body || !t.isBlockStatement(body)) {
    return null;
  }

  for (const statement of body.body) {
    if (!t.isVariableDeclaration(statement)) {
      continue;
    }

    for (const declarator of statement.declarations) {
      if (!t.isIdentifier(declarator.id) || !t.isObjectExpression(declarator.init)) {
        continue;
      }

      for (const property of declarator.init.properties) {
        if (!t.isObjectProperty(property) || !t.isJSXElement(property.value)) {
          continue;
        }

        const name = getJsxElementName(property.value.openingElement.name);
        if (name !== "Svg" && name !== "svg") {
          return name;
        }
      }
    }
  }

  return null;
}

function findDefaultImportSource(ast: t.File, localName: string): string | null {
  for (const statement of ast.program.body) {
    if (!t.isImportDeclaration(statement)) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (t.isImportDefaultSpecifier(specifier) && specifier.local.name === localName) {
        return statement.source.value;
      }
    }
  }

  return null;
}

function resolveImportPath(fromFilePath: string, importPath: string, sourceMap: Map<string, string>): string | null {
  if (!importPath.startsWith(".")) {
    return null;
  }

  const baseDir = fromFilePath.split("/").slice(0, -1);
  const segments = [...baseDir, ...importPath.split("/")];
  const normalizedSegments: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  const basePath = normalizedSegments.join("/");
  const candidates = [
    basePath,
    `${basePath}.tsx`,
    `${basePath}.jsx`,
    `${basePath}.ts`,
    `${basePath}.js`,
    `${basePath}/index.tsx`,
    `${basePath}/index.jsx`,
    `${basePath}/index.ts`,
    `${basePath}/index.js`,
  ];

  return candidates.find((candidate) => sourceMap.has(candidate)) ?? null;
}

function findReturnedExpression(node: t.Node, defaultProps: Map<string, string>): ReturnedExpression | null {
  if (t.isArrowFunctionExpression(node)) {
    if (t.isExpression(node.body) || t.isJSXElement(node.body)) {
      return node.body;
    }

    return findReturnStatementExpression(node.body, defaultProps);
  }

  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) {
    return findReturnStatementExpression(node.body, defaultProps);
  }

  return null;
}

function findReturnStatementExpression(block: t.BlockStatement, defaultProps: Map<string, string>): ReturnedExpression | null {
  for (const statement of block.body) {
    if (t.isReturnStatement(statement) && statement.argument && (t.isExpression(statement.argument) || t.isJSXElement(statement.argument))) {
      return statement.argument;
    }

    if (t.isIfStatement(statement)) {
      const knownTest = evaluateKnownPreviewBoolean(statement.test, defaultProps);
      if (knownTest === true) {
        return findReturnInStatement(statement.consequent, defaultProps);
      }

      if (knownTest === false) {
        return statement.alternate ? findReturnInStatement(statement.alternate, defaultProps) : null;
      }

      const consequent = findReturnInStatement(statement.consequent, defaultProps);
      if (consequent) {
        return consequent;
      }

      if (statement.alternate) {
        const alternate = findReturnInStatement(statement.alternate, defaultProps);
        if (alternate) {
          return alternate;
        }
      }
    }
  }

  return null;
}

function findReturnInStatement(statement: t.Statement, defaultProps: Map<string, string>): ReturnedExpression | null {
  if (t.isReturnStatement(statement) && statement.argument && (t.isExpression(statement.argument) || t.isJSXElement(statement.argument))) {
    return statement.argument;
  }

  if (t.isBlockStatement(statement)) {
    return findReturnStatementExpression(statement, defaultProps);
  }

  if (t.isIfStatement(statement)) {
    const knownTest = evaluateKnownPreviewBoolean(statement.test, defaultProps);
    if (knownTest === true) {
      return findReturnInStatement(statement.consequent, defaultProps);
    }

    if (knownTest === false) {
      return statement.alternate ? findReturnInStatement(statement.alternate, defaultProps) : null;
    }
  }

  return null;
}

function findSvgElement(node: t.Node, defaultProps: Map<string, string>, context: ParseContext): t.JSXElement | null {
  const selected = selectPreviewJsx(node, defaultProps);
  if (t.isJSXElement(selected)) {
    const name = getJsxElementName(selected.openingElement.name);
    if (name === "Svg" || name === "svg") {
      return selected;
    }

    const inline = resolveComponentElement(selected, defaultProps, context);
    if (inline.ok) {
      return findSvgElement(inline.expression, inline.defaultProps, inline.context);
    }

    for (const child of selected.children) {
      if (t.isJSXElement(child)) {
        const nested = findSvgElement(child, defaultProps, context);
        if (nested) {
          return nested;
        }
      }

      if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
        const nested = findSvgElement(child.expression, defaultProps, context);
        if (nested) {
          return nested;
        }
      }
    }
  }

  if (t.isJSXFragment(selected)) {
    for (const child of selected.children) {
      if (t.isJSXElement(child)) {
        const nested = findSvgElement(child, defaultProps, context);
        if (nested) {
          return nested;
        }
      }
    }
  }

  if (t.isConditionalExpression(selected)) {
    return findSvgElement(selected.consequent, defaultProps, context) ?? findSvgElement(selected.alternate, defaultProps, context);
  }

  if (t.isLogicalExpression(selected) && selected.operator === "&&" && evaluateKnownPreviewBoolean(selected.left, defaultProps) !== false) {
    if (t.isExpression(selected.right) || t.isJSXElement(selected.right) || t.isJSXFragment(selected.right)) {
      return findSvgElement(selected.right, defaultProps, context);
    }
  }

  return null;
}

function selectPreviewJsx(node: t.Node, defaultProps: Map<string, string>): ReturnedExpression {
  if (t.isConditionalExpression(node)) {
    const testValue = evaluateKnownPreviewBoolean(node.test, defaultProps);
    return testValue === false ? node.alternate : node.consequent;
  }

  return node as ReturnedExpression;
}

function resolveComponentElement(
  element: t.JSXElement,
  parentDefaults: Map<string, string>,
  context: ParseContext,
):
  | { ok: true; expression: ReturnedExpression; defaultProps: Map<string, string>; context: ParseContext }
  | { ok: false; reason: string } {
  const componentName = getJsxElementName(element.openingElement.name);
  const localComponent = context.localComponents.get(componentName);
  if (localComponent) {
    const defaultProps = mergeElementProps(localComponent.defaultProps, element, parentDefaults);
    const expression = findReturnedExpression(localComponent.body, defaultProps);
    return expression ? { ok: true, expression, defaultProps, context } : { ok: false, reason: `No JSX return found for ${componentName}` };
  }

  const importPath = findImportSource(context.ast, componentName);
  if (!importPath) {
    return { ok: false, reason: `Unsupported SVG element ${componentName}` };
  }

  const resolvedPath = resolveImportPath(context.filePath, importPath, context.sourceMap);
  if (!resolvedPath || context.visitedFiles.has(resolvedPath)) {
    return { ok: false, reason: `Unable to resolve component ${componentName}` };
  }

  const source = context.sourceMap.get(resolvedPath);
  if (!source) {
    return { ok: false, reason: `Unable to read component ${componentName}` };
  }

  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
  } catch (error) {
    return { ok: false, reason: `Unable to parse component ${componentName}: ${error instanceof Error ? error.message : String(error)}` };
  }

  const localComponents = collectLocalComponents(ast);
  const candidate = findExportedComponent(ast, localComponents);
  if (!candidate) {
    return { ok: false, reason: `No exported icon component found for ${componentName}` };
  }

  const nestedContext: ParseContext = {
    ast,
    localComponents,
    filePath: resolvedPath,
    sourceMap: context.sourceMap,
    visitedFiles: new Set([...context.visitedFiles, resolvedPath]),
  };

  const defaultProps = mergeElementProps(candidate.defaultProps, element, parentDefaults);
  const expression = findReturnedExpression(candidate.body, defaultProps);
  return expression ? { ok: true, expression, defaultProps, context: nestedContext } : { ok: false, reason: `No JSX return found for ${componentName}` };
}

function mergeElementProps(
  baseDefaults: Map<string, string>,
  element: t.JSXElement,
  parentDefaults: Map<string, string>,
) {
  const next = new Map(baseDefaults);

  for (const attribute of element.openingElement.attributes) {
    if (!t.isJSXAttribute(attribute)) {
      continue;
    }

    const name = getJsxAttributeName(attribute.name);
    const value = renderAttributeValue(name, attribute.value, parentDefaults);
    if (value.ok) {
      next.set(name, value.value);
    }
  }

  return next;
}

function findImportSource(ast: t.File, localName: string): string | null {
  for (const statement of ast.program.body) {
    if (!t.isImportDeclaration(statement)) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (
        (t.isImportDefaultSpecifier(specifier) || t.isImportSpecifier(specifier)) &&
        specifier.local.name === localName
      ) {
        return statement.source.value;
      }
    }
  }

  return null;
}

function renderJsxElement(element: t.JSXElement, defaultProps: Map<string, string>, context: ParseContext): { ok: true; svg: string } | { ok: false; reason: string } {
  const sourceName = getJsxElementName(element.openingElement.name);
  const tagName = svgElementMap.get(sourceName) ?? sourceName;

  if (!isSupportedSvgElementName(sourceName)) {
    const inline = resolveComponentElement(element, defaultProps, context);
    if (inline.ok) {
      return renderReturnedExpression(inline.expression, sourceName, inline.defaultProps, inline.context);
    }

    return { ok: false, reason: `Unsupported SVG element ${sourceName}` };
  }

  const renderedAttributes = renderAttributes(element.openingElement.attributes, defaultProps);
  if (!renderedAttributes.ok) {
    return renderedAttributes;
  }

  const children: string[] = [];
  for (const child of element.children) {
    if (t.isJSXText(child)) {
      const text = child.value.trim();
      if (text) {
        children.push(escapeText(text));
      }
      continue;
    }

    if (t.isJSXElement(child)) {
      const rendered = renderJsxElement(child, defaultProps, context);
      if (!rendered.ok) {
        return rendered;
      }
      children.push(rendered.svg);
      continue;
    }

    if (t.isJSXExpressionContainer(child)) {
      if (t.isJSXEmptyExpression(child.expression)) {
        continue;
      }

      const renderedExpression = renderJsxExpressionChild(child.expression, sourceName, defaultProps, context);
      if (!renderedExpression.ok) {
        return renderedExpression;
      }

      if (renderedExpression.svg) {
        children.push(renderedExpression.svg);
      }
      continue;
    }
  }

  const attrs = renderedAttributes.attributes.length > 0 ? ` ${renderedAttributes.attributes.join(" ")}` : "";
  if (children.length === 0 && tagName !== "svg") {
    return { ok: true, svg: `<${tagName}${attrs}/>` };
  }

  return { ok: true, svg: `<${tagName}${attrs}>${children.join("")}</${tagName}>` };
}

function renderReturnedExpression(
  expression: ReturnedExpression,
  contextName: string,
  defaultProps: Map<string, string>,
  context: ParseContext,
): { ok: true; svg: string } | { ok: false; reason: string } {
  const selected = selectPreviewJsx(expression, defaultProps);

  if (t.isJSXElement(selected)) {
    return renderJsxElement(selected, defaultProps, context);
  }

  if (t.isJSXFragment(selected)) {
    const rendered = renderJsxFragmentChildren(selected, contextName, defaultProps, context);
    return rendered.ok ? { ok: true, svg: rendered.svg } : rendered;
  }

  return { ok: false, reason: `Unsupported JSX return type for ${contextName}` };
}

function renderJsxFragmentChildren(
  fragment: t.JSXFragment,
  contextName: string,
  defaultProps: Map<string, string>,
  context: ParseContext,
): { ok: true; svg: string } | { ok: false; reason: string } {
  const childParts: string[] = [];

  for (const child of fragment.children) {
    if (t.isJSXText(child)) {
      const text = child.value.trim();
      if (text) {
        childParts.push(escapeText(text));
      }
      continue;
    }

    if (t.isJSXElement(child)) {
      const rendered = renderJsxElement(child, defaultProps, context);
      if (!rendered.ok) {
        return rendered;
      }
      childParts.push(rendered.svg);
      continue;
    }

    if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      const rendered = renderJsxExpressionChild(child.expression, contextName, defaultProps, context);
      if (!rendered.ok) {
        return rendered;
      }
      if (rendered.svg) {
        childParts.push(rendered.svg);
      }
    }
  }

  return { ok: true, svg: childParts.join("") };
}

function renderJsxExpressionChild(
  expression: t.Expression,
  contextName: string,
  defaultProps: Map<string, string>,
  context: ParseContext,
): { ok: true; svg: string | null } | { ok: false; reason: string } {
  if (t.isLogicalExpression(expression) && expression.operator === "&&") {
    const knownValue = evaluateKnownPreviewBoolean(expression.left, defaultProps);
    if (knownValue === false) {
      return { ok: true, svg: null };
    }

    if (t.isJSXElement(expression.right)) {
      const rendered = renderJsxElement(expression.right, defaultProps, context);
      return rendered.ok ? { ok: true, svg: rendered.svg } : rendered;
    }

    if (t.isJSXFragment(expression.right)) {
      const rendered = renderJsxFragmentChildren(expression.right, contextName, defaultProps, context);
      return rendered.ok ? { ok: true, svg: rendered.svg } : rendered;
    }
  }

  if (t.isConditionalExpression(expression)) {
    const selected = selectPreviewJsx(expression, defaultProps);
    if (t.isJSXElement(selected)) {
      const rendered = renderJsxElement(selected, defaultProps, context);
      return rendered.ok ? { ok: true, svg: rendered.svg } : rendered;
    }

    if (t.isJSXFragment(selected)) {
      const rendered = renderJsxFragmentChildren(selected, contextName, defaultProps, context);
      return rendered.ok ? { ok: true, svg: rendered.svg } : rendered;
    }
  }

  if (t.isBinaryExpression(expression)) {
    return { ok: true, svg: "1" };
  }

  if (t.isStringLiteral(expression) || t.isNumericLiteral(expression)) {
    return { ok: true, svg: escapeText(String(expression.value)) };
  }

  if (t.isIdentifier(expression)) {
    return { ok: true, svg: escapeText(defaultProps.get(expression.name) ?? "1") };
  }

  return { ok: false, reason: `Unsupported JSX expression container in ${contextName} children` };
}

function renderAttributes(attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[], defaultProps: Map<string, string>) {
  const rendered: string[] = [];

  for (const attribute of attributes) {
    if (t.isJSXSpreadAttribute(attribute)) {
      continue;
    }

    const rawName = getJsxAttributeName(attribute.name);
    if (ignoredAttributes.has(rawName) || rawName.startsWith("aria-")) {
      continue;
    }

    const name = svgAttributeMap.get(rawName) ?? rawName;
    const value = renderAttributeValue(rawName, attribute.value, defaultProps);
    if (!value.ok) {
      return value;
    }

    rendered.push(`${name}="${escapeAttribute(value.value)}"`);
  }

  return { ok: true as const, attributes: rendered };
}

function renderAttributeValue(name: string, value: t.JSXAttribute["value"], defaultProps: Map<string, string>) {
  if (!value) {
    return { ok: true as const, value: "true" };
  }

  if (t.isStringLiteral(value)) {
    return { ok: true as const, value: value.value };
  }

  if (!t.isJSXExpressionContainer(value) || t.isJSXEmptyExpression(value.expression)) {
    return { ok: false as const, reason: `Unsupported dynamic JSX expression in ${name}` };
  }

  const expression = value.expression;
  if (name === "style" && t.isObjectExpression(expression)) {
    return renderStyleValue(expression);
  }

  const expressionValue = renderExpressionAttributeValue(name, expression, defaultProps);
  if (expressionValue !== null) {
    return { ok: true as const, value: expressionValue };
  }

  return { ok: false as const, reason: `Unsupported dynamic JSX expression in ${name}` };
}

function renderExpressionAttributeValue(
  name: string,
  expression: t.Expression,
  defaultProps: Map<string, string>,
): string | null {
  if (t.isNumericLiteral(expression) || t.isStringLiteral(expression) || t.isBooleanLiteral(expression)) {
    return String(expression.value);
  }

  if (t.isUnaryExpression(expression) && expression.operator === "-" && t.isNumericLiteral(expression.argument)) {
    return String(-expression.argument.value);
  }

  if (t.isConditionalExpression(expression)) {
    const testValue = evaluateKnownPreviewBoolean(expression.test, defaultProps);
    return renderExpressionAttributeValue(
      name,
      testValue === false ? expression.alternate : expression.consequent,
      defaultProps,
    );
  }

  if (t.isBinaryExpression(expression)) {
    const value = evaluateNumericExpression(expression, defaultProps);
    return value === null ? null : String(value);
  }

  if (t.isTemplateLiteral(expression)) {
    return renderTemplateLiteral(expression, defaultProps);
  }

  if (t.isIdentifier(expression)) {
    const defaultValue = defaultProps.get(expression.name);
    if (defaultValue) {
      return defaultValue;
    }

    if (expression.name === "length") {
      return "100%";
    }

    if ((name === "width" || name === "height") && expression.name === "size") {
      return "24";
    }

    if ((name === "fill" || name === "stroke") && expression.name === "color") {
      return "currentColor";
    }

    return null;
  }

  if (t.isMemberExpression(expression)) {
    return resolvePreviewDefault(expression);
  }

  return null;
}

function renderStyleValue(expression: t.ObjectExpression) {
  const declarations: string[] = [];

  for (const property of expression.properties) {
    if (!t.isObjectProperty(property)) {
      return { ok: false as const, reason: "Unsupported dynamic JSX expression in style" };
    }

    const key = getStylePropertyName(property.key);
    if (!key) {
      return { ok: false as const, reason: "Unsupported dynamic JSX expression in style" };
    }

    const value = property.value;
    if (!t.isStringLiteral(value) && !t.isNumericLiteral(value)) {
      return { ok: false as const, reason: "Unsupported dynamic JSX expression in style" };
    }

    declarations.push(`${toKebabCase(key)}:${String(value.value)}`);
  }

  return { ok: true as const, value: declarations.join(";") };
}

function getStylePropertyName(key: t.ObjectProperty["key"]) {
  if (t.isIdentifier(key)) {
    return key.name;
  }

  if (t.isStringLiteral(key)) {
    return key.value;
  }

  return null;
}

function toKebabCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function collectDefaultProps(node: t.Node) {
  const defaults = new Map<string, string>();
  const params = t.isArrowFunctionExpression(node) || t.isFunctionDeclaration(node) || t.isFunctionExpression(node) ? node.params : [];
  const firstParam = params[0];

  if (!firstParam || !t.isObjectPattern(firstParam)) {
    return defaults;
  }

  for (const property of firstParam.properties) {
    if (!t.isObjectProperty(property) || !t.isIdentifier(property.key)) {
      continue;
    }

    if (t.isIdentifier(property.value) && property.key.name === "isFocused") {
      defaults.set(property.value.name, "true");
      continue;
    }

    if (!t.isAssignmentPattern(property.value) || !t.isIdentifier(property.value.left)) {
      continue;
    }

    const defaultValue = property.value.left.name === "fill" ? "#7B50B3" : resolvePreviewDefault(property.value.right);
    if (defaultValue) {
      defaults.set(property.value.left.name, defaultValue);
    }
  }

  return defaults;
}

function collectPropUsage(node: t.Node): IconPropUsage[] {
  const params = t.isArrowFunctionExpression(node) || t.isFunctionDeclaration(node) || t.isFunctionExpression(node) ? node.params : [];
  const firstParam = params[0];

  if (!firstParam || !t.isObjectPattern(firstParam)) {
    return [];
  }

  return firstParam.properties.flatMap((property) => {
    if (!t.isObjectProperty(property) || !t.isIdentifier(property.key)) {
      return [];
    }

    const name = property.key.name;
    if (t.isIdentifier(property.value)) {
      return [{ name, value: name.startsWith("is") ? null : "{/* value */}", shorthand: name.startsWith("is") }];
    }

    if (!t.isAssignmentPattern(property.value)) {
      return [];
    }

    return [{ name, value: renderUsageValue(property.value.right), shorthand: false }];
  });
}

function renderUsageValue(expression: t.Expression | t.PatternLike) {
  if (t.isNumericLiteral(expression)) {
    return `{${expression.value}}`;
  }

  if (t.isStringLiteral(expression)) {
    return `{${JSON.stringify(expression.value)}}`;
  }

  if (t.isMemberExpression(expression)) {
    const object = renderMemberSide(expression.object);
    const property = renderMemberSide(expression.property);
    return object && property ? `{${object}.${property}}` : "{/* value */}";
  }

  return "{/* value */}";
}

function renderMemberSide(node: t.Expression | t.PrivateName): string | null {
  if (t.isIdentifier(node)) {
    return node.name;
  }

  if (t.isMemberExpression(node)) {
    const object = renderMemberSide(node.object);
    const property = renderMemberSide(node.property);
    return object && property ? `${object}.${property}` : null;
  }

  return null;
}

function resolvePreviewDefault(expression: t.Expression | t.PrivateName): string | null {
  if (t.isBooleanLiteral(expression)) {
    return String(expression.value);
  }

  if (t.isNumericLiteral(expression) || t.isStringLiteral(expression)) {
    return String(expression.value);
  }

  if (t.isMemberExpression(expression)) {
    const property = expression.property;
    if (t.isIdentifier(property)) {
      const match = /^_(\d+)$/.exec(property.name);
      return match ? match[1] : property.name;
    }

    if (t.isNumericLiteral(property)) {
      return String(property.value);
    }
  }

  return null;
}

function evaluateNumericExpression(expression: t.Expression, defaultProps: Map<string, string>): number | null {
  if (t.isNumericLiteral(expression)) {
    return expression.value;
  }

  if (t.isUnaryExpression(expression) && expression.operator === "-" && t.isNumericLiteral(expression.argument)) {
    return -expression.argument.value;
  }

  if (t.isIdentifier(expression)) {
    const value = defaultProps.get(expression.name);
    if (!value) {
      return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (!t.isBinaryExpression(expression) || !t.isExpression(expression.left) || !t.isExpression(expression.right)) {
    return null;
  }

  const left = evaluateNumericExpression(expression.left, defaultProps);
  const right = evaluateNumericExpression(expression.right, defaultProps);
  if (left === null || right === null) {
    return null;
  }

  switch (expression.operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? null : left / right;
    default:
      return null;
  }
}

function renderTemplateLiteral(expression: t.TemplateLiteral, defaultProps: Map<string, string>): string | null {
  let value = "";
  for (let index = 0; index < expression.quasis.length; index += 1) {
    value += expression.quasis[index].value.cooked ?? expression.quasis[index].value.raw;
    const dynamicExpression = expression.expressions[index];
    if (!dynamicExpression || !t.isExpression(dynamicExpression)) {
      continue;
    }

    const rendered = renderExpressionAttributeValue("template", dynamicExpression, defaultProps);
    if (rendered === null) {
      return null;
    }
    value += rendered;
  }

  return value;
}

function evaluateKnownPreviewBoolean(expression: t.Expression, defaultProps: Map<string, string>): boolean | null {
  if (t.isBooleanLiteral(expression)) {
    return expression.value;
  }

  if (t.isUnaryExpression(expression) && expression.operator === "!") {
    const value = evaluateKnownPreviewBoolean(expression.argument, defaultProps);
    return value === null ? null : !value;
  }

  if (t.isIdentifier(expression)) {
    const value = defaultProps.get(expression.name);
    return value ? value === "true" : null;
  }

  if (t.isBinaryExpression(expression) && (expression.operator === "===" || expression.operator === "!==")) {
    const left = getPreviewScalar(expression.left, defaultProps);
    const right = getPreviewScalar(expression.right, defaultProps);
    if (left === null || right === null) {
      return null;
    }

    return expression.operator === "===" ? left === right : left !== right;
  }

  return null;
}

function getPreviewScalar(expression: t.Expression | t.PrivateName, defaultProps: Map<string, string>): string | null {
  if (t.isBooleanLiteral(expression)) {
    return String(expression.value);
  }

  if (t.isNumericLiteral(expression) || t.isStringLiteral(expression)) {
    return String(expression.value);
  }

  if (t.isUnaryExpression(expression) && expression.operator === "-" && t.isNumericLiteral(expression.argument)) {
    return String(-expression.argument.value);
  }

  if (t.isIdentifier(expression)) {
    return defaultProps.get(expression.name) ?? null;
  }

  if (t.isMemberExpression(expression)) {
    const property = expression.property;
    if (t.isIdentifier(property)) {
      const match = /^_(\d+)$/.exec(property.name);
      return match ? match[1] : property.name;
    }

    if (t.isNumericLiteral(property)) {
      return String(property.value);
    }
  }

  return null;
}

function isSupportedSvgElementName(name: string) {
  return name === "svg" || svgElementMap.has(name) || Array.from(svgElementMap.values()).includes(name);
}

function getJsxElementName(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName) {
  return t.isJSXIdentifier(name) ? name.name : "unsupported";
}

function getJsxAttributeName(name: t.JSXIdentifier | t.JSXNamespacedName) {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }

  return `${name.namespace.name}:${name.name.name}`;
}

function deriveCategory(relativePath: string) {
  const segments = relativePath.split("/").filter(Boolean);
  return segments.length > 1 ? segments[0] : "uncategorized";
}

function makeImportSnippet(componentName: string, relativePath: string, importAsAsset: boolean) {
  if (importAsAsset) {
    return `import ${componentName} from '@/icons/${relativePath}';`;
  }

  return `import { ${componentName} } from '@/icons/${stripExtension(relativePath)}';`;
}

function stripExtension(relativePath: string) {
  return relativePath.replace(/\.(?:[jt]sx|svg)$/i, "");
}

function makeComponentNameFromPath(relativePath: string) {
  const baseName = stripExtension(relativePath).split("/").pop() ?? "SvgIcon";
  const name = baseName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("");

  return name || "SvgIcon";
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
