import { Ionicons } from '@expo/vector-icons';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo, type ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { Place } from '../../places/model';
import { useFavorites, useIsFavorite } from '../../stores/favorites';
import {
  actionIcon,
  colors,
  displayWeight,
  fontWeight,
  layout,
  radius,
  ratingIcon,
  shadows,
  space,
  tabularNumbers,
} from '../../theme';
import { HeartPop, useSavePop } from '../HeartPop';
import { usePressScale } from '../motion/usePressScale';
import { PhotoImage } from '../PhotoImage';
import { usePlaceCopy } from '../places/placeCopy';
import { placeTitle } from '../places/placeTitle';
import { Text } from '../Text';

/**
 * About four of these fit between the chips and the nav on a 390×844 phone.
 * A floor, not a height: a large system font grows the card rather than
 * clipping its caption.
 */
export const EXPLORE_CARD_HEIGHT = 118;
export const EXPLORE_CARD_RADIUS = 17;
/**
 * How far a large system font may grow the caption and the badge. Past this
 * the venue's name would be cut to a few letters on a 360 pt phone.
 */
const MAX_CAPTION_SCALE = 1.3;

/**
 * The scrim under the name: clear for the top third, then deepening to a warm
 * near-black at the bottom edge, so cream text reads on any photo.
 */
const SCRIM = [colors.photoScrimClear, colors.photoScrimMid, colors.photoScrimDeep] as const;
const SCRIM_STOPS = [0.3, 0.58, 1] as const;

export interface ExplorePlaceCardProps {
  readonly place: Place;
  readonly onPress: (placeId: string) => void;
  /**
   * Another branch of the same venue is in the list: name the branch too, so
   * the two cards can be told apart. Otherwise the venue's name stands alone.
   */
  readonly showBranch?: boolean;
}

/**
 * The Explore list's unit: the photo edge to edge, the venue in the cream
 * serif over a dark scrim, one line under it — what it is, ★ rating, how far —
 * the heart in a glass circle top right and Open / Closed bottom right.
 *
 * Not itself a button: the heart is one, and a button inside a button is
 * invalid on the web build. A tap layer covers the card and the heart sits
 * above it as a sibling, so each is its own control. The drawn lines are hidden
 * from the accessibility tree; the tap layer's label says them, name first.
 *
 * Memoised: a keystroke in the search box re-renders the list, not every photo.
 */
export const ExplorePlaceCard = memo(function ExplorePlaceCard({
  place,
  onPress,
  showBranch = false,
}: ExplorePlaceCardProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const copy = usePlaceCopy(place);
  const favorited = useIsFavorite(place.id);
  const toggleFavorite = useFavorites((state) => state.toggle);
  const { popKey, onSavePress } = useSavePop();
  const press = usePressScale();
  const open = place.openState.isOpen;
  const title = placeTitle(place);
  const kind = t(`place.type.${place.type}`);
  const stars = useMemo(
    () =>
      place.rating === null
        ? null
        : new Intl.NumberFormat(intlTag(locale), {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(place.rating),
    [locale, place.rating],
  );
  const status = t(open ? 'place.status.open' : 'place.status.closed');

  const summary = [title.label, copy.typeLine, copy.rating, copy.distance, status]
    // A distance not known yet is no part at all, not ". ." (QA 20261016T2 B8).
    .filter((part) => part.trim().length > 0)
    .join('. ');

  return (
    <Animated.View style={[styles.card, press.style]}>
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <PhotoImage source={place.photos[0]} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={SCRIM} locations={SCRIM_STOPS} style={StyleSheet.absoluteFill} />
      </View>

      {/* In the flow, so a large font grows the card; the badge shares the
          row, so a long "Closed" pushes the caption over instead of onto it. */}
      <View
        style={styles.footer}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.caption}>
          {showBranch && title.branch ? (
            <Caption numberOfLines={1} style={styles.branch}>
              {title.branch}
            </Caption>
          ) : null}
          <Caption display numberOfLines={1} style={styles.name}>
            {title.venue}
          </Caption>
          <View style={styles.meta}>
            <Caption numberOfLines={1} style={[styles.metaText, styles.shrink]}>
              {kind}
            </Caption>
            <Caption style={styles.metaText}>·</Caption>
            {stars !== null ? (
              <>
                <Ionicons name={ratingIcon.filled} size={13} color={colors.photoStar} />
                <Caption style={[styles.metaText, styles.figures]}>{stars}</Caption>
              </>
            ) : (
              <Caption numberOfLines={1} style={[styles.metaText, styles.shrink]}>
                {t('place.noReviews')}
              </Caption>
            )}
            {copy.distance ? (
              <>
                <Caption style={styles.metaText}>·</Caption>
                <Caption numberOfLines={1} style={[styles.metaText, styles.figures]}>
                  {copy.distance}
                </Caption>
              </>
            ) : null}
          </View>
        </View>
        <View style={[styles.badge, open ? styles.badgeOpen : styles.badgeClosed]}>
          <Caption
            numberOfLines={1}
            style={[styles.badgeText, open ? styles.badgeTextOpen : styles.badgeTextClosed]}
          >
            {status}
          </Caption>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary}
        onPress={() => onPress(place.id)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.tapPressed]}
      />

      <HeartPop popKey={popKey} style={styles.heartWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(favorited ? 'place.unfavorite' : 'place.favorite')}
          accessibilityState={{ selected: favorited }}
          onPress={() => {
            onSavePress(!favorited);
            toggleFavorite(place.id);
          }}
          style={({ pressed }) => [styles.heart, pressed && styles.heartPressed]}
        >
          <Ionicons
            name={favorited ? actionIcon.favorited : actionIcon.favorite}
            size={20}
            color={colors.onImage}
          />
        </Pressable>
      </HeartPop>
    </Animated.View>
  );
});

/** A line of the caption or the badge: grows with the system font, up to the cap. */
function Caption(props: ComponentProps<typeof Text>) {
  return <Text maxFontSizeMultiplier={MAX_CAPTION_SCALE} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    minHeight: EXPLORE_CARD_HEIGHT,
    justifyContent: 'flex-end',
    borderRadius: EXPLORE_CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.surfaceDark,
    ...shadows.card,
  },
  // The caption and the badge, one row along the bottom edge. The top padding
  // keeps a caption grown by a large font under the heart's row.
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingTop: space.sm + layout.touchTarget,
    paddingLeft: 14,
    paddingRight: 10,
    paddingBottom: 11,
  },
  caption: { flex: 1, minWidth: 0, gap: 2 },
  branch: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: fontWeight.medium,
    color: colors.onImageMuted,
  },
  name: {
    fontSize: 21,
    lineHeight: 25,
    fontWeight: displayWeight.bold,
    color: colors.onImage,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  metaText: { fontSize: 13, lineHeight: 17, color: colors.onImageMuted },
  shrink: { flexShrink: 1 },
  figures: { ...tabularNumbers },
  badge: {
    flexShrink: 0,
    minHeight: 26,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  badgeOpen: { backgroundColor: colors.successStrong },
  badgeClosed: { backgroundColor: colors.neutralStrong },
  badgeText: { fontSize: 12.5, lineHeight: 16, fontWeight: fontWeight.bold, letterSpacing: 0.1 },
  badgeTextOpen: { color: colors.onSuccessStrong },
  badgeTextClosed: { color: colors.onNeutralStrong },
  tapPressed: { backgroundColor: colors.photoPressed },
  heartWrap: { position: 'absolute', top: space.sm, right: space.sm },
  heart: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartPressed: { opacity: 0.8 },
});
