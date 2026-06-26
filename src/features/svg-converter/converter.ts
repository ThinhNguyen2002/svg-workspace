export const sampleSvg = `<svg width="124" height="124" viewBox="0 0 124 124" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="124" height="124" rx="24" fill="#A7FC7C" />
  <path d="M19.375 36.7818V100.625C19.375 102.834 21.1659 104.625 23.375 104.625H87.2181C90.7818 104.625 92.5664 100.316 90.0466 97.7966L26.2034 33.9534C23.6836 31.4336 19.375 33.2182 19.375 36.7818Z" fill="#12330F" />
  <circle cx="63.2109" cy="37.5391" r="18.1641" fill="white" />
</svg>`;

export type SvgConverterTarget = "react-native" | "react";

export function convertSvgToJsx(
  svgInput: string,
  rawComponentName: string,
  target: SvgConverterTarget,
) {
  const trimmedSvg = svgInput.trim();
  const componentName = toComponentName(rawComponentName);

  if (!trimmedSvg) {
    return { code: "", error: null, previewSvg: "" };
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(trimmedSvg, "image/svg+xml");
  const parseError = document.querySelector("parsererror");

  if (parseError) {
    return {
      code: "",
      error: "Invalid SVG markup.",
      previewSvg: "",
    };
  }

  const root = document.documentElement;

  if (!root || root.tagName.toLowerCase() !== "svg") {
    return {
      code: "",
      error: "Root element must be <svg>.",
      previewSvg: "",
    };
  }

  if (target === "react") {
    return {
      code: buildReactComponentCode(root, componentName),
      error: null,
      previewSvg: sanitizeSvgForPreview(root),
    };
  }

  return {
    code: buildReactNativeComponentCode(root, componentName),
    error: null,
    previewSvg: sanitizeSvgForPreview(root),
  };
}

function buildReactNativeComponentCode(root: Element, componentName: string) {
  const imports = new Set<string>(["Svg"]);
  const defaultSize = getReactNativeDefaultSize(root);
  const jsx = renderSvgNode(root, 1, imports, {
    isRoot: true,
    target: "react-native",
  });
  const importNames = Array.from(imports).sort((first, second) => {
    if (first === "Svg") {
      return -1;
    }

    if (second === "Svg") {
      return 1;
    }

    return first.localeCompare(second);
  });
  const namedImportNames = importNames.filter((item) => item !== "Svg");
  const svgImport = namedImportNames.length > 0
    ? `import Svg, { ${namedImportNames.join(", ")} } from 'react-native-svg';`
    : `import Svg from 'react-native-svg';`;

  return [
    `import React, { FC } from 'react';`,
    svgImport,
    `import { IconSVGProps } from './type';`,
    `import { SIZE_VALUE } from '@src/constants';`,
    "",
    `const ${componentName}: FC<IconSVGProps> = ({`,
    `  width = SIZE_VALUE._${defaultSize.width},`,
    `  height = SIZE_VALUE._${defaultSize.height},`,
    `}) => (`,
    jsx,
    ");",
    "",
    `export default ${componentName};`,
  ].join("\n");
}

function getReactNativeDefaultSize(root: Element) {
  const viewBoxSize = getViewBoxSize(root.getAttribute("viewBox"));
  const width = getNumericSvgSize(root.getAttribute("width")) ?? viewBoxSize?.width ?? 24;
  const height = getNumericSvgSize(root.getAttribute("height")) ?? viewBoxSize?.height ?? 24;

  return {
    width,
    height,
  };
}

function getNumericSvgSize(value: string | null) {
  if (!value) {
    return null;
  }

  const match = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/i.exec(value);
  if (!match) {
    return null;
  }

  const numericValue = Number(match[1]);
  return Number.isFinite(numericValue) ? formatSizeValue(numericValue) : null;
}

function getViewBoxSize(value: string | null) {
  if (!value) {
    return null;
  }

  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return {
    width: formatSizeValue(parts[2]),
    height: formatSizeValue(parts[3]),
  };
}

function formatSizeValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", "_");
}

function buildReactComponentCode(root: Element, componentName: string) {
  const jsx = renderSvgNode(root, 1, null, {
    isRoot: true,
    target: "react",
  });

  return [
    `import React, { FC, SVGProps } from 'react';`,
    "",
    `const ${componentName}: FC<SVGProps<SVGSVGElement>> = (props) => (`,
    jsx,
    ");",
    "",
    `export default ${componentName};`,
  ].join("\n");
}

function renderSvgNode(
  node: Element,
  depth: number,
  imports: Set<string> | null,
  options: {
    isRoot?: boolean;
    target: SvgConverterTarget;
  },
): string {
  const componentName = options.target === "react-native"
    ? svgTagToReactNativeComponent(node.tagName)
    : svgTagToReactComponent(node.tagName);
  imports?.add(componentName);

  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);
  const attributes = renderSvgAttributes(node, options);
  const children = Array.from(node.childNodes)
    .map((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        return renderSvgNode(child as Element, depth + 1, imports, {
          target: options.target,
        });
      }

      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        return `${childIndent}{${JSON.stringify(child.textContent.trim())}}`;
      }

      return null;
    })
    .filter((child): child is string => Boolean(child));

  const opening = attributes.length > 0
    ? `${indent}<${componentName}\n${attributes.map((attribute) => `${childIndent}${attribute}`).join("\n")}`
    : `${indent}<${componentName}`;

  if (children.length === 0) {
    return attributes.length > 0 ? `${opening}\n${indent}/>` : `${opening} />`;
  }

  return [
    attributes.length > 0 ? `${opening}\n${indent}>` : `${opening}>`,
    ...children,
    `${indent}</${componentName}>`,
  ].join("\n");
}

function renderSvgAttributes(
  node: Element,
  options: {
    isRoot?: boolean;
    target: SvgConverterTarget;
  },
) {
  const attributes = Array.from(node.attributes)
    .map((attribute) =>
      convertSvgAttribute(attribute.name, attribute.value, options.target),
    )
    .filter((attribute): attribute is string => Boolean(attribute));

  if (!options.isRoot) {
    return attributes;
  }

  if (options.target === "react") {
    return [...attributes, "{...props}"];
  }

  return ["width={width}", "height={height}", ...attributes.filter((attribute) => {
    return !attribute.startsWith("width=") && !attribute.startsWith("height=");
  })];
}

function convertSvgAttribute(
  name: string,
  value: string,
  target: SvgConverterTarget,
) {
  const ignoredAttributes = target === "react-native"
    ? ["xmlns", "xmlns:xlink", "version", "xml:space"]
    : ["version"];

  if (ignoredAttributes.includes(name)) {
    return null;
  }

  const jsxName = svgAttributeToJsxName(name);

  if (jsxName === "style") {
    return `style={${cssStyleToReactNativeStyle(value)}}`;
  }

  return `${jsxName}=${formatJsxAttributeValue(value)}`;
}

function svgTagToReactNativeComponent(tagName: string) {
  const normalized = tagName.toLowerCase();
  const tagMap: Record<string, string> = {
    circle: "Circle",
    clippath: "ClipPath",
    defs: "Defs",
    ellipse: "Ellipse",
    feblend: "FeBlend",
    fecolormatrix: "FeColorMatrix",
    fecomposite: "FeComposite",
    feflood: "FeFlood",
    fegaussianblur: "FeGaussianBlur",
    feoffset: "FeOffset",
    filter: "Filter",
    g: "G",
    image: "Image",
    line: "Line",
    lineargradient: "LinearGradient",
    mask: "Mask",
    path: "Path",
    pattern: "Pattern",
    polygon: "Polygon",
    polyline: "Polyline",
    radialgradient: "RadialGradient",
    rect: "Rect",
    stop: "Stop",
    svg: "Svg",
    symbol: "Symbol",
    text: "Text",
    textpath: "TextPath",
    tspan: "TSpan",
    use: "Use",
  };

  return tagMap[normalized] ?? toComponentName(normalized);
}

function svgTagToReactComponent(tagName: string) {
  return tagName.toLowerCase();
}

function svgAttributeToJsxName(name: string) {
  const attributeMap: Record<string, string> = {
    class: "className",
    "clip-path": "clipPath",
    "clip-rule": "clipRule",
    "fill-rule": "fillRule",
    "font-family": "fontFamily",
    "font-size": "fontSize",
    "font-weight": "fontWeight",
    "mask-type": "maskType",
    "shape-rendering": "shapeRendering",
    "stop-color": "stopColor",
    "stop-opacity": "stopOpacity",
    "stroke-dasharray": "strokeDasharray",
    "stroke-dashoffset": "strokeDashoffset",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "stroke-miterlimit": "strokeMiterlimit",
    "stroke-width": "strokeWidth",
    "text-anchor": "textAnchor",
    "xml:space": "xmlSpace",
    "xlink:href": "href",
  };

  return attributeMap[name] ??
    name.replace(/[-:]([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function formatJsxAttributeValue(value: string) {
  const trimmedValue = value.trim();

  if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
    return `{${trimmedValue}}`;
  }

  return JSON.stringify(trimmedValue);
}

function cssStyleToReactNativeStyle(value: string) {
  const entries = value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawKey, ...rawValue] = entry.split(":");
      const key = rawKey.trim().replace(/-([a-z])/g, (_, letter: string) =>
        letter.toUpperCase(),
      );
      const styleValue = rawValue.join(":").trim();
      return `${JSON.stringify(key)}: ${formatStyleValue(styleValue)}`;
    });

  return `{ ${entries.join(", ")} }`;
}

function formatStyleValue(value: string) {
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function toComponentName(value: string) {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");

  if (!normalized) {
    return "ConvertedIcon";
  }

  return /^[0-9]/.test(normalized) ? `Icon${normalized}` : normalized;
}

function sanitizeSvgForPreview(root: Element) {
  const clonedRoot = root.cloneNode(true) as Element;

  clonedRoot.querySelectorAll("script, foreignObject").forEach((node) =>
    node.remove(),
  );
  clonedRoot.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();

      if (name.startsWith("on") || value.startsWith("javascript:")) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  return new XMLSerializer().serializeToString(clonedRoot);
}
