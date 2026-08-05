import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Tab bar icons.
 *
 * Drawn as SVG paths rather than pulled from an icon font: they inherit the
 * active/inactive colour from a prop, scale crisply at any density, and add no
 * asset weight. The shapes follow Phosphor's line style, which the Nocturne
 * readme names as the system's icon set.
 *
 * Filled variants for the active state match how both platforms signal
 * selection natively — SF Symbols' `.fill` on iOS, Material's filled icons.
 */

export type TabName = 'home' | 'events' | 'book' | 'community' | 'dojo';

interface IconProps {
  color: string;
  focused: boolean;
  size?: number;
}

export function TabIcon({ name, color, focused, size = 24 }: IconProps & { name: TabName }) {
  const strokeWidth = focused ? 2 : 1.6;
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'home':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M3 10.5 12 3l9 7.5" {...common} />
          <Path
            d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5"
            {...common}
            fill={focused ? color : 'none'}
            fillOpacity={focused ? 0.14 : 0}
          />
        </Svg>
      );

    case 'events':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect
            x={3}
            y={5}
            width={18}
            height={16}
            rx={2.5}
            {...common}
            fill={focused ? color : 'none'}
            fillOpacity={focused ? 0.14 : 0}
          />
          <Path d="M3 10h18M8 3v4M16 3v4" {...common} />
        </Svg>
      );

    case 'book':
      // A caliper/bench motif — the hardware-and-space tab.
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M4 4v10a4 4 0 0 0 4 4h1" {...common} />
          <Path d="M20 4v10a4 4 0 0 1-4 4h-1" {...common} />
          <Rect
            x={9}
            y={16}
            width={6}
            height={5}
            rx={1.5}
            {...common}
            fill={focused ? color : 'none'}
            fillOpacity={focused ? 0.14 : 0}
          />
          <Path d="M4 8h16" {...common} />
        </Svg>
      );

    case 'community':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle
            cx={9}
            cy={8.5}
            r={3.4}
            {...common}
            fill={focused ? color : 'none'}
            fillOpacity={focused ? 0.14 : 0}
          />
          <Path d="M2.5 20c1.4-3.2 3.8-4.8 6.5-4.8s5.1 1.6 6.5 4.8" {...common} />
          <Path d="M16 5.6a3.4 3.4 0 0 1 0 6.4M18 15.6c1.6.7 2.9 2.1 3.6 4.4" {...common} />
        </Svg>
      );

    case 'dojo':
      // The torii — the Hacker Dojo mark.
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M2 5h20M4 8.5h16M6.5 8.5V21M17.5 8.5V21M6.5 12.5h11" {...common} />
        </Svg>
      );
  }
}
