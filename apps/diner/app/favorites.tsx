import { useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Badge } from '../src/components/Badge';
import { Card } from '../src/components/Card';
import { EmptyState } from '../src/components/EmptyState';
import { ErrorState } from '../src/components/ErrorState';
import { IconButton } from '../src/components/IconButton';
import { PhotoImage } from '../src/components/PhotoImage';
import { PlaceMetaRow, usePlaceCopy } from '../src/components/places/placeCopy';
import { Screen } from '../src/components/Screen';
import { Skeleton } from '../src/components/Skeleton';
import { Text } from '../src/components/Text';
import { usePlaces } from '../src/places/hooks';
import type { Place } from '../src/places/model';
import { useFavorites } from '../src/stores/favorites';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
} from '../src/theme';

const THUMB = 72;
const SKELETON_ROWS = [0, 1, 2] as const;

/**
 * Favorites — every place the diner tapped the heart on, in the order they
 * were saved. Kept on the phone, so the list is the store's ids resolved
 * against the places the browse data knows.
 */
export default function FavoritesScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const favoriteIds = useFavorites((s) => s.favoriteIds);
  const hydrated = useFavorites((s) => s.hydrated);
  const toggle = useFavorites((s) => s.toggle);
  const placesQuery = usePlaces();
  const { data, isLoading, isError, refetch } = placesQuery;

  const favorites = useMemo(() => {
    const byId = new Map((data ?? []).map((place) => [place.id, place] as const));
    return favoriteIds.flatMap((id) => {
      const place = byId.get(id);
      return place ? [place] : [];
    });
  }, [data, favoriteIds]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const header = (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        onPress={goBack}
        accessibilityLabel={t('floorPlan.back')}
        variant="ghost"
      />
      <Text display numberOfLines={1} style={styles.title} accessibilityRole="header">
        {t('favorites.title')}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if ((isLoading || !hydrated) && favoriteIds.length > 0) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        {header}
        <View style={styles.list}>
          {SKELETON_ROWS.map((row) => (
            <Card key={row} style={styles.card}>
              <View style={styles.row}>
                <Skeleton width={THUMB} height={THUMB} borderRadius={radius.chip} />
                <View style={[styles.body, styles.skeletonBody]}>
                  <Skeleton width="60%" height={18} />
                  <Skeleton width="45%" height={14} />
                  <Skeleton width="35%" height={14} />
                </View>
              </View>
            </Card>
          ))}
        </View>
      </Screen>
    );
  }

  if (isError && !data && favoriteIds.length > 0) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        {header}
        <ErrorState onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {header}
      <FlatList
        data={favorites}
        keyExtractor={(place) => place.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <FavoriteRow
            place={item}
            style={styles.card}
            onRemove={() => toggle(item.id)}
            onPress={() =>
              router.push({ pathname: '/place/[placeId]', params: { placeId: item.id } })
            }
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={actionIcon.favorite}
            title={t('favorites.empty.title')}
            body={t('favorites.empty.body')}
            action={{ label: t('tabs.explore'), onPress: () => router.replace('/(tabs)') }}
          />
        }
      />
    </Screen>
  );
}

/**
 * One saved place: photo thumb, name and badge, type and cuisine, rating and
 * distance, an Open/Closed pill, and the filled heart that un-saves it.
 */
function FavoriteRow({
  place,
  onPress,
  onRemove,
  style,
}: {
  readonly place: Place;
  readonly onPress: () => void;
  readonly onRemove: () => void;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const copy = usePlaceCopy(place);
  const badge = place.badges[0];
  const photo = place.photos[0];
  return (
    <Card onPress={onPress} accessibilityLabel={place.name} style={style}>
      <View style={styles.row}>
        {photo ? (
          <PhotoImage source={photo} style={styles.thumb} accessibilityLabel={place.name} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons
              name={actionIcon.imageFallback}
              size={iconSize.lg}
              color={colors.textSubtle}
            />
          </View>
        )}
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {place.name}
            </Text>
            {badge ? <Badge variant={badge} size="sm" /> : null}
          </View>
          <Text numberOfLines={1} style={styles.detail}>
            {copy.typeLine}
          </Text>
          <PlaceMetaRow place={place} order="ratingFirst" />
          <Badge variant={place.openState.isOpen ? 'open' : 'closed'} tone="soft" size="sm" />
        </View>
        <IconButton
          icon={actionIcon.favorited}
          onPress={onRemove}
          accessibilityLabel={t('place.unfavorite')}
          variant="ghost"
          size="sm"
          iconColor={colors.error}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  title: { ...typography.heading, color: colors.text, flex: 1, textAlign: 'center' },
  headerSpacer: { width: layout.touchTarget },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
  },
  card: { marginBottom: layout.cardGap },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.chip },
  thumbFallback: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: space.xs },
  skeletonBody: { gap: space.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text, flex: 1 },
  detail: { ...typography.caption, color: colors.textMuted },
});
