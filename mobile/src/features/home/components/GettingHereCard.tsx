import Svg, { Circle, Rect } from 'react-native-svg';
import { XStack, YStack } from 'tamagui';
import { Card, Text } from '~/components/ui';
import { usePalette } from '~/providers/ThemeProvider';
import { dojo } from '~/constants/config';
import { radius, space } from '~/theme/tokens';

/**
 * Getting here.
 *
 * The address paired with a drawn map rather than a real one. A real map means
 * a tile provider, an API key, a network request on every Home render and a
 * third party told where every member lives — for a card whose whole job is to
 * say "it is that building, near that train". The drawing carries the same
 * meaning at none of that cost, and it renders offline, which is the state
 * someone is most likely in while standing outside looking for the door.
 *
 * Every colour comes from the palette, so the illustration inverts with the
 * rest of the app instead of staying a light rectangle on a dark screen.
 */

/** Drawn at this size and scaled by the viewBox, so the ratios stay fixed. */
const MAP_WIDTH = 112;
const MAP_HEIGHT = 138;

/** Street width in viewBox units. Wide enough to read as a road, not a hairline. */
const STREET = 9;

function MapDrawing() {
  const palette = usePalette();

  return (
    <Svg width={MAP_WIDTH} height={MAP_HEIGHT} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
      {/* The city blocks — the lit ground the streets are drawn over. */}
      <Rect
        x={0}
        y={0}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        rx={radius.md}
        fill={palette.surface}
        stroke={palette.border}
        strokeWidth={1}
      />

      {/*
        Streets as filled bars rather than stroked lines: a stroke centres on
        its path and half of it would fall outside the rounded ground, leaving
        clipped stubs at the edges.

        The lowest street sits high enough to leave a block along the bottom for
        the street name, so the label lands on ground rather than across a road.
      */}
      {[30, 78].map((x) => (
        <Rect
          key={`v${x}`}
          x={x}
          y={0}
          width={STREET}
          height={MAP_HEIGHT}
          fill={palette.surfaceSunken}
        />
      ))}
      {[26, 70, 104].map((y) => (
        <Rect
          key={`h${y}`}
          x={0}
          y={y}
          width={MAP_WIDTH}
          height={STREET}
          fill={palette.surfaceSunken}
        />
      ))}

      {/* The block the Dojo sits on, centred in the middle square. */}
      <Rect
        x={41}
        y={38}
        width={34}
        height={30}
        rx={radius.sm}
        fill={palette.accentTint}
        stroke={palette.accent}
        strokeWidth={1.5}
      />
      <Circle cx={58} cy={53} r={6} fill={palette.accent} />
    </Svg>
  );
}

export function GettingHereCard() {
  const palette = usePalette();

  // Two lines in the config, kept as separate Texts so the gap between them is
  // the layout's decision rather than a newline's.
  const transitLines = dojo.transit.split('\n');

  return (
    <Card tone="alt">
      <XStack gap={space[4]} alignItems="center">
        <YStack flex={1} gap={space[1]}>
          <Text variant="eyebrow" role="heading">
            Getting here
          </Text>

          <Text variant="title" marginTop={space[1]}>
            {dojo.addressLine1}
          </Text>
          <Text variant="small" tone="subtle">
            {dojo.addressLine2}
          </Text>

          <YStack marginTop={space[3]} gap={space[1]}>
            {transitLines.map((line) => (
              <Text key={line} variant="small" tone="muted">
                {line}
              </Text>
            ))}
          </YStack>
        </YStack>

        {/*
          `position: relative` so the street name can sit inside the drawing.
          The label is a Tamagui Text rather than an SVG one so it takes the
          app's mono face and scales with Dynamic Type like every other label.
        */}
        <YStack position="relative">
          <MapDrawing />
          <Text
            variant="caption"
            position="absolute"
            left={space[2]}
            bottom={space[2]}
            color={palette.textSubtle}
            fontFamily="$mono"
          >
            MAUDE AVE
          </Text>
        </YStack>
      </XStack>
    </Card>
  );
}
