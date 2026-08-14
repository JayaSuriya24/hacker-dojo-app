import { Image } from 'expo-image';
import { YStack } from 'tamagui';
import { supabase } from '~/services/supabase';
import { radius } from '~/theme/tokens';

/**
 * An event's poster.
 *
 * `cover_path` has been on the events table since the first migration and was
 * rendered nowhere — every event looked the same regardless of the artwork
 * uploaded for it. This is that column, finally on screen.
 *
 * The path is resolved against the public `events` bucket rather than stored as
 * a URL, so moving buckets or putting a CDN in front is a config change instead
 * of a data migration.
 */

/** 16:9. Posters are landscape and the sheet is narrow. */
const ASPECT = 16 / 9;

export function EventCover({ path, title }: { path: string | null; title: string }) {
  if (!path) return null;

  const { data } = supabase.storage.from('events').getPublicUrl(path);
  if (!data?.publicUrl) return null;

  return (
    <YStack borderRadius={radius.lg} overflow="hidden" aspectRatio={ASPECT}>
      <Image
        source={{ uri: data.publicUrl }}
        style={{ width: '100%', height: '100%' }}
        // `contain` rather than `cover`: a poster carries text to its edges, and
        // filling the frame crops the title off the one people came to read.
        contentFit="contain"
        transition={200}
        accessibilityLabel={`Poster for ${title}`}
      />
    </YStack>
  );
}
