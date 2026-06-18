import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import * as t from '@babel/types';
import { convertSvgAttributeName, convertSvgElementName, isSupportedSvgElement } from './svg-attributes';
import type { IconPropUsage, ParsedIconResult } from './types';

type ComponentCandidate = {
  name: string;
  body: t.Node;
  defaultProps: Map<string, string>;
  props: IconPropUsage[];
};

type ParseIconOptions = {
  filePath?: string;
  sourceDir?: string;
  visitedFiles?: Set<string>;
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
  'dy',
  'cx',
  'cy',
  'r',
  'fr',
  'rx',
  'ry',
  'fx',
  'fy',
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
  'maskUnits',
  'maskContentUnits',
  'filter',
  'gradientUnits',
  'gradientTransform',
  'patternContentUnits',
  'offset',
  'style',
  'stop-color',
  'stop-opacity',
  'font-size',
  'font-family',
  'font-weight',
  'text-anchor',
  'href',
  'shape-rendering',
  'preserveAspectRatio'
]);

const ignoredSvgAttributes = new Set(['testID']);

export function parseIconSource(source: string, options: ParseIconOptions = {}): ParsedIconResult {
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

  const returned = findReturnedExpression(candidate.body, candidate.defaultProps);
  if (!returned) {
    return { ok: false, reason: `No JSX return found for ${candidate.name}` };
  }

  const selectedJsx = selectPreviewJsx(returned, candidate.defaultProps);
  const jsx = findPreviewSvgElement(selectedJsx, candidate.defaultProps);
  if (!t.isJSXElement(jsx)) {
    const mapped = renderMappedComponent(ast, candidate, options);
    if (mapped.ok) {
      return {
        ok: true,
        icon: {
          name: candidate.name,
          svg: mapped.svg,
          ...(candidate.props.length > 0 ? { props: candidate.props } : {})
        }
      };
    }

    if (t.isJSXElement(selectedJsx)) {
      const rootName = getJsxElementName(selectedJsx.openingElement.name);
      return { ok: false, reason: `Root JSX element must be Svg, found ${rootName}` };
    }

    return { ok: false, reason: `Unsupported JSX return type for ${candidate.name}` };
  }

  const rendered = renderJsxElement(jsx, 'root', candidate.defaultProps);
  if (!rendered.ok) {
    const mapped = renderMappedComponent(ast, candidate, options);
    if (mapped.ok) {
      return {
        ok: true,
        icon: {
          name: candidate.name,
          svg: mapped.svg,
          ...(candidate.props.length > 0 ? { props: candidate.props } : {})
        }
      };
    }

    return { ok: false, reason: rendered.reason };
  }

  return {
    ok: true,
    icon: {
      name: candidate.name,
      svg: rendered.svg,
      ...(candidate.props.length > 0 ? { props: candidate.props } : {})
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
        return {
          name: declaration.id.name,
          body: declaration,
          defaultProps: collectDefaultProps(declaration),
          props: collectPropUsage(declaration)
        };
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

function collectLocalComponents(ast: t.File): Map<string, ComponentCandidate> {
  const components = new Map<string, ComponentCandidate>();

  for (const statement of ast.program.body) {
    if (t.isVariableDeclaration(statement)) {
      for (const declarator of statement.declarations) {
        if (t.isIdentifier(declarator.id) && declarator.init) {
          components.set(declarator.id.name, {
            name: declarator.id.name,
            body: declarator.init,
            defaultProps: collectDefaultProps(declarator.init),
            props: collectPropUsage(declarator.init)
          });
        }
      }
    }

    if (t.isFunctionDeclaration(statement) && statement.id) {
      components.set(statement.id.name, {
        name: statement.id.name,
        body: statement,
        defaultProps: collectDefaultProps(statement),
        props: collectPropUsage(statement)
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
          defaultProps: collectDefaultProps(declarator.init),
          props: collectPropUsage(declarator.init)
        };
      }
    }
  }

  if (t.isFunctionDeclaration(declaration) && declaration.id) {
    return {
      name: declaration.id.name,
      body: declaration,
      defaultProps: collectDefaultProps(declaration),
      props: collectPropUsage(declaration)
    };
  }

  return null;
}

function renderMappedComponent(ast: t.File, candidate: ComponentCandidate, options: ParseIconOptions): RenderedSvg {
  if (!options.filePath || !options.sourceDir) {
    return { ok: false, reason: `Unsupported JSX return type for ${candidate.name}` };
  }

  const mappedComponentName = findFirstMappedComponentName(candidate.body);
  if (!mappedComponentName) {
    return { ok: false, reason: `Unsupported JSX return type for ${candidate.name}` };
  }

  const importPath = findDefaultImportSource(ast, mappedComponentName);
  if (!importPath) {
    return { ok: false, reason: `Unsupported JSX return type for ${candidate.name}` };
  }

  const resolvedPath = resolveImportPath(options.filePath, importPath);
  if (!resolvedPath) {
    return { ok: false, reason: `Unable to resolve mapped component ${mappedComponentName}` };
  }

  if (options.visitedFiles?.has(resolvedPath)) {
    return { ok: false, reason: `Circular mapped component reference ${mappedComponentName}` };
  }

  const visitedFiles = new Set(options.visitedFiles ?? []);
  visitedFiles.add(resolvedPath);

  const parsed = parseIconSource(fs.readFileSync(resolvedPath, 'utf8'), {
    filePath: resolvedPath,
    sourceDir: options.sourceDir,
    visitedFiles
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

      const componentName = findFirstJsxComponentInObject(declarator.init);
      if (componentName) {
        return componentName;
      }
    }
  }

  return null;
}

function findFirstJsxComponentInObject(expression: t.ObjectExpression): string | null {
  for (const property of expression.properties) {
    if (!t.isObjectProperty(property) || !t.isJSXElement(property.value)) {
      continue;
    }

    const name = getJsxElementName(property.value.openingElement.name);
    if (name !== 'Svg') {
      return name;
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

function resolveImportPath(fromFilePath: string, importPath: string): string | null {
  if (!importPath.startsWith('.')) {
    return null;
  }

  const basePath = path.resolve(path.dirname(fromFilePath), importPath);
  const candidates = [
    basePath,
    `${basePath}.tsx`,
    `${basePath}.jsx`,
    `${basePath}.ts`,
    `${basePath}.js`,
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.jsx'),
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.js')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function findReturnedExpression(node: t.Node, defaultProps: Map<string, string>): ReturnedExpression | null {
  if (t.isArrowFunctionExpression(node)) {
    if (t.isExpression(node.body)) {
      return node.body;
    }

    if (t.isBlockStatement(node.body)) {
      return findReturnStatementExpression(node.body, defaultProps);
    }
  }

  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) {
    return findReturnStatementExpression(node.body, defaultProps);
  }

  return null;
}

function findReturnStatementExpression(block: t.BlockStatement, defaultProps: Map<string, string>): ReturnedExpression | null {
  for (const statement of block.body) {
    const returned = findReturnInStatement(statement, defaultProps);
    if (returned) {
      return returned;
    }
  }

  return null;
}

function findReturnInStatement(statement: t.Statement, defaultProps: Map<string, string>): ReturnedExpression | null {
  if (t.isReturnStatement(statement) && statement.argument && t.isExpression(statement.argument)) {
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

    const consequent = findReturnInStatement(statement.consequent, defaultProps);
    if (consequent && findPreviewSvgElement(consequent, defaultProps)) {
      return consequent;
    }

    if (statement.alternate) {
      const alternate = findReturnInStatement(statement.alternate, defaultProps);
      if (alternate && findPreviewSvgElement(alternate, defaultProps)) {
        return alternate;
      }
    }

    return null;
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
      const renderedExpression = renderJsxExpressionChild(child.expression, context === 'root' ? sourceName : context, defaultProps);
      if (!renderedExpression.ok) {
        return renderedExpression;
      }
      if (renderedExpression.svg) {
        childParts.push(renderedExpression.svg);
      }
      continue;
    }

    return { ok: false, reason: `Unsupported child node in ${sourceName}` };
  }

  const attrs = attributes.attributes.length > 0 ? ` ${attributes.attributes.join(' ')}` : '';
  if (childParts.length === 0 && tagName !== 'svg') {
    return { ok: true, svg: `<${tagName}${attrs}/>` };
  }

  return { ok: true, svg: `<${tagName}${attrs}>${childParts.join('')}</${tagName}>` };
}

function renderJsxFragmentChildren(
  fragment: t.JSXFragment,
  context: string,
  defaultProps: Map<string, string>
): { ok: true; svg: string } | { ok: false; reason: string } {
  const childParts: string[] = [];

  for (const child of fragment.children) {
    if (t.isJSXText(child)) {
      const text = child.value.trim();
      if (text.length > 0) {
        childParts.push(escapeText(text));
      }
      continue;
    }

    if (t.isJSXElement(child)) {
      const renderedChild = renderJsxElement(child, context, defaultProps);
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
      const renderedExpression = renderJsxExpressionChild(child.expression, context, defaultProps);
      if (!renderedExpression.ok) {
        return renderedExpression;
      }
      if (renderedExpression.svg) {
        childParts.push(renderedExpression.svg);
      }
      continue;
    }

    return { ok: false, reason: `Unsupported child node in ${context}` };
  }

  return { ok: true, svg: childParts.join('') };
}

function renderJsxExpressionChild(
  expression: t.Expression,
  context: string,
  defaultProps: Map<string, string>
): { ok: true; svg: string | null } | { ok: false; reason: string } {
  if (t.isLogicalExpression(expression) && expression.operator === '&&') {
    const knownValue = evaluateKnownPreviewBoolean(expression.left, defaultProps);
    if (knownValue === false) {
      return { ok: true, svg: null };
    }

    if (t.isJSXElement(expression.right)) {
      const rendered = renderJsxElement(expression.right, context, defaultProps);
      return rendered.ok ? { ok: true, svg: rendered.svg } : rendered;
    }

    if (t.isJSXFragment(expression.right)) {
      const rendered = renderJsxFragmentChildren(expression.right, context, defaultProps);
      return rendered.ok ? { ok: true, svg: rendered.svg } : rendered;
    }
  }

  if (t.isConditionalExpression(expression)) {
    const selected = selectPreviewJsx(expression, defaultProps);
    if (t.isJSXElement(selected)) {
      const rendered = renderJsxElement(selected, context, defaultProps);
      return rendered.ok ? { ok: true, svg: rendered.svg } : rendered;
    }

    if (t.isJSXFragment(selected)) {
      const rendered = renderJsxFragmentChildren(selected, context, defaultProps);
      return rendered.ok ? { ok: true, svg: rendered.svg } : rendered;
    }
  }

  if (t.isBinaryExpression(expression)) {
    return { ok: true, svg: '1' };
  }

  if (t.isStringLiteral(expression) || t.isNumericLiteral(expression)) {
    return { ok: true, svg: escapeText(String(expression.value)) };
  }

  if (t.isIdentifier(expression)) {
    return { ok: true, svg: escapeText(defaultProps.get(expression.name) ?? '1') };
  }

  return { ok: false, reason: `Unsupported JSX expression container in ${context} children` };
}

function renderAttributes(attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[], defaultProps: Map<string, string>): RenderedAttributes {
  const rendered: string[] = [];

  for (const attribute of attributes) {
    if (t.isJSXSpreadAttribute(attribute)) {
      return { ok: false, reason: 'Unsupported JSX spread attribute' };
    }

    const name = getJsxAttributeName(attribute.name);
    if (ignoredSvgAttributes.has(name)) {
      continue;
    }

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
    if (t.isJSXEmptyExpression(expression)) {
      return { ok: false, reason: `Unsupported dynamic JSX expression in ${name}` };
    }

    if (name === 'style' && t.isObjectExpression(expression)) {
      return renderStyleValue(expression);
    }

    const expressionValue = renderExpressionAttributeValue(name, expression, defaultProps);
    if (expressionValue) {
      return { ok: true, value: expressionValue };
    }
  }

  return { ok: false, reason: `Unsupported dynamic JSX expression in ${name}` };
}

function renderExpressionAttributeValue(
  name: string,
  expression: t.Expression,
  defaultProps: Map<string, string>
): string | null {
  if (t.isNumericLiteral(expression) || t.isStringLiteral(expression) || t.isBooleanLiteral(expression)) {
    return String(expression.value);
  }

  if (t.isUnaryExpression(expression) && expression.operator === '-' && t.isNumericLiteral(expression.argument)) {
    return String(-expression.argument.value);
  }

  if (t.isConditionalExpression(expression)) {
    const testValue = evaluateKnownPreviewBoolean(expression.test, defaultProps);
    return renderExpressionAttributeValue(
      name,
      testValue === false ? expression.alternate : expression.consequent,
      defaultProps
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
    if (expression.name === 'length') {
      return '100%';
    }

    if ((name === 'width' || name === 'height') && expression.name === 'size') {
      return '24';
    }

    if ((name === 'fill' || name === 'stroke') && expression.name === 'color') {
      return 'currentColor';
    }

    return defaultProps.get(expression.name) ?? null;
  }

  if (t.isMemberExpression(expression)) {
    return resolvePreviewDefault(expression);
  }

  return null;
}

function renderStyleValue(expression: t.ObjectExpression): RenderedAttributeValue {
  const declarations: string[] = [];

  for (const property of expression.properties) {
    if (!t.isObjectProperty(property)) {
      return { ok: false, reason: 'Unsupported dynamic JSX expression in style' };
    }

    const key = getStylePropertyName(property.key);
    if (!key) {
      return { ok: false, reason: 'Unsupported dynamic JSX expression in style' };
    }

    const value = property.value;
    if (!t.isStringLiteral(value) && !t.isNumericLiteral(value)) {
      return { ok: false, reason: 'Unsupported dynamic JSX expression in style' };
    }

    declarations.push(`${toKebabCase(key)}:${String(value.value)}`);
  }

  return { ok: true, value: declarations.join(';') };
}

function getStylePropertyName(key: t.ObjectProperty['key']): string | null {
  if (t.isIdentifier(key)) {
    return key.name;
  }

  if (t.isStringLiteral(key)) {
    return key.value;
  }

  return null;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
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

    const defaultValue =
      property.value.left.name === 'fill' ? '#7B50B3' : resolvePreviewDefault(property.value.right);
    if (defaultValue) {
      defaults.set(property.value.left.name, defaultValue);
    }
  }

  return defaults;
}

function collectPropUsage(node: t.Node): IconPropUsage[] {
  const params =
    t.isArrowFunctionExpression(node) || t.isFunctionDeclaration(node) || t.isFunctionExpression(node) ? node.params : [];
  const firstParam = params[0];

  if (!firstParam || !t.isObjectPattern(firstParam)) {
    return [];
  }

  const props: IconPropUsage[] = [];

  for (const property of firstParam.properties) {
    if (!t.isObjectProperty(property) || !t.isIdentifier(property.key)) {
      continue;
    }

    const name = property.key.name;

    if (t.isIdentifier(property.value)) {
      props.push({
        name,
        value: name.startsWith('is') ? null : '{/* value */}',
        shorthand: name.startsWith('is')
      });
      continue;
    }

    if (!t.isAssignmentPattern(property.value) || !t.isIdentifier(property.value.left)) {
      continue;
    }

    const rendered = renderUsageExpression(property.value.right);
    props.push({
      name,
      value: rendered.value,
      shorthand: rendered.shorthand
    });
  }

  return props;
}

function renderUsageExpression(expression: t.Expression): { value: string | null; shorthand: boolean } {
  if (t.isBooleanLiteral(expression)) {
    return expression.value ? { value: null, shorthand: true } : { value: '{false}', shorthand: false };
  }

  if (t.isStringLiteral(expression)) {
    return { value: `{${JSON.stringify(expression.value)}}`, shorthand: false };
  }

  if (t.isNumericLiteral(expression)) {
    return { value: `{${expression.value}}`, shorthand: false };
  }

  if (t.isUnaryExpression(expression) && expression.operator === '-' && t.isNumericLiteral(expression.argument)) {
    return { value: `{${-expression.argument.value}}`, shorthand: false };
  }

  const expressionText = renderUsageExpressionText(expression);
  return expressionText
    ? { value: `{${expressionText}}`, shorthand: false }
    : { value: '{/* value */}', shorthand: false };
}

function renderUsageExpressionText(expression: t.Expression | t.PrivateName): string | null {
  if (t.isIdentifier(expression)) {
    return expression.name;
  }

  if (t.isThisExpression(expression)) {
    return 'this';
  }

  if (t.isStringLiteral(expression)) {
    return JSON.stringify(expression.value);
  }

  if (t.isNumericLiteral(expression)) {
    return String(expression.value);
  }

  if (t.isBooleanLiteral(expression)) {
    return String(expression.value);
  }

  if (t.isUnaryExpression(expression) && expression.operator === '-' && t.isNumericLiteral(expression.argument)) {
    return String(-expression.argument.value);
  }

  if (t.isMemberExpression(expression)) {
    const object = renderUsageExpressionText(expression.object);
    const property = renderUsageExpressionText(expression.property);
    if (!object || !property) {
      return null;
    }

    return expression.computed ? `${object}[${property}]` : `${object}.${property}`;
  }

  return null;
}

function resolvePreviewDefault(expression: t.Expression): string | null {
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

  if (t.isUnaryExpression(expression) && expression.operator === '-' && t.isNumericLiteral(expression.argument)) {
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

  if (!t.isBinaryExpression(expression)) {
    return null;
  }

  if (!t.isExpression(expression.left) || !t.isExpression(expression.right)) {
    return null;
  }

  const left = evaluateNumericExpression(expression.left, defaultProps);
  const right = evaluateNumericExpression(expression.right, defaultProps);
  if (left === null || right === null) {
    return null;
  }

  switch (expression.operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return right === 0 ? null : left / right;
    default:
      return null;
  }
}

function renderTemplateLiteral(expression: t.TemplateLiteral, defaultProps: Map<string, string>): string | null {
  let value = '';
  for (let index = 0; index < expression.quasis.length; index += 1) {
    value += expression.quasis[index].value.cooked ?? expression.quasis[index].value.raw;
    const dynamicExpression = expression.expressions[index];
    if (!dynamicExpression) {
      continue;
    }

    if (t.isExpression(dynamicExpression)) {
      const rendered = renderExpressionAttributeValue('template', dynamicExpression, defaultProps);
      if (rendered === null) {
        return null;
      }
      value += rendered;
    }
  }

  return value;
}

function selectPreviewJsx(expression: ReturnedExpression, defaultProps: Map<string, string>): ReturnedExpression {
  if (t.isJSXFragment(expression)) {
    for (const child of expression.children) {
      if (t.isJSXElement(child) && getJsxElementName(child.openingElement.name) === 'Svg') {
        return child;
      }
    }
    return expression;
  }

  if (!t.isConditionalExpression(expression)) {
    return expression;
  }

  const testValue = evaluateKnownPreviewBoolean(expression.test, defaultProps);
  return testValue === false ? expression.alternate : expression.consequent;
}

function findPreviewSvgElement(
  expression: ReturnedExpression,
  defaultProps: Map<string, string>
): t.JSXElement | null {
  const selected = selectPreviewJsx(expression, defaultProps);

  if (t.isJSXElement(selected)) {
    if (getJsxElementName(selected.openingElement.name) === 'Svg') {
      return selected;
    }

    for (const child of selected.children) {
      if (t.isJSXElement(child)) {
        const nested = findPreviewSvgElement(child, defaultProps);
        if (nested) {
          return nested;
        }
      }

      if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
        const nested = findPreviewSvgElement(child.expression, defaultProps);
        if (nested) {
          return nested;
        }
      }
    }

    return null;
  }

  if (t.isJSXFragment(selected)) {
    for (const child of selected.children) {
      if (t.isJSXElement(child)) {
        const nested = findPreviewSvgElement(child, defaultProps);
        if (nested) {
          return nested;
        }
      }

      if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
        const nested = findPreviewSvgElement(child.expression, defaultProps);
        if (nested) {
          return nested;
        }
      }
    }
  }

  if (t.isLogicalExpression(selected) && selected.operator === '&&' && evaluateKnownPreviewBoolean(selected.left, defaultProps) !== false) {
    if (t.isExpression(selected.right) || t.isJSXElement(selected.right) || t.isJSXFragment(selected.right)) {
      return findPreviewSvgElement(selected.right, defaultProps);
    }
  }

  return null;
}

function evaluatePreviewBoolean(expression: t.Expression, defaultProps: Map<string, string>): boolean {
  return evaluateKnownPreviewBoolean(expression, defaultProps) ?? false;
}

function evaluateKnownPreviewBoolean(expression: t.Expression, defaultProps: Map<string, string>): boolean | null {
  if (t.isBooleanLiteral(expression)) {
    return expression.value;
  }

  if (t.isUnaryExpression(expression) && expression.operator === '!') {
    const value = evaluateKnownPreviewBoolean(expression.argument, defaultProps);
    return value === null ? null : !value;
  }

  if (t.isIdentifier(expression)) {
    const value = defaultProps.get(expression.name);
    return value ? value === 'true' : null;
  }

  if (t.isBinaryExpression(expression) && (expression.operator === '===' || expression.operator === '!==')) {
    const left = getPreviewScalar(expression.left, defaultProps);
    const right = getPreviewScalar(expression.right, defaultProps);
    if (left === null || right === null) {
      return null;
    }

    return expression.operator === '===' ? left === right : left !== right;
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

  if (t.isUnaryExpression(expression) && expression.operator === '-' && t.isNumericLiteral(expression.argument)) {
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
