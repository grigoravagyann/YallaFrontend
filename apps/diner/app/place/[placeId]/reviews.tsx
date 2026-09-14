import { isOfflinePaused } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { EmptyState } from '../../../src/components/EmptyState';
import { IconButton } from '../../../src/components/IconButton';
import { Screen } from '../../../src/components/Screen';
import { Skeleton } from '../../../src/components/Skeleton';
import { Text } from '../../../src/components/Text';
import { usePlace, useReviewPages } from '../../../src/places/hooks';
import { ReviewCard, useReviewReporting } from '../../../src/places/ReviewList';
import { actionIcon, colors, layout, radius, space, typography } from '../../../src/theme';

/**
 * Every review of one place, newest first, twenty at a time as the list is
 * scrolled. The place page shows the newest three and links here when there
 * are more.
 */
export default function PlaceReviewsScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const pages = useReviewPages(placeId);
  const { data: place } = usePlace(placeId);
  const reporting = useReviewReporting(placeId ?? '');

  const reviews = useMemo(
    () => pages.data?.pages.flatMap((page) => page?.reviews ?? []) ?? [],
    [pages.data],
  );
  const unknownPlace = pages.data !== undefined && pages.data.pages[0] === null;
  const offline = isOfflinePaused(pages) && !pages.data;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (placeId) router.replace({ pathname: '/place/[placeId]', params: { placeId } });
    else router.replace('/');
  };

  const header = (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        onPress={goBack}
        accessibilityLabel={t('floorPlan.back')}
        variant="ghost"
      />
      <View style={styles.headerBody}>
        <Text display numberOfLines={1} style={styles.title} accessibilityRole="header">
          {t('reviews.title')}
        </Text>
        {place?.name ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {place.name}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );

  let content;
  if (offline || (pages.isError && !pages.data)) {
    content = (
      <View style={styles.state}>
        <Text style={styles.stateText} accessibilityRole="alert">
          {offline ? t('net.offline') : t('reviews.loadFailed')}
        </Text>
        <Button
          label={t('net.retry')}
          variant="outline"
          fullWidth={false}
          onPress={() => void pages.refetch()}
        />
      </View>
    );
  } else if (!pages.data) {
    content = (
      <View style={styles.list} accessibilityLabel={t('net.loading')}>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} height={96} borderRadius={radius.card} />
        ))}
      </View>
    );
  } else if (unknownPlace) {
    content = (
      <EmptyState
        icon={actionIcon.error}
        title={t('floorPlan.notFound')}
        action={{ label: t('floorPlan.back'), onPress: goBack }}
      />
    );
  } else {
    content = (
      <FlatList
        data={reviews}
        keyExtractor={(review) => review.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ReviewCard
            review={item}
            onReport={reporting.canReport(item) ? () => reporting.open(item.id) : undefined}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
        }}
        ListFooterComponent={
          pages.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.footer} />
          ) : null
        }
        ListEmptyComponent={<Text style={styles.stateText}>{t('reviews.empty')}</Text>}
      />
    );
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}
      {content}
      <View style={styles.toast} pointerEvents="box-none">
        {reporting.element}
      </View>
    </Screen>
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
  headerBody: { flex: 1, alignItems: 'center' },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.caption, color: colors.textMuted },
  headerSpacer: { width: layout.touchTarget },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  state: { paddingHorizontal: layout.screenPadding, paddingTop: space.lg, gap: space.md },
  stateText: { ...typography.body, color: colors.textMuted },
  footer: { marginVertical: space.lg },
  toast: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    bottom: space.xl,
  },
});
