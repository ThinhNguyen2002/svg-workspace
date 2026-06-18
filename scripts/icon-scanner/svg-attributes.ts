const supportedElements = new Set([
  'Svg',
  'Path',
  'Circle',
  'Ellipse',
  'Rect',
  'Line',
  'Polyline',
  'Polygon',
  'Text',
  'G',
  'Defs',
  'ClipPath',
  'Mask',
  'LinearGradient',
  'RadialGradient',
  'Pattern',
  'Use',
  'Image',
  'Stop',
]);

const elementNameMap = new Map<string, string>([
  ['Svg', 'svg'],
  ['Path', 'path'],
  ['Circle', 'circle'],
  ['Ellipse', 'ellipse'],
  ['Rect', 'rect'],
  ['Line', 'line'],
  ['Polyline', 'polyline'],
  ['Polygon', 'polygon'],
  ['Text', 'text'],
  ['G', 'g'],
  ['Defs', 'defs'],
  ['ClipPath', 'clipPath'],
  ['Mask', 'mask'],
  ['LinearGradient', 'linearGradient'],
  ['RadialGradient', 'radialGradient'],
  ['Pattern', 'pattern'],
  ['Use', 'use'],
  ['Image', 'image'],
  ['Stop', 'stop'],
]);

const attributeNameMap = new Map<string, string>([
  ['strokeWidth', 'stroke-width'],
  ['strokeLinecap', 'stroke-linecap'],
  ['strokeLinejoin', 'stroke-linejoin'],
  ['strokeMiterlimit', 'stroke-miterlimit'],
  ['strokeMiterLimit', 'stroke-miterlimit'],
  ['strokeDasharray', 'stroke-dasharray'],
  ['strokeDashoffset', 'stroke-dashoffset'],
  ['strokeOpacity', 'stroke-opacity'],
  ['fillOpacity', 'fill-opacity'],
  ['fillRule', 'fill-rule'],
  ['clipRule', 'clip-rule'],
  ['clipPath', 'clip-path'],
  ['stopColor', 'stop-color'],
  ['stopOpacity', 'stop-opacity'],
  ['fontSize', 'font-size'],
  ['fontFamily', 'font-family'],
  ['fontWeight', 'font-weight'],
  ['textAnchor', 'text-anchor'],
  ['shapeRendering', 'shape-rendering'],
  ['xlinkHref', 'href'],
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
