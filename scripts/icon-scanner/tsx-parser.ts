import { parse } from '@babel/parser';
import * as t from '@babel/types';
import { convertSvgAttributeName, convertSvgElementName, isSupportedSvgElement } from './svg-attributes';
import type { ParsedIconResult } from './types';

type ComponentCandidate = {
  name: string;
  body: t.Node;
};

type RenderedSvg = { ok: true; svg: string } | { ok: false; reason: string };
type RenderedAttributes = { ok: true; attributes: string[] } | { ok: false; reason: string };
type RenderedAttributeValue = { ok: true; value: string } | { ok: false; reason: string };

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
        return { name: declaration.id.name, body: declaration };
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
          components.set(declarator.id.name, { name: declarator.id.name, body: declarator.init });
        }
      }
    }

    if (t.isFunctionDeclaration(statement) && statement.id) {
      components.set(statement.id.name, { name: statement.id.name, body: statement });
    }
  }

  return components;
}

function getNamedExportCandidate(declaration: t.Declaration): ComponentCandidate | null {
  if (t.isVariableDeclaration(declaration)) {
    for (const declarator of declaration.declarations) {
      if (t.isIdentifier(declarator.id) && declarator.init) {
        return { name: declarator.id.name, body: declarator.init };
      }
    }
  }

  if (t.isFunctionDeclaration(declaration) && declaration.id) {
    return { name: declaration.id.name, body: declaration };
  }

  return null;
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

function renderJsxElement(element: t.JSXElement, context: string): RenderedSvg {
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

function renderAttributes(attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[]): RenderedAttributes {
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

    const value = renderAttributeValue(name, attribute.value);
    if (!value.ok) {
      return value;
    }

    rendered.push(`${convertedName}="${escapeAttribute(value.value)}"`);
  }

  return { ok: true, attributes: rendered };
}

function renderAttributeValue(name: string, value: t.JSXAttribute['value']): RenderedAttributeValue {
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
