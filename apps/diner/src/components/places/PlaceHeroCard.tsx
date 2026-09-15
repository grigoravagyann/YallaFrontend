import { useTranslation } from '@yalla/i18n';
import { memo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Place } from '../../places/model';
import { useFavorites, useIsFavorite } from '../../stores/favorites';
import { actionIcon, colors, fontWeight, layout, radius, space } from '../../theme';
import { Badge } from '../Badge';
import { Card } from '../Card';
import { IconButton } from '../IconButton';
import { PhotoImage } from '../PhotoImage';
import { Text } from '../Text';
import { PlaceMetaRow, usePlaceCopy } from './placeCopy';
import { placeTitle } from './placeTitle';

export { PlaceMetaRow, usePlaceCopy } from './placeCopy';
export type { PlaceCopy, PlaceMetaRowProps } from './placeCopy';

/** The bottom fraction of the photo under the dark scrim, so white text reads on any image. */
const SCRIM = 0.55;
/** Room kept on the right of the caption for the Open / Closed pill. */
const STATUS_CLEARANCE = 96;

export interface PlaceHeroCardProps {
  readonly place: Place;
  readonly onPress: (placeId: string) => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The Explore list's unit: the photo is the card.
 *
 * Everything else is laid over it — the content badge top-left, the heart
 * top-right, the name and its two lines bottom-left over a dark scrim, and
 * the Open / Closed pill bottom-right. Open and Closed say whether you can go
 * now; Popular and New say why you might. They never share a corner.
 *
 * Memoised: a keystroke in the search box or a pull to refresh re-renders the
 * list, not every photo in it. The heart reads its own state from the store.
 */
export const PlaceHeroCard = memo(function PlaceHeroCard({
  place,
  onPress,
  style,
}: PlaceHeroCardProps) {
  const { t } = useTranslation('diner');
  const copy = usePlaceCopy(place);
  const favorited = useIsFavorite(place.id);
  const toggleFavorite = useFavorites((state) => state.toggle);
  const contentBadge = place.badges[0];
  const status = place.openState.isOpen ? 'open' : 'closed';
  const photo = place.photos[0];
  const title = placeTitle(place);

  const summary = [
    title.label,
    copy.typeLine,
    copy.rating,
    copy.distance,
    t(`place.status.${status}`),
  ].join('. ');

  // The card is not itself a button: the heart is one, and a button inside a
  // button is invalid on the web build and nests the two in the accessibility
  // tree on the phone. Instead a tap layer covers the photo and the heart sits
  // above it as a sibling, so each is its own control.
  return (
    <Card padded={false} radiusToken="hero" style={style}>
      <PhotoImage source={photo} gradient={SCRIM} style={styles.photo}>
        {contentBadge ? <Badge variant={contentBadge} size="sm" style={styles.badge} /> : null}

        <View style={styles.caption} pointerEvents="none">
          <Text numberOfLines={1} style={styles.name}>
            {title.venue}
          </Text>
          {title.branch ? (
            <Text numberOfLines={1} style={styles.branch}>
              {title.branch}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={styles.typeLine}>
            {copy.typeLine}
          </Text>
          <PlaceMetaRow place={place} order="ratingFirst" onImage />
        </View>

        <Badge variant={status} size="sm" style={styles.status} />
      </PhotoImage>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary}
        onPress={() => onPress(place.id)}
        style={({ pressed }) => [styles.tap, pressed && styles.tapPressed]}
      />

      <IconButton
        icon={favorited ? actionIcon.favorited : actionIcon.favorite}
        size="sm"
        // A glass circle, not a bare glyph: a white heart on a pale photo
        // vanished, and the backing is what keeps it at 3:1 on any image. The
        // glyph stays white when saved — the filled heart carries the state, and
        // red on the glass is about 1.3:1 over a light photo.
        variant="translucent"
        accessibilityLabel={t(favorited ? 'place.unfavorite' : 'place.favorite')}
        onPress={() => toggleFavorite(place.id)}
        iconColor={colors.onImage}
        style={styles.heart}
      />
    </Card>
  );
});

const styles = StyleSheet.create({
  photo: { height: layout.heroCardHeight, borderRadius: radius.hero },
  tap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.hero },
  tapPressed: { backgroundColor: colors.overlayDark, opacity: 0.25 },
  badge: { position: 'absolute', top: space.md, left: space.md, opacity: 0.92 },
  heart: { position: 'absolute', top: space.sm + 2, right: space.sm + 2 },
  caption: {
    position: 'absolute',
    left: space.md,
    right: STATUS_CLEARANCE,
    bottom: space.md,
    gap: 3,
  },
  name: { fontSize: 21, lineHeight: 26, fontWeight: fontWeight.bold, color: colors.onImage },
  branch: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: fontWeight.medium,
    color: colors.onImage,
    marginTop: -2,
  },
  typeLine: { fontSize: 14, lineHeight: 18, color: colors.onImageMuted },
  status: { position: 'absolute', right: space.md, bottom: space.md },
});
