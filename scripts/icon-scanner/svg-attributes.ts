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
  'Stop',
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
  ['Stop', 'stop'],
]);

const attributeNameMap = new Map<string, string>([
  ['strokeWidth', 'stroke-width'],
  ['strokeLinecap', 'stroke-linecap'],
  ['strokeLinejoin', 'stroke-linejoin'],
  ['fillRule', 'fill-rule'],
  ['clipRule', 'clip-rule'],
  ['clipPath', 'clip-path'],
  ['stopColor', 'stop-color'],
  ['stopOpacity', 'stop-opacity'],
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
