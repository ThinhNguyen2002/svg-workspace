declare module 'react-native-svg' {
  import type { ComponentType } from 'react';

  export type SvgProps = Record<string, unknown>;

  const Svg: ComponentType<SvgProps>;
  export const Path: ComponentType<SvgProps>;
  export default Svg;
}
