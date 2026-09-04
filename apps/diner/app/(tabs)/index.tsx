import { mockVenues, type Venue, type VenueType } from '@yalla/api/mocks';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { VenueCard } from '../../src/components/VenueCard';

type Filter = 'all' | 'cafes' | 'restaurants';

const FILTERS: readonly { key: Filter; type: VenueType | null }[] = [
  { key: 'all', type: null },
  { key: 'cafes', type: 'cafe' },
  { key: 'restaurants', type: 'restaurant' },
];

/**
 * Explore — the first screen anyone sees.
 *
 * It has to look worth browsing rather than like a utility, so the venue cards
 * lead with the one number only this app can show: how many tables are free
 * right now.
 */
export default function ExploreScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Mock data is instant, but the loading branch exists now so the screen does
  // not need restructuring the moment a real fetch replaces it.
  const [isLoading] = useState(false);
  const venues: readonly Venue[] = mockVenues;

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const wanted = FILTERS.find((f) => f.key === filter)?.type ?? null;

    return venues.filter((venue) => {
      if (wanted && venue.type !== wanted) return false;
      if (!needle) return true;
      // Match branch names too: someone searching "Cascade" means the branch.
      return (
        venue.name.toLocaleLowerCase().includes(needle) ||
        venue.branches.some((b) => b.name.toLocaleLowerCase().includes(needle))
      );
    });
  }, [venues, query, filter]);

  const openVenue = useCallback(
    (venueId: string) => {
      // Object form, not a template string: typed routes match on the route
      // pattern, so a literal path is not assignable.
      router.push({ pathname: '/venue/[venueId]', params: { venueId } });
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.city}>{t('explore.city')}</Text>
        <Text style={styles.count}>{t('explore.placesNearby', { count: venues.length })}</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t('explore.searchPlaceholder')}
          placeholderTextColor={color.textSecondary}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t('explore.searchPlaceholder')}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.chips}>
        {FILTERS.map(({ key }) => {
          const active = key === filter;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t(`explore.filter.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={color.accent} />
          <Text style={styles.emptyBody}>{t('explore.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(venue) => venue.id}
          renderItem={({ item }) => <VenueCard venue={item} onPress={openVenue} />}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          // An empty search result needs a real message, not a blank screen.
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>{t('explore.empty.title')}</Text>
              <Text style={styles.emptyBody}>{t('explore.empty.body')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.background },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  city: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.textPrimary,
  },
  count: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.textSecondary,
  },
  searchWrap: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  search: {
    minHeight: touchTarget.minimum,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    color: color.textPrimary,
    fontSize: fontSize.md,
  },
  chips: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  chip: {
    minHeight: touchTarget.minimum - 8,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipActive: {
    borderColor: color.accentStrong,
    backgroundColor: color.accentMuted,
  },
  chipText: { fontSize: fontSize.sm, color: color.textPrimary },
  chipTextActive: { color: color.accentStrong, fontWeight: fontWeight.semibold },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  centered: { alignItems: 'center', paddingTop: space.xxl, gap: space.sm },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: color.textPrimary,
  },
  emptyBody: {
    fontSize: fontSize.sm,
    color: color.textSecondary,
    textAlign: 'center',
  },
});
