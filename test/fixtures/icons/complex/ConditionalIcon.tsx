import Svg, { Path } from 'react-native-svg';

export const ConditionalIcon = ({ filled }: { filled?: boolean }) => (
  <Svg viewBox="0 0 24 24">
    {filled ? <Path d="M1 1" /> : <Path d="M2 2" />}
  </Svg>
);
