import { Ionicons } from '@expo/vector-icons';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
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

/** About four of these fit between the chips and the nav on a 390×844 phone. */
export const EXPLORE_CARD_HEIGHT = 118;
const CARD_RADIUS = 17;

/**
 * The scrim under the name: clear for the top third, then deepening to a warm
 * near-black at the bottom edge, so cream text reads on any photo.
 */
const SCRIM = ['rgba(20,13,9,0)', 'rgba(20,13,9,0.45)', 'rgba(20,13,9,0.82)'] as const;
const SCRIM_STOPS = [0.3, 0.58, 1] as const;
/** The rating star on a photo: a warm honey that reads on the dark scrim. */
const STAR_ON_PHOTO = '#F0B866';
/** The heart's edge: a whisper of white, so the glass circle holds on a dark photo. */
const HEART_EDGE = 'rgba(255,255,255,0.22)';

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
        <View style={styles.caption}>
          {showBranch && title.branch ? (
            <Text numberOfLines={1} style={styles.branch}>
              {title.branch}
            </Text>
          ) : null}
          <Text display numberOfLines={1} style={styles.name}>
            {title.venue}
          </Text>
          <View style={styles.meta}>
            <Text numberOfLines={1} style={[styles.metaText, styles.shrink]}>
              {kind}
            </Text>
            <Text style={styles.metaText}>·</Text>
            {stars !== null ? (
              <>
                <Ionicons name={ratingIcon.filled} size={13} color={STAR_ON_PHOTO} />
                <Text style={[styles.metaText, styles.figures]}>{stars}</Text>
              </>
            ) : (
              <Text numberOfLines={1} style={[styles.metaText, styles.shrink]}>
                {t('place.noReviews')}
              </Text>
            )}
            {copy.distance ? (
              <>
                <Text style={styles.metaText}>·</Text>
                <Text numberOfLines={1} style={[styles.metaText, styles.figures]}>
                  {copy.distance}
                </Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={[styles.badge, open ? styles.badgeOpen : styles.badgeClosed]}>
          <Text
            numberOfLines={1}
            style={[styles.badgeText, open ? styles.badgeTextOpen : styles.badgeTextClosed]}
          >
            {status}
          </Text>
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

const styles = StyleSheet.create({
  card: {
    height: EXPLORE_CARD_HEIGHT,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.surfaceDark,
    ...shadows.card,
  },
  caption: {
    position: 'absolute',
    left: 14,
    // Clear of the Open / Closed badge on the right.
    right: 92,
    bottom: 11,
    gap: 2,
  },
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
    position: 'absolute',
    right: 10,
    bottom: 11,
    height: 26,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  badgeOpen: { backgroundColor: colors.successStrong },
  badgeClosed: { backgroundColor: colors.neutralStrong },
  badgeText: { fontSize: 12.5, lineHeight: 16, fontWeight: fontWeight.bold, letterSpacing: 0.1 },
  badgeTextOpen: { color: colors.onSuccessStrong },
  badgeTextClosed: { color: colors.onNeutralStrong },
  tapPressed: { backgroundColor: 'rgba(20,13,9,0.12)' },
  heartWrap: { position: 'absolute', top: space.sm, right: space.sm },
  heart: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: HEART_EDGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartPressed: { opacity: 0.8 },
});
