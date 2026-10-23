import {
  isVenueMessageNotificationKind,
  venueMessageFeedSubject,
  type DinerNotification,
} from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { Button } from '../src/components/Button';
import { EmptyState } from '../src/components/EmptyState';
import { ErrorState } from '../src/components/ErrorState';
import { IconButton } from '../src/components/IconButton';
import { Rise, riseDelay } from '../src/components/motion/Rise';
import { usePressScale } from '../src/components/motion/usePressScale';
import { Screen } from '../src/components/Screen';
import { Skeleton } from '../src/components/Skeleton';
import { Text } from '../src/components/Text';
import { useMarkNotificationsRead, useNotificationFeed } from '../src/data/notificationQueries';
import { bookingKeysForRow, notificationCopy, notificationRoute } from '../src/data/notifications';
import { useNow } from '../src/hooks/useNow';
import { useSession } from '../src/stores/session';
import {
  actionIcon,
  colors,
  displayWeight,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
  type IoniconName,
} from '../src/theme';

const SKELETON_ROWS = [0, 1, 2, 3] as const;

type Day = 'today' | 'yesterday' | 'earlier';

interface DaySection {
  readonly day: Day;
  readonly data: readonly DinerNotification[];
}

/** The glyph in each row's circle, by what the row is about. */
const KIND_ICON: Readonly<Record<string, IoniconName>> = {
  'booking-confirmed': actionIcon.calendar,
  'booking-declined': actionIcon.calendar,
  'booking-cancelled-by-venue': actionIcon.calendar,
  'booking-reminder': 'notifications-outline',
  'order-ready': 'restaurant-outline',
  'review-hidden': actionIcon.star,
  // The venue answered: a speech bubble, the reply under the review.
  'review-replied': 'chatbubble-ellipses-outline',
  // Guest record: a no-show marked on a booking, and the pause on booking it can bring.
  'booking-no-show': actionIcon.calendar,
  'bookings-blocked-no-shows': 'ban-outline',
  'bookings-unblocked': actionIcon.calendar,
  // A takeaway order accepted, ready or declined (2026-10-22): the bag.
  'takeaway-accepted': actionIcon.takeaway,
  'takeaway-ready': actionIcon.takeaway,
  'takeaway-declined': actionIcon.takeaway,
  // A venue's message (2026-10-23): the speech bubble, as on the booking's card.
  'venue-message': actionIcon.message,
};

function kindIcon(notification: DinerNotification): IoniconName {
  const known = KIND_ICON[notification.kind];
  if (known) return known;
  // A kind this build does not know yet, about a place and nothing else.
  return notificationRoute(notification)?.pathname === '/place/[placeId]'
    ? actionIcon.location
    : 'notifications-outline';
}

/** `2026-9-17` on the phone's own calendar: when the diner read it, not where it happened. */
function localDay(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
}

/**
 * Today, Yesterday, Earlier — on the phone's calendar, since a notification
 * belongs to no one branch's clock. The feed is newest first, so the sections
 * come out in order and keep it.
 */
function byDay(items: readonly DinerNotification[], now: Date): DaySection[] {
  const today = localDay(now);
  const yesterday = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const sections: { day: Day; data: DinerNotification[] }[] = [];
  for (const item of items) {
    const at = new Date(item.createdAtUtc);
    const key = Number.isNaN(at.getTime()) ? '' : localDay(at);
    const day: Day = key === today ? 'today' : key === yesterday ? 'yesterday' : 'earlier';
    const last = sections[sections.length - 1];
    if (last?.day === day) last.data.push(item);
    else sections.push({ day, data: [item] });
  }
  return sections;
}

const DAY_TITLE: Readonly<Record<Day, string>> = {
  today: 'booking.today',
  yesterday: 'notifications.yesterday',
  earlier: 'notifications.earlier',
};

/**
 * Notifications — every booking update, ready order and hidden review the
 * server sent this account, newest first (K12), under Today, Yesterday and
 * Earlier.
 *
 * The feed is the record; a push is only a faster way of hearing about a row.
 * Tapping a row marks it read and opens what it is about. Pull to refresh;
 * older rows load as the list scrolls.
 */
export default function NotificationsScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const queryClient = useQueryClient();
  const signedIn = useSession((state) => state.signedIn);
  const feed = useNotificationFeed();
  const markRead = useMarkNotificationsRead();
  const [pulling, setPulling] = useState(false);
  const now = useNow(60_000);

  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);
  const sections = useMemo(() => byDay(items, now), [items, now]);
  // Each row's place in the whole feed, so the entrance staggers down the screen.
  const order = useMemo(
    () => new Map(items.map((item, index) => [item.notificationId, index])),
    [items],
  );
  const unreadCount = feed.data?.pages[0]?.unreadCount ?? 0;
  const offline = isOfflinePaused(feed) && !feed.data;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const openRow = (notification: DinerNotification) => {
    if (!notification.read) markRead.mutate({ ids: [notification.notificationId] });
    // The booking a row is about is read again on the way in: the row may
    // know what the cached copy does not (a declined change put it back).
    for (const queryKey of bookingKeysForRow(notification)) {
      void queryClient.invalidateQueries({ queryKey });
    }
    const route = notificationRoute(notification);
    if (route) router.push(route);
  };

  const newest = items[0];
  const header = (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        onPress={goBack}
        accessibilityLabel={t('floorPlan.back')}
        variant="ghost"
        style={styles.glass}
      />
      <Text display numberOfLines={1} style={styles.title} accessibilityRole="header">
        {t('notifications.title')}
      </Text>
      {signedIn && unreadCount > 0 && newest ? (
        <Button
          label={t('notifications.markAllRead')}
          variant="secondary"
          size="small"
          fullWidth={false}
          disabled={markRead.isPending}
          onPress={() => markRead.mutate({ upTo: newest.notificationId })}
        />
      ) : null}
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
            <View key={row} style={[styles.row, styles.rowRead]}>
              <Skeleton width={ICON_WELL} height={ICON_WELL} borderRadius={radius.pill} />
              <View style={[styles.rowBody, styles.skeletonBody]}>
                <Skeleton width="50%" height={14} />
                <Skeleton width="85%" height={12} />
              </View>
            </View>
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {header}
      <SectionList<DinerNotification, DaySection>
        sections={sections}
        keyExtractor={(item) => item.notificationId}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.day} accessibilityRole="header">
            {t(DAY_TITLE[section.day])}
          </Text>
        )}
        renderItem={({ item, section }) => (
          <Rise delay={riseDelay(order.get(item.notificationId) ?? 0)}>
            <NotificationRow
              notification={item}
              withDate={section.day === 'earlier'}
              onPress={openRow}
            />
          </Rise>
        )}
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
  withDate,
  onPress,
}: {
  readonly notification: DinerNotification;
  /** Under Earlier the day is not in the heading, so the row says it. */
  readonly withDate: boolean;
  readonly onPress: (notification: DinerNotification) => void;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const press = usePressScale();
  const copy = notificationCopy(notification);
  const when = useMemo(() => {
    const at = new Date(notification.createdAtUtc);
    return Number.isNaN(at.getTime())
      ? ''
      : new Intl.DateTimeFormat(intlTag(locale), {
          ...(withDate ? { day: 'numeric', month: 'short' } : {}),
          hour: '2-digit',
          minute: '2-digit',
        }).format(at);
  }, [notification.createdAtUtc, locale, withDate]);
  const title = t(copy.titleKey, copy.params);
  const body = t(copy.bodyKey, copy.params);
  const unread = !notification.read;
  // A venue's message stands out until read: the Push board's tinted card and
  // filled bubble, and what it is about beside its time.
  const message = isVenueMessageNotificationKind(notification.kind);
  const loud = message && unread;
  const about = message ? venueMessageFeedSubject(notification)?.kind : undefined;
  const meta = [
    when,
    about ? t(about === 'takeaway' ? 'messages.feed.takeaway' : 'messages.feed.booking') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        // The dot and the brighter card are the only unread signs on screen,
        // and the dot is hidden from a screen reader, so the label says it.
        accessibilityLabel={`${unread ? `${t('notifications.unread')}. ` : ''}${title}. ${body}. ${meta}`}
        onPress={() => onPress(notification)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.row,
          unread ? styles.rowUnread : styles.rowRead,
          loud && styles.rowMessage,
          pressed && styles.rowPressed,
        ]}
      >
        <View style={[styles.iconWell, loud && styles.iconWellMessage]}>
          <Ionicons
            name={kindIcon(notification)}
            size={iconSize.md}
            color={loud ? colors.onPrimary : colors.primary}
          />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={[styles.rowText, loud && styles.rowTextMessage]}>{body}</Text>
          {meta ? <Text style={styles.rowTime}>{meta}</Text> : null}
        </View>
        {unread ? (
          <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no" />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const DOT = 8;
const ICON_WELL = 40;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  glass: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  title: {
    ...typography.h3,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: displayWeight.semibold,
    color: colors.text,
    flex: 1,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xs,
    paddingBottom: space.xxl,
  },
  day: {
    ...typography.caption,
    fontSize: 12.5,
    color: colors.textMuted,
    paddingHorizontal: space.xs,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  // Read or not, a row is white with the hairline; the burgundy dot says unread.
  rowUnread: { backgroundColor: colors.surface, borderColor: colors.border },
  rowRead: { backgroundColor: colors.surface, borderColor: colors.border },
  rowMessage: { backgroundColor: colors.unreadTint, borderColor: colors.logoInk },
  rowPressed: { backgroundColor: colors.primarySoft },
  skeletonBody: { gap: space.sm, paddingTop: space.xs },
  iconWell: {
    width: ICON_WELL,
    height: ICON_WELL,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWellMessage: { backgroundColor: colors.brand, borderColor: colors.brand },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...typography.body, fontSize: 13.5, fontWeight: fontWeight.bold, color: colors.text },
  rowText: { ...typography.caption, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  rowTextMessage: { fontSize: 14, lineHeight: 20, color: colors.text },
  rowTime: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  dot: {
    width: DOT,
    height: DOT,
    marginTop: space.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  footer: { marginVertical: space.lg },
});
