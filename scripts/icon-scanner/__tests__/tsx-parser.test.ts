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

  it('returns a structured error for unsupported conditional JSX', () => {
    const result = parseIconSource(`
      import Svg, { Path } from 'react-native-svg';

      export const AlertIcon = ({ filled }) => (
        <Svg viewBox="0 0 24 24">
          {filled ? <Path d="M1 1" /> : <Path d="M2 2" />}
        </Svg>
      );
    `);

    expect(result).toEqual({
      ok: false,
      reason: 'Unsupported JSX expression container in Svg children'
    });
  });
});
