import type { Photo } from '@yalla/api';
import { formatNameList, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fontWeight, radius, space, typography } from '../theme';
import { PhotoImage } from './PhotoImage';
import { hasPhotoSource } from './photoSource';
import { Text } from './Text';
import { avatarStack, initialOf, peopleLine, stackName } from '../tab/avatarStack';
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

/**
 * "Anna, Gor +1" — the names beside the stack of faces, and the same "+n".
 * The short form for the people card; the full sentence above stays the
 * card's accessible name.
 */
export function usePeopleLine(people: readonly RosterPerson[]): string {
  const { t } = useTranslation('diner');
  return peopleLine(people, {
    youName: t('tab.youName'),
    headCount: (count) => t('tab.peopleCount', { count }),
    namesMore: (names, more) => t('tab.namesMore', { names, more }),
  });
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
      <PersonAvatar name={name} photo={person.photo} size={ROW_AVATAR} tone="quiet" />

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
        {/* Under the name, not beside it: two buttons on the right of a 375pt
            row left the name two letters wide and pushed the badges under them. */}
        {children ? <View style={styles.actions}>{children}</View> : null}
      </View>
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

export interface PersonAvatarProps {
  /** Whose face: the initial drawn when there is no photo to show. */
  readonly name: string;
  readonly photo: Photo | null;
  readonly size: number;
  /** `you` in the brown, `other` on the warm neutral, `quiet` on the muted fill of a list row. */
  readonly tone: 'you' | 'other' | 'quiet';
  /** Ringed in the sheet colour, so overlapping faces read as cut out of each other. */
  readonly ringed?: boolean;
}

/**
 * One face: the person's profile photo, or their initial.
 *
 * The initial is the common case — a walk-in with no account has no photo —
 * and also what a photo that never arrives falls back to, rather than an
 * image glyph where a face should be. Decorative: the name always sits next
 * to it or in the label of what holds it.
 */
export function PersonAvatar({ name, photo, size, tone, ringed = false }: PersonAvatarProps) {
  const url = photo?.thumbnailUrl ?? null;
  // The link that failed rather than a flag, so a new photo gets its own try.
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = hasPhotoSource(url) && failed !== url;

  return (
    <View
      // Hidden on every platform: `aria-hidden` is what the web build reads.
      aria-hidden
      style={[
        styles.face,
        { width: size, height: size },
        tone === 'you' ? styles.faceYou : tone === 'other' ? styles.faceOther : styles.faceQuiet,
        ringed && styles.faceRinged,
      ]}
    >
      {showPhoto ? (
        <PhotoImage
          source={url}
          style={styles.facePhoto}
          // `null` is what a load that failed reports; the initial takes over.
          onLoad={(loaded) => {
            if (loaded === null) setFailed(url);
          }}
        />
      ) : (
        <Text
          style={[
            ringed ? styles.stackedText : styles.avatarText,
            tone === 'you' && styles.avatarTextYou,
          ]}
        >
          {initialOf(name)}
        </Text>
      )}
    </View>
  );
}

export interface AvatarRowProps {
  readonly people: readonly RosterPerson[];
}

/** One circle of the stack. */
const STACKED = 34;
/** The face beside a name in the full list. */
const ROW_AVATAR = 36;

/**
 * Everyone on the tab as a stack of overlapping faces.
 *
 * The tab screen leads with the bill, so the people become a glance rather
 * than a list: a profile photo where somebody signed in with one, otherwise
 * their initial — you in the brown, everyone else on the warm neutral — and
 * the rest folded into a "+n". Each circle is ringed in the sheet colour, so
 * the overlap reads as one cut out of the next. The full list with badges and
 * host controls is one tap away on the people screen.
 */
export function AvatarRow({ people }: AvatarRowProps) {
  const { t } = useTranslation('diner');
  const { shown, folded } = avatarStack(people);

  // Decorative: the pressable around it already names everyone. Left in the
  // tree it announced as a bare "image" on TalkBack.
  return (
    <View style={styles.avatarRow} aria-hidden>
      {shown.map((person, i) => (
        <View key={person.participantId} style={i > 0 ? styles.stackedOverlap : null}>
          <PersonAvatar
            name={stackName(person, t('tab.youName'))}
            photo={person.photo}
            size={STACKED}
            tone={person.isYou ? 'you' : 'other'}
            ringed
          />
        </View>
      ))}
      {folded > 0 ? (
        <View
          style={[
            styles.face,
            styles.faceRinged,
            styles.folded,
            shown.length > 0 && styles.stackedOverlap,
          ]}
        >
          <Text style={styles.foldedText}>{`+${folded}`}</Text>
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
  face: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  faceYou: { backgroundColor: colors.brand },
  faceOther: { backgroundColor: colors.secondary },
  faceQuiet: { backgroundColor: colors.surfaceMuted },
  // The ring is the sheet colour, so overlapping circles read as cut out.
  faceRinged: { borderWidth: 2, borderColor: colors.sheet },
  facePhoto: { ...StyleSheet.absoluteFill, borderRadius: radius.pill },
  avatarText: { ...typography.buttonMedium, color: colors.text },
  avatarTextYou: { color: colors.onPrimary },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  stackedOverlap: { marginLeft: -10 },
  stackedText: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  folded: { width: STACKED, height: STACKED, backgroundColor: colors.surfaceMuted },
  foldedText: { ...typography.caption, fontWeight: fontWeight.medium, color: colors.text },
  who: { flex: 1, gap: space.xs },
  name: { ...typography.bodyLg, fontWeight: fontWeight.medium, color: colors.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  badge: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill },
  badgeText: { ...typography.caption, fontWeight: fontWeight.medium },
  youBadge: { backgroundColor: colors.primarySoft },
  youBadgeText: { color: colors.primary },
  hostBadge: { backgroundColor: colors.surfaceMuted },
  hostBadgeText: { color: colors.text },
  waitingBadge: { backgroundColor: colors.warningSoft },
  waitingBadgeText: { color: colors.warningInk },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
});
