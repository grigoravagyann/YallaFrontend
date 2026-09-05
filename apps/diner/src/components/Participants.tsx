import type { TabParticipant, TableTab } from '@yalla/api';
import { formatNameList, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space } from '@yalla/tokens';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';

/** Only these two are on the tab in any meaningful sense. */
export function onTab(participants: readonly TabParticipant[]): readonly TabParticipant[] {
  return participants.filter((p) => p.status === 'active');
}

export function waitingToJoin(participants: readonly TabParticipant[]): readonly TabParticipant[] {
  return participants.filter((p) => p.status === 'pending');
}

/**
 * "Aram, Nare and 1 guest" — the whole party in one line.
 *
 * Unnamed guests are counted rather than listed, because five rows reading
 * "Guest" tells you less than "+3 guests" does. They are never dropped: a
 * person at the table who does not appear anywhere is how a party of five ends
 * up arguing over a bill.
 */
export function useParticipantSummary(
  participants: readonly TabParticipant[],
  locale: Locale,
): string {
  const { t } = useTranslation('diner');

  const active = onTab(participants);

  // You are never "+1 guest". Counting yourself among the anonymous is
  // technically correct and reads as though the app does not know you are here.
  const named: string[] = [];
  let unnamed = 0;
  for (const person of active) {
    if (person.displayName) named.push(person.displayName);
    else if (person.isYou) named.push(t('tab.youName'));
    else unnamed += 1;
  }

  const parts = [...named];
  if (unnamed > 0) parts.push(t('tab.unnamedCount', { count: unnamed }));

  return formatNameList(parts, locale);
}

export interface ParticipantRowProps {
  readonly participant: TabParticipant;
  /** Host controls render their buttons here; the read-only list passes none. */
  readonly children?: React.ReactNode;
}

/**
 * One person on the tab.
 *
 * Everyone sees the same rows, host and guest alike. Who is on your tab is not
 * privileged information — it is the single most useful thing on the screen
 * when a sixth person sits down and nobody is sure whether they scanned.
 */
export function ParticipantRow({ participant, children }: ParticipantRowProps) {
  const { t } = useTranslation('diner');
  const name = participant.displayName ?? (participant.isYou ? t('tab.youName') : t('tab.guest'));

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{name.slice(0, 1).toLocaleUpperCase()}</Text>
      </View>

      <View style={styles.who}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.badges}>
          {participant.isYou && participant.displayName ? (
            <Badge label={t('tab.you')} tone="you" />
          ) : null}
          {participant.role === 'host' ? <Badge label={t('tab.host')} tone="host" /> : null}
          {participant.status === 'pending' ? (
            <Badge label={t('tab.waiting')} tone="waiting" />
          ) : null}
        </View>
      </View>

      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: 'you' | 'host' | 'waiting' }) {
  return (
    <View style={[styles.badge, styles[`${tone}Badge`]]}>
      <Text style={[styles.badgeText, styles[`${tone}BadgeText`]]}>{label}</Text>
    </View>
  );
}

export interface ParticipantsListProps {
  readonly tab: TableTab;
}

/** The read-only list, as shown on the tab screen itself. */
export function ParticipantsList({ tab }: ParticipantsListProps) {
  const { t } = useTranslation('diner');
  const active = onTab(tab.participants);
  const pending = waitingToJoin(tab.participants);

  return (
    <View style={styles.list}>
      {active.map((participant) => (
        <ParticipantRow key={participant.id} participant={participant} />
      ))}

      {pending.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>{t('people.pendingSection')}</Text>
          {pending.map((participant) => (
            <ParticipantRow key={participant.id} participant={participant} />
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xs },
  sectionLabel: {
    marginTop: space.sm,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: color.mutedForeground,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.greenTint,
  },
  avatarText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.foreground },
  who: { flex: 1, gap: space.xs },
  name: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: fontWeight.medium,
    color: color.foreground,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  badge: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill },
  badgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  youBadge: { backgroundColor: color.greenTint },
  youBadgeText: { color: color.primaryPressed },
  hostBadge: { backgroundColor: color.greenTint },
  hostBadgeText: { color: color.foreground },
  waitingBadge: { backgroundColor: color.greenTint },
  waitingBadgeText: { color: color.warning },
  actions: { flexDirection: 'row', gap: space.sm },
});
