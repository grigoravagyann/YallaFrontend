import type { DinerNotification } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Button } from '../src/components/Button';
import { EmptyState } from '../src/components/EmptyState';
import { ErrorState } from '../src/components/ErrorState';
import { IconButton } from '../src/components/IconButton';
import { Screen } from '../src/components/Screen';
import { Skeleton } from '../src/components/Skeleton';
import { Text } from '../src/components/Text';
import { useMarkNotificationsRead, useNotificationFeed } from '../src/data/notificationQueries';
import { notificationCopy, notificationRoute } from '../src/data/notifications';
import { useSession } from '../src/stores/session';
import { actionIcon, colors, fontWeight, layout, radius, space, typography } from '../src/theme';

const SKELETON_ROWS = [0, 1, 2, 3] as const;

/**
 * Notifications — every booking update, ready order and hidden review the
 * server sent this account, newest first (K12).
 *
 * The feed is the record; a push is only a faster way of hearing about a row.
 * Tapping a row marks it read and opens what it is about. Pull to refresh;
 * older rows load as the list scrolls.
 */
export default function NotificationsScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const signedIn = useSession((state) => state.signedIn);
  const feed = useNotificationFeed();
  const markRead = useMarkNotificationsRead();
  const [pulling, setPulling] = useState(false);

  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);
  const unreadCount = feed.data?.pages[0]?.unreadCount ?? 0;
  const offline = isOfflinePaused(feed) && !feed.data;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const openRow = (notification: DinerNotification) => {
    if (!notification.read) markRead.mutate({ ids: [notification.notificationId] });
    const route = notificationRoute(notification);
    if (route) router.push(route);
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
        {t('notifications.title')}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (!signedIn) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        {header}
        <EmptyState
          icon="notifications-outline"
          title={t('notifications.empty')}
          body={t('notifications.emptyBody')}
          action={{ label: t('profile.logIn'), onPress: () => router.push('/auth/login') }}
        />
      </Screen>
    );
  }

  if (offline || (feed.isError && !feed.data)) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        {header}
        <ErrorState
          offline={offline}
          {...(offline ? {} : { body: t('notifications.loadFailed') })}
          onRetry={() => void feed.refetch()}
        />
      </Screen>
    );
  }

  if (!feed.data) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        {header}
        <View style={styles.list} accessibilityLabel={t('net.loading')}>
          {SKELETON_ROWS.map((row) => (
            <View key={row} style={[styles.row, styles.skeletonRow]}>
              <Skeleton width="50%" height={16} />
              <Skeleton width="85%" height={14} />
            </View>
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {header}
      {unreadCount > 0 && items[0] ? (
        <Button
          label={t('notifications.markAllRead')}
          variant="text"
          fullWidth={false}
          disabled={markRead.isPending}
          onPress={() => markRead.mutate({ upTo: items[0]!.notificationId })}
          style={styles.markAll}
        />
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.notificationId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <NotificationRow notification={item} onPress={openRow} />}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            tintColor={colors.primary}
            onRefresh={() => {
              setPulling(true);
              void feed.refetch().finally(() => setPulling(false));
            }}
          />
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.footer} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title={t('notifications.empty')}
            body={t('notifications.emptyBody')}
          />
        }
      />
    </Screen>
  );
}

function NotificationRow({
  notification,
  onPress,
}: {
  readonly notification: DinerNotification;
  readonly onPress: (notification: DinerNotification) => void;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const copy = notificationCopy(notification);
  const when = useMemo(() => {
    const at = new Date(notification.createdAtUtc);
    return Number.isNaN(at.getTime())
      ? ''
      : new Intl.DateTimeFormat(intlTag(locale), {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(at);
  }, [notification.createdAtUtc, locale]);
  const title = t(copy.titleKey, copy.params);
  const body = t(copy.bodyKey, copy.params);

  return (
    <Pressable
      accessibilityRole="button"
      // The dot and the bold title are the only unread signs on screen, and the
      // dot is hidden from a screen reader, so the label says it.
      accessibilityLabel={`${notification.read ? '' : `${t('notifications.unread')}. `}${title}. ${body}. ${when}`}
      onPress={() => onPress(notification)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View
        style={[styles.dot, notification.read && styles.dotRead]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, !notification.read && styles.rowTitleUnread]}>{title}</Text>
        <Text style={styles.rowText}>{body}</Text>
        {when ? <Text style={styles.rowTime}>{when}</Text> : null}
      </View>
    </Pressable>
  );
}

const DOT = 8;

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
  markAll: { alignSelf: 'flex-end', marginHorizontal: layout.screenPadding },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  skeletonRow: { flexDirection: 'column' },
  dot: {
    width: DOT,
    height: DOT,
    marginTop: space.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  dotRead: { backgroundColor: 'transparent' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, color: colors.text },
  rowTitleUnread: { fontWeight: fontWeight.bold },
  rowText: { ...typography.body, color: colors.textMuted },
  rowTime: { ...typography.caption, color: colors.textMuted },
  footer: { marginVertical: space.lg },
});
