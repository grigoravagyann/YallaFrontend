import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@yalla/i18n';
import { memo } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { Place } from '../../places/model';
import { useFavorites, useIsFavorite } from '../../stores/favorites';
import {
  actionIcon,
  colors,
  displayWeight,
  fontWeight,
  radius,
  ratingIcon,
  space,
  tabularNumbers,
} from '../../theme';
import { Badge } from '../Badge';
import { Card } from '../Card';
import { HeartPop, useSavePop } from '../HeartPop';
import { IconButton } from '../IconButton';
import { usePressScale } from '../motion/usePressScale';
import { PhotoImage } from '../PhotoImage';
import { Text } from '../Text';
import { usePlaceCopy } from './placeCopy';
import { placeTitle } from './placeTitle';

/** The card's height: five short lines beside the photo. */
export const ROW_CARD_HEIGHT = 112;
/** The photo on the left of the card. */
export const ROW_PHOTO_WIDTH = 160;
/** Room kept on the right of the name for the heart. */
const HEART_CLEARANCE = 34;

export interface PlaceRowCardProps {
  readonly place: Place;
  readonly onPress: (placeId: string) => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Where a place is, as a card line: the branch when it has a name of its own
 * (that is what tells two of a venue apart, and it is usually the street),
 * else the first part of the address — "5 Northern Avenue" of
 * "5 Northern Avenue, Yerevan". There is no neighbourhood field to show.
 */
export function placeArea(place: Pick<Place, 'name' | 'venueName' | 'branchName' | 'address'>) {
  const { branch } = placeTitle(place);
  if (branch) return branch;
  return place.address.split(',')[0]?.trim() ?? '';
}

/**
 * The Explore list's unit: a photo on the left, five lines on the right.
 *
 * The venue in the serif, then where it is, what it is, the rating and the
 * distance, and whether it is open with today's hours. The heart sits
 * top-right. Open and Closed say whether you can go now, and they sit on the
 * last line, by the hours they come from.
 *
 * Memoised, like the hero card it replaced on Explore: a keystroke in the
 * search box re-renders the list, not every photo in it.
 */
export const PlaceRowCard = memo(function PlaceRowCard({
  place,
  onPress,
  style,
}: PlaceRowCardProps) {
  const { t } = useTranslation('diner');
  const copy = usePlaceCopy(place);
  const favorited = useIsFavorite(place.id);
  const toggleFavorite = useFavorites((state) => state.toggle);
  const { popKey, onSavePress } = useSavePop();
  const press = usePressScale();
  const status = place.openState.isOpen ? 'open' : 'closed';
  const title = placeTitle(place);
  const area = placeArea(place);

  // The same label as the hero card: the place's name first, so a screen
  // reader (and the e2e suite) finds the card by it.
  const summary = [
    title.label,
    copy.typeLine,
    copy.rating,
    copy.distance,
    t(`place.status.${status}`),
  ]
    // A distance not known yet is no part at all, not ". ." (QA 20261016T2 B8).
    .filter((part) => part.trim().length > 0)
    .join('. ');

  // Not itself a button: the heart is one, and a button inside a button is
  // invalid on the web build. A tap layer covers the card and the heart sits
  // above it as a sibling, so each is its own control. The drawn lines are
  // hidden from the accessibility tree — the tap layer's label says them.
  return (
    <Animated.View style={[press.style, style]}>
      <Card padded={false} style={styles.card}>
        <View
          style={styles.row}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <PhotoImage source={place.photos[0]} style={styles.photo} />
          <View style={styles.body}>
            <Text display numberOfLines={1} style={styles.name}>
              {title.venue}
            </Text>
            {area ? (
              <View style={styles.line}>
                <Ionicons name={actionIcon.location} size={11} color={colors.textMuted} />
                <Text numberOfLines={1} style={[styles.meta, styles.flexText]}>
                  {area}
                </Text>
              </View>
            ) : null}
            <Text numberOfLines={1} style={styles.meta}>
              {copy.typeLine}
            </Text>
            <View style={styles.ratingRow}>
              <View style={styles.line}>
                {place.rating !== null ? (
                  // Filled: the star stands for the rating earned.
                  <Ionicons name={ratingIcon.filled} size={11} color={colors.warningInk} />
                ) : null}
                <Text numberOfLines={1} style={[styles.meta, styles.figures]}>
                  {copy.rating}
                </Text>
              </View>
              {copy.distance ? (
                <Text numberOfLines={1} style={[styles.meta, styles.figures]}>
                  {copy.distance}
                </Text>
              ) : null}
            </View>
            <View style={styles.statusRow}>
              <Badge variant={status} size="sm" />
              {place.openState.todayLabel ? (
                <Text numberOfLines={1} style={[styles.meta, styles.figures, styles.flexText]}>
                  {place.openState.todayLabel}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={summary}
          onPress={() => onPress(place.id)}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={({ pressed }) => [styles.tap, pressed && styles.tapPressed]}
        />

        <HeartPop popKey={popKey} style={styles.heart}>
          <IconButton
            icon={favorited ? actionIcon.favorited : actionIcon.favorite}
            size="sm"
            // The glass circle the hero card's heart sits in: the filled heart
            // carries the saved state, and the glyph stays white on the glass.
            variant="translucent"
            accessibilityLabel={t(favorited ? 'place.unfavorite' : 'place.favorite')}
            onPress={() => {
              onSavePress(!favorited);
              toggleFavorite(place.id);
            }}
            iconColor={colors.onImage}
          />
        </HeartPop>
      </Card>
    </Animated.View>
  );
});

const META_SIZE = 12.5;
const META_LINE = 17;

const styles = StyleSheet.create({
  card: { height: ROW_CARD_HEIGHT },
  row: { flex: 1, flexDirection: 'row' },
  photo: {
    width: ROW_PHOTO_WIDTH,
    height: '100%',
    borderTopLeftRadius: radius.card,
    borderBottomLeftRadius: radius.card,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: space.sm - 1,
    paddingBottom: space.sm - 1,
    paddingLeft: space.md,
    paddingRight: space.sm,
  },
  name: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: displayWeight.semibold,
    color: colors.text,
    paddingRight: HEART_CLEARANCE,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 },
  flexText: { flexShrink: 1 },
  meta: {
    fontSize: META_SIZE,
    lineHeight: META_LINE,
    fontWeight: fontWeight.regular,
    color: colors.textMuted,
  },
  figures: { ...tabularNumbers },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 1 },
  tap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.card },
  tapPressed: { backgroundColor: colors.overlayDark, opacity: 0.25 },
  heart: { position: 'absolute', top: space.xs + 2, right: space.xs + 2 },
});
