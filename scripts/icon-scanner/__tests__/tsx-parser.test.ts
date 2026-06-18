import { describe, expect, it } from 'vitest';
import { parseIconSource } from '../tsx-parser';

describe('parseIconSource', () => {
  it('extracts a simple exported icon component', () => {
    const result = parseIconSource(`
      import Svg, { Path } from 'react-native-svg';

      export const ArrowLeftIcon = ({ size = 24, color = '#111' }) => (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    `);

    expect(result).toEqual({
      ok: true,
      icon: {
        name: 'ArrowLeftIcon',
        props: [
          { name: 'size', value: '{24}', shorthand: false },
          { name: 'color', value: '{"#111"}', shorthand: false }
        ],
        svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      }
    });
  });

  it('supports default exported named function declarations', () => {
    const result = parseIconSource(`
      import Svg, { Circle } from 'react-native-svg';

      export default function UserIcon() {
        return (
          <Svg viewBox="0 0 24 24">
            <Circle cx="12" cy="8" r="4" fill="currentColor" />
          </Svg>
        );
      }
    `);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.icon.name).toBe('UserIcon');
      expect(result.icon.svg).toContain('<circle cx="12" cy="8" r="4" fill="currentColor"/>');
    }
  });

  it('supports named export specifiers for local icon components', () => {
    const result = parseIconSource(`
      import Svg, { Path } from 'react-native-svg';

      const HomeIcon = () => (
        <Svg viewBox="0 0 24 24">
          <Path d="M1 1" />
        </Svg>
      );

      export { HomeIcon };
    `);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.icon.name).toBe('HomeIcon');
      expect(result.icon.svg).toContain('<path d="M1 1"/>');
    }
  });

  it('supports default identifier exports for local icon components', () => {
    const result = parseIconSource(`
      import Svg, { Path } from 'react-native-svg';

      const HomeIcon = () => (
        <Svg viewBox="0 0 24 24">
          <Path d="M1 1" />
        </Svg>
      );

      export default HomeIcon;
    `);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.icon.name).toBe('HomeIcon');
      expect(result.icon.svg).toContain('<path d="M1 1"/>');
    }
  });

  it('uses numeric defaults from destructured width and height props', () => {
    const result = parseIconSource(`
      import type { FC } from 'react';
      import Svg, { Circle } from 'react-native-svg';
      import { SIZE_VALUE } from './sizes';

      const ActiveRadio: FC<IconSVGProps> = ({
        width = SIZE_VALUE._24,
        height = SIZE_VALUE._24,
      }) => (
        <Svg width={width} height={height} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="10" />
        </Svg>
      );

      export { ActiveRadio };
    `);

    expect(result).toEqual({
      ok: true,
      icon: {
        name: 'ActiveRadio',
        props: [
          { name: 'width', value: '{SIZE_VALUE._24}', shorthand: false },
          { name: 'height', value: '{SIZE_VALUE._24}', shorthand: false }
        ],
        svg: '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>'
      }
    });
  });

  it('uses the focused branch for tab icons that require isFocused', () => {
    const result = parseIconSource(`
      import * as React from 'react';
      import Svg, { Path } from 'react-native-svg';
      import { SIZE_VALUE } from '@src/constants';
      import { TabBarIconProps } from './type';

      const ProfileIcon: React.FC<TabBarIconProps> = ({
        width = SIZE_VALUE._24,
        height = SIZE_VALUE._24,
        isFocused,
      }) =>
        isFocused ? (
          <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
            <Path d="M1 1" fill="#7B50B3" />
          </Svg>
        ) : (
          <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
            <Path d="M2 2" fill="#9E9E9E" />
          </Svg>
        );

      export default ProfileIcon;
    `);

    expect(result).toEqual({
      ok: true,
      icon: {
        name: 'ProfileIcon',
        props: [
          { name: 'width', value: '{SIZE_VALUE._24}', shorthand: false },
          { name: 'height', value: '{SIZE_VALUE._24}', shorthand: false },
          { name: 'isFocused', value: null, shorthand: true }
        ],
        svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M1 1" fill="#7B50B3"/></svg>'
      }
    });
  });

  it('uses preview color for theme onSurfaceVariant default fill props', () => {
    const result = parseIconSource(`
      import React, { FC } from 'react';
      import Svg, { Path } from 'react-native-svg';
      import { theme } from '@src/themes';
      import { SIZE_VALUE } from '@src/constants';

      const InvoiceIcon: FC<IconSVGProps> = ({
        width = SIZE_VALUE._16,
        height = SIZE_VALUE._16,
        fill = theme.colors.onSurfaceVariant,
      }) => (
        <Svg width={width} height={height} viewBox="0 0 16 16" fill={fill}>
          <Path d="M1 1" fill="#7B50B3" />
        </Svg>
      );

      export default InvoiceIcon;
    `);

    expect(result).toEqual({
      ok: true,
      icon: {
        name: 'InvoiceIcon',
        props: [
          { name: 'width', value: '{SIZE_VALUE._16}', shorthand: false },
          { name: 'height', value: '{SIZE_VALUE._16}', shorthand: false },
          { name: 'fill', value: '{theme.colors.onSurfaceVariant}', shorthand: false }
        ],
        svg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#7B50B3"><path d="M1 1" fill="#7B50B3"/></svg>'
      }
    });
  });

  it('supports conditional JSX children using preview defaults', () => {
    const result = parseIconSource(`
      import Svg, { Path } from 'react-native-svg';

      export const AlertIcon = ({ filled }) => (
        <Svg viewBox="0 0 24 24">
          {filled ? <Path d="M1 1" /> : <Path d="M2 2" />}
        </Svg>
      );
    `);

    expect(result).toEqual({
      ok: true,
      icon: {
        name: 'AlertIcon',
        props: [{ name: 'filled', value: '{/* value */}', shorthand: false }],
        svg: '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>'
      }
    });
  });

  it('returns a structured error for malformed source', () => {
    const result = parseIconSource(`
      export const BrokenIcon = (
    `);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Unable to parse source:');
    }
  });

  it('escapes attribute values that contain markup-sensitive characters', () => {
    const result = parseIconSource(`
      import Svg, { Path } from 'react-native-svg';

      export const EscapeIcon = () => (
        <Svg viewBox="0 0 24 24">
          <Path d="M1 < 2 & 3" />
        </Svg>
      );
    `);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.icon.svg).toContain('d="M1 &lt; 2 &amp; 3"');
    }
  });

  it('rejects unsupported dynamic attribute expressions', () => {
    const result = parseIconSource(`
      import Svg, { Path } from 'react-native-svg';

      export const DynamicIcon = ({ pathData }) => (
        <Svg viewBox="0 0 24 24">
          <Path d={pathData} />
        </Svg>
      );
    `);

    expect(result).toEqual({
      ok: false,
      reason: 'Unsupported dynamic JSX expression in d'
    });
  });

  it('rejects JSX spread attributes', () => {
    const result = parseIconSource(`
      import Svg, { Path } from 'react-native-svg';

      export const SpreadIcon = props => (
        <Svg viewBox="0 0 24 24">
          <Path {...props} />
        </Svg>
      );
    `);

    expect(result).toEqual({
      ok: false,
      reason: 'Unsupported JSX spread attribute'
    });
  });

  it('rejects unsupported root elements with a clear error', () => {
    const result = parseIconSource(`
      export const NotSvgIcon = () => (
        <View />
      );
    `);

    expect(result).toEqual({
      ok: false,
      reason: 'Root JSX element must be Svg, found View'
    });
  });

  it('supports text SVG elements', () => {
    const result = parseIconSource(`
      import Svg, { Text } from 'react-native-svg';

      export const LabelIcon = () => (
        <Svg viewBox="0 0 24 24">
          <Text>Label</Text>
        </Svg>
      );
    `);

    expect(result).toEqual({
      ok: true,
      icon: {
        name: 'LabelIcon',
        svg: '<svg viewBox="0 0 24 24"><text>Label</text></svg>'
      }
    });
  });

  it('rejects unsupported static SVG attributes', () => {
    const result = parseIconSource(`
      import Svg from 'react-native-svg';

      export const AccessibleIcon = () => (
        <Svg accessibilityLabel="x" />
      );
    `);

    expect(result).toEqual({
      ok: false,
      reason: 'Unsupported SVG attribute accessibilityLabel'
    });
  });

  it('rejects namespaced SVG attributes with a clear attribute name', () => {
    const result = parseIconSource(`
      import Svg from 'react-native-svg';

      export const NamespacedIcon = () => (
        <Svg xml:space="preserve" />
      );
    `);

    expect(result).toEqual({
      ok: false,
      reason: 'Unsupported SVG attribute xml:space'
    });
  });
});
