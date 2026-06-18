import { parse } from '@babel/parser';
import * as t from '@babel/types';
import { convertSvgAttributeName, convertSvgElementName, isSupportedSvgElement } from './svg-attributes';
import type { ParsedIconResult } from './types';

type ComponentCandidate = {
  name: string;
  body: t.Node;
  defaultProps: Map<string, string>;
};

type RenderedSvg = { ok: true; svg: string } | { ok: false; reason: string };
type RenderedAttributes = { ok: true; attributes: string[] } | { ok: false; reason: string };
type RenderedAttributeValue = { ok: true; value: string } | { ok: false; reason: string };
type ReturnedExpression = t.Expression | t.JSXElement | t.JSXFragment;

const supportedSvgAttributes = new Set([
  'id',
  'width',
  'height',
  'viewBox',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'x1',
  'x2',
  'y',
  'y1',
  'y2',
  'points',
  'transform',
  'clip-path',
  'clip-rule',
  'mask',
  'offset',
  'stop-color',
  'stop-opacity'
]);

export function parseIconSource(source: string): ParsedIconResult {
  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx']
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Unable to parse source: ${message}` };
  }

  const candidate = findExportedComponent(ast);
  if (!candidate) {
    return { ok: false, reason: 'No exported icon component found' };
  }

  const returned = findReturnedExpression(candidate.body);
  if (!returned) {
    return { ok: false, reason: `No JSX return found for ${candidate.name}` };
  }

  const jsx = selectPreviewJsx(returned, candidate.defaultProps);
  if (!t.isJSXElement(jsx)) {
    return { ok: false, reason: `Unsupported JSX return type for ${candidate.name}` };
  }

  const rootName = getJsxElementName(jsx.openingElement.name);
  if (rootName !== 'Svg') {
    return { ok: false, reason: `Root JSX element must be Svg, found ${rootName}` };
  }

  const rendered = renderJsxElement(jsx, 'root', candidate.defaultProps);
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
  const localComponents = collectLocalComponents(ast);

  for (const statement of ast.program.body) {
    if (t.isExportNamedDeclaration(statement) && statement.declaration) {
      const candidate = getNamedExportCandidate(statement.declaration);
      if (candidate) {
        return candidate;
      }
    }

    if (t.isExportNamedDeclaration(statement) && statement.specifiers.length > 0) {
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
        return { name: declaration.id.name, body: declaration, defaultProps: collectDefaultProps(declaration) };
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

function collectLocalComponents(ast: t.File): Map<string, ComponentCandidate> {
  const components = new Map<string, ComponentCandidate>();

  for (const statement of ast.program.body) {
    if (t.isVariableDeclaration(statement)) {
      for (const declarator of statement.declarations) {
        if (t.isIdentifier(declarator.id) && declarator.init) {
          components.set(declarator.id.name, {
            name: declarator.id.name,
            body: declarator.init,
            defaultProps: collectDefaultProps(declarator.init)
          });
        }
      }
    }

    if (t.isFunctionDeclaration(statement) && statement.id) {
      components.set(statement.id.name, {
        name: statement.id.name,
        body: statement,
        defaultProps: collectDefaultProps(statement)
      });
    }
  }

  return components;
}

function getNamedExportCandidate(declaration: t.Declaration): ComponentCandidate | null {
  if (t.isVariableDeclaration(declaration)) {
    for (const declarator of declaration.declarations) {
      if (t.isIdentifier(declarator.id) && declarator.init) {
        return {
          name: declarator.id.name,
          body: declarator.init,
          defaultProps: collectDefaultProps(declarator.init)
        };
      }
    }
  }

  if (t.isFunctionDeclaration(declaration) && declaration.id) {
    return { name: declaration.id.name, body: declaration, defaultProps: collectDefaultProps(declaration) };
  }

  return null;
}

function findReturnedExpression(node: t.Node): ReturnedExpression | null {
  if (t.isArrowFunctionExpression(node)) {
    if (t.isExpression(node.body)) {
      return node.body;
    }

    if (t.isBlockStatement(node.body)) {
      return findReturnStatementExpression(node.body);
    }
  }

  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) {
    return findReturnStatementExpression(node.body);
  }

  return null;
}

function findReturnStatementExpression(block: t.BlockStatement): ReturnedExpression | null {
  for (const statement of block.body) {
    if (t.isReturnStatement(statement) && statement.argument) {
      if (t.isExpression(statement.argument)) {
        return statement.argument;
      }
    }
  }

  return null;
}

function renderJsxElement(element: t.JSXElement, context: string, defaultProps: Map<string, string>): RenderedSvg {
  const sourceName = getJsxElementName(element.openingElement.name);
  if (!isSupportedSvgElement(sourceName)) {
    return { ok: false, reason: `Unsupported SVG element ${sourceName}` };
  }

  const tagName = convertSvgElementName(sourceName);
  const attributes = renderAttributes(element.openingElement.attributes, defaultProps);
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
      const renderedChild = renderJsxElement(child, sourceName, defaultProps);
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

function renderAttributes(attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[], defaultProps: Map<string, string>): RenderedAttributes {
  const rendered: string[] = [];

  for (const attribute of attributes) {
    if (t.isJSXSpreadAttribute(attribute)) {
      return { ok: false, reason: 'Unsupported JSX spread attribute' };
    }

    const name = getJsxAttributeName(attribute.name);
    const convertedName = convertSvgAttributeName(name);
    if (!supportedSvgAttributes.has(convertedName)) {
      return { ok: false, reason: `Unsupported SVG attribute ${name}` };
    }

    const value = renderAttributeValue(name, attribute.value, defaultProps);
    if (!value.ok) {
      return value;
    }

    rendered.push(`${convertedName}="${escapeAttribute(value.value)}"`);
  }

  return { ok: true, attributes: rendered };
}

function renderAttributeValue(
  name: string,
  value: t.JSXAttribute['value'],
  defaultProps: Map<string, string>
): RenderedAttributeValue {
  if (!value) {
    return { ok: true, value: 'true' };
  }

  if (t.isStringLiteral(value)) {
    return { ok: true, value: value.value };
  }

  if (t.isJSXExpressionContainer(value)) {
    const { expression } = value;

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

      const defaultValue = defaultProps.get(expression.name);
      if (defaultValue) {
        return { ok: true, value: defaultValue };
      }
    }
  }

  return { ok: false, reason: `Unsupported dynamic JSX expression in ${name}` };
}

function collectDefaultProps(node: t.Node): Map<string, string> {
  const defaults = new Map<string, string>();
  const params =
    t.isArrowFunctionExpression(node) || t.isFunctionDeclaration(node) || t.isFunctionExpression(node) ? node.params : [];
  const firstParam = params[0];

  if (!firstParam || !t.isObjectPattern(firstParam)) {
    return defaults;
  }

  for (const property of firstParam.properties) {
    if (!t.isObjectProperty(property) || !t.isIdentifier(property.key)) {
      continue;
    }

    if (t.isIdentifier(property.value) && property.key.name === 'isFocused') {
      defaults.set(property.value.name, 'true');
      continue;
    }

    if (!t.isAssignmentPattern(property.value) || !t.isIdentifier(property.value.left)) {
      continue;
    }

    const defaultValue = resolvePreviewDefault(property.value.right);
    if (defaultValue) {
      defaults.set(property.value.left.name, defaultValue);
    }
  }

  return defaults;
}

function resolvePreviewDefault(expression: t.Expression): string | null {
  if (t.isNumericLiteral(expression) || t.isStringLiteral(expression)) {
    return String(expression.value);
  }

  if (t.isMemberExpression(expression)) {
    const property = expression.property;
    if (t.isIdentifier(property)) {
      if (property.name === 'onSurfaceVariant') {
        return '#7B50B3';
      }

      const match = /^_(\d+)$/.exec(property.name);
      return match ? match[1] : null;
    }

    if (t.isNumericLiteral(property)) {
      return String(property.value);
    }
  }

  return null;
}

function selectPreviewJsx(expression: ReturnedExpression, defaultProps: Map<string, string>): ReturnedExpression {
  if (!t.isConditionalExpression(expression)) {
    return expression;
  }

  const testValue = evaluatePreviewBoolean(expression.test, defaultProps);
  return testValue ? expression.consequent : expression.alternate;
}

function evaluatePreviewBoolean(expression: t.Expression, defaultProps: Map<string, string>): boolean {
  if (t.isBooleanLiteral(expression)) {
    return expression.value;
  }

  if (t.isIdentifier(expression)) {
    return defaultProps.get(expression.name) === 'true';
  }

  return false;
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

  if (t.isJSXNamespacedName(name)) {
    return `${name.namespace.name}:${name.name.name}`;
  }

  return 'unsupported';
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
