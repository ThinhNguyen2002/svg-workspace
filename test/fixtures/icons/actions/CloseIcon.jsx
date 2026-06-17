import Svg, { Path } from 'react-native-svg';

export const CloseIcon = ({ size = 24, color = '#111' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 6l12 12" stroke={color} strokeWidth={2} />
    <Path d="M18 6L6 18" stroke={color} strokeWidth={2} />
  </Svg>
);
