import { parse } from "@babel/parser";
import * as t from "@babel/types";
import type { IconCatalog, IconPropUsage, IconSourceType } from "../../types";

type BrowserDirectoryHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<BrowserFileSystemHandle>;
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

export function canUseBrowserFolderPicker() {
  return typeof (window as BrowserWindow).showDirectoryPicker === "function";
}

export async function scanBrowserIconFolder(): Promise<IconCatalog> {
  const picker = (window as BrowserWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error("Folder scanning is not supported in this browser.");
  }

  const root = await picker();
  const files = await collectSupportedFiles(root);
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
    const source = await item.file.text();
    const parsed = item.path.toLowerCase().endsWith(".svg")
      ? parseRawSvgSource(source, item.path)
      : parseJsxIconSource(source);

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

function parseJsxIconSource(source: string): ParsedBrowserIcon {
  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
  } catch (error) {
    return { ok: false, reason: `Unable to parse source: ${error instanceof Error ? error.message : String(error)}` };
  }

  const candidate = findExportedComponent(ast);
  if (!candidate) {
    return { ok: false, reason: "No exported icon component found" };
  }

  const returned = findReturnedExpression(candidate.body);
  if (!returned) {
    return { ok: false, reason: `No JSX return found for ${candidate.name}` };
  }

  const root = findSvgElement(returned);
  if (!root) {
    return { ok: false, reason: "Root JSX element must be Svg or svg" };
  }

  const rendered = renderJsxElement(root, candidate.defaultProps);
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

function findExportedComponent(ast: t.File): ComponentCandidate | null {
  const localComponents = collectLocalComponents(ast);

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

function findReturnedExpression(node: t.Node): t.Expression | t.JSXElement | null {
  if (t.isArrowFunctionExpression(node)) {
    if (t.isExpression(node.body) || t.isJSXElement(node.body)) {
      return node.body;
    }

    return findReturnStatementExpression(node.body);
  }

  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) {
    return findReturnStatementExpression(node.body);
  }

  return null;
}

function findReturnStatementExpression(block: t.BlockStatement): t.Expression | t.JSXElement | null {
  for (const statement of block.body) {
    if (t.isReturnStatement(statement) && statement.argument && (t.isExpression(statement.argument) || t.isJSXElement(statement.argument))) {
      return statement.argument;
    }
  }

  return null;
}

function findSvgElement(node: t.Node): t.JSXElement | null {
  if (t.isJSXElement(node)) {
    const name = getJsxElementName(node.openingElement.name);
    if (name === "Svg" || name === "svg") {
      return node;
    }

    for (const child of node.children) {
      if (t.isJSXElement(child)) {
        const nested = findSvgElement(child);
        if (nested) {
          return nested;
        }
      }
    }
  }

  if (t.isConditionalExpression(node)) {
    return findSvgElement(node.consequent) ?? findSvgElement(node.alternate);
  }

  if (t.isLogicalExpression(node) && (t.isExpression(node.right) || t.isJSXElement(node.right))) {
    return findSvgElement(node.right);
  }

  return null;
}

function renderJsxElement(element: t.JSXElement, defaultProps: Map<string, string>): { ok: true; svg: string } | { ok: false; reason: string } {
  const sourceName = getJsxElementName(element.openingElement.name);
  const tagName = svgElementMap.get(sourceName) ?? sourceName;

  if (!isSupportedSvgElementName(sourceName)) {
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
      const rendered = renderJsxElement(child, defaultProps);
      if (!rendered.ok) {
        return rendered;
      }
      children.push(rendered.svg);
      continue;
    }
  }

  const attrs = renderedAttributes.attributes.length > 0 ? ` ${renderedAttributes.attributes.join(" ")}` : "";
  if (children.length === 0 && tagName !== "svg") {
    return { ok: true, svg: `<${tagName}${attrs}/>` };
  }

  return { ok: true, svg: `<${tagName}${attrs}>${children.join("")}</${tagName}>` };
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
  if (t.isNumericLiteral(expression) || t.isStringLiteral(expression) || t.isBooleanLiteral(expression)) {
    return { ok: true as const, value: String(expression.value) };
  }

  if (t.isIdentifier(expression)) {
    return { ok: true as const, value: defaultProps.get(expression.name) ?? (expression.name === "color" ? "currentColor" : "1") };
  }

  if (t.isMemberExpression(expression)) {
    return { ok: true as const, value: resolvePreviewDefault(expression) ?? "1" };
  }

  return { ok: false as const, reason: `Unsupported dynamic JSX expression in ${name}` };
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
