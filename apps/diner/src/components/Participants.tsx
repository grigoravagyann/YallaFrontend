import { formatNameList, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space } from '@yalla/tokens';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { onTab, type RosterPerson } from '../tab/roster';

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
  const name = person.displayName?.trim() || (person.isYou ? t('tab.youName') : t('tab.guest'));

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial(name)}</Text>
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

export interface AvatarRowProps {
  readonly people: readonly RosterPerson[];
}

/** The first character as a person sees it, never half of a surrogate pair. */
function initial(name: string): string {
  return (Array.from(name)[0] ?? '').toLocaleUpperCase();
}

/** Past this the row stops being a glance; the rest fold into the "+n". */
const MAX_AVATARS = 5;

/**
 * Everyone on the tab as a row of overlapping initials.
 *
 * The tab screen leads with the bill, so the people become a glance rather
 * than a list: you in beige, everyone else on the neutral tint, anonymous
 * guests folded into a "+n". The full list with badges and host controls is
 * one tap away on the people screen.
 */
export function AvatarRow({ people }: AvatarRowProps) {
  const { t } = useTranslation('diner');
  const here = onTab(people);
  const named = here.filter((p) => p.displayName?.trim() || p.isYou).slice(0, MAX_AVATARS);
  const folded = here.length - named.length;

  // Decorative: the pressable around it already names everyone. Left in the
  // tree it announced as a bare "image" on TalkBack.
  return (
    <View
      style={styles.avatarRow}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {named.map((person, i) => {
        const name = person.displayName?.trim() || t('tab.youName');
        return (
          <View
            key={person.participantId}
            style={[
              styles.avatar,
              styles.avatarStacked,
              i > 0 && styles.avatarOverlap,
              person.isYou && styles.avatarYou,
            ]}
          >
            <Text style={styles.avatarText}>{initial(name)}</Text>
          </View>
        );
      })}
      {folded > 0 ? (
        <View
          style={[styles.avatar, styles.avatarStacked, named.length > 0 && styles.avatarOverlap]}
        >
          <Text style={styles.avatarText}>{`+${folded}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarStacked: { borderWidth: 2, borderColor: color.paper },
  avatarOverlap: { marginLeft: -space.sm },
  avatarYou: { backgroundColor: color.primary },
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
  waitingBadgeText: { color: color.warningInk },
  actions: { flexDirection: 'row', gap: space.sm },
});
