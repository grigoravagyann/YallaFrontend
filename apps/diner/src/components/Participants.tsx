import type { DinerTabView } from '@yalla/api';
import { formatNameList, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space } from '@yalla/tokens';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { onTab, roster, waitingToJoin, type RosterPerson } from '../tab/roster';

/**
 * "Aram, Nare and 1 guest" — the whole party in one line.
 *
 * Unnamed guests are counted rather than listed, because five rows reading
 * "Guest" tells you less than "+3 guests" does. They are never dropped: a
 * person at the table who does not appear anywhere is how a party of five ends
 * up arguing over a bill.
 */
export function useParticipantSummary(people: readonly RosterPerson[], locale: Locale): string {
  const { t } = useTranslation('diner');

  // You are never "+1 guest". Counting yourself among the anonymous is
  // technically correct and reads as though the app does not know you are here.
  const named: string[] = [];
  let unnamed = 0;
  for (const person of onTab(people)) {
    if (person.displayName) named.push(person.displayName);
    else if (person.isYou) named.push(t('tab.youName'));
    else unnamed += 1;
  }

  const parts = [...named];
  if (unnamed > 0) parts.push(t('tab.unnamedCount', { count: unnamed }));

  return formatNameList(parts, locale);
}

export interface ParticipantRowProps {
  readonly person: RosterPerson;
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
export function ParticipantRow({ person, children }: ParticipantRowProps) {
  const { t } = useTranslation('diner');
  const name = person.displayName || (person.isYou ? t('tab.youName') : t('tab.guest'));

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
          {person.isYou && person.displayName ? <Badge label={t('tab.you')} tone="you" /> : null}
          {person.role === 'host' ? <Badge label={t('tab.host')} tone="host" /> : null}
          {person.status === 'pendingApproval' ? (
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
  readonly view: Pick<DinerTabView, 'participants' | 'me'>;
}

/** The read-only list, as shown on the tab screen itself. */
export function ParticipantsList({ view }: ParticipantsListProps) {
  const { t } = useTranslation('diner');
  const people = roster(view);
  const active = onTab(people);
  const pending = waitingToJoin(people);

  return (
    <View style={styles.list}>
      {active.map((person) => (
        <ParticipantRow key={person.participantId} person={person} />
      ))}

      {pending.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>{t('people.pendingSection')}</Text>
          {pending.map((person) => (
            <ParticipantRow key={person.participantId} person={person} />
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
  youBadgeText: { color: color.primaryInk },
  hostBadge: { backgroundColor: color.greenTint },
  hostBadgeText: { color: color.foreground },
  waitingBadge: { backgroundColor: color.greenTint },
  waitingBadgeText: { color: color.warning },
  actions: { flexDirection: 'row', gap: space.sm },
});
