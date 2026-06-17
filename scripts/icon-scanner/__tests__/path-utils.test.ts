import { describe, expect, it } from 'vitest';
import { deriveCategory, makeImportSnippet, normalizeRelativePath } from '../path-utils';
import { convertSvgAttributeName, isSupportedSvgElement } from '../svg-attributes';

describe('path utilities', () => {
  it('derives category from the first relative folder segment', () => {
    expect(deriveCategory('navigation/ArrowLeftIcon.tsx')).toBe('navigation');
    expect(deriveCategory('actions/CloseIcon.jsx')).toBe('actions');
    expect(deriveCategory('HomeIcon.tsx')).toBe('uncategorized');
  });

  it('normalizes platform separators to posix paths', () => {
    expect(normalizeRelativePath('navigation\\\\ArrowLeftIcon.tsx')).toBe('navigation/ArrowLeftIcon.tsx');
  });

  it('creates a default import snippet from component name and relative path', () => {
    expect(makeImportSnippet('ArrowLeftIcon', 'navigation/ArrowLeftIcon.tsx')).toBe(
      "import { ArrowLeftIcon } from '@/icons/navigation/ArrowLeftIcon';"
    );
  });
});

describe('svg attribute utilities', () => {
  it('recognizes supported React Native SVG element names', () => {
    expect(isSupportedSvgElement('Svg')).toBe(true);
    expect(isSupportedSvgElement('Path')).toBe(true);
    expect(isSupportedSvgElement('Text')).toBe(false);
  });

  it('converts React Native SVG prop names to web SVG attribute names', () => {
    expect(convertSvgAttributeName('strokeWidth')).toBe('stroke-width');
    expect(convertSvgAttributeName('fillRule')).toBe('fill-rule');
    expect(convertSvgAttributeName('stopColor')).toBe('stop-color');
    expect(convertSvgAttributeName('viewBox')).toBe('viewBox');
  });
});
