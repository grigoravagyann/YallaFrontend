import { useTranslation } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApproveJoin, useRejectJoin } from '../../data/queries';
import { newCommandId } from '../../lib/commandId';
import { haptics } from '../../lib/haptics';
import { tabAccessCopy } from '../../tab/access';
import {
  joinBanner,
  joinLine,
  joinTitle,
  joinToast,
  newlyWaiting,
  stillAnswered,
  waitingIds,
  type JoinAnswer,
  type JoinCopy,
} from '../../tab/joinRequests';
import type { RosterPerson } from '../../tab/roster';
import {
  actionIcon,
  colors,
  fontWeight,
  radius,
  space,
  typography,
  type IoniconName,
} from '../../theme';
import { Button } from '../Button';
import { Card } from '../Card';
import { Rise, riseDelay } from '../motion/Rise';
import { useToast } from '../motion/Toast';
import { PersonAvatar } from '../Participants';
import { Text } from '../Text';

export interface JoinRequestBannerProps {
  readonly tabId: string;
  /** The tab read's roster. The banner is only ever handed one the host is reading. */
  readonly people: readonly RosterPerson[];
}

/** Which press is still on its way to the server. */
type Working = 'approve' | 'reject' | null;

/** Faces drawn before the rest fold into "+n". */
const MAX_FACES = 2;
const FACE = 40;

/**
 * Somebody at the table asking to be let on, at the top of the host's bill.
 *
 * One person: their name and the two answers the People screen gives, Approve
 * and Not with us. Several: how many, who, Approve all, and See who for the
 * People screen, where each can be answered on their own.
 *
 * Mounted whenever the host is on the tab, waiting or not, because it keeps
 * two things across polls: who was already waiting at the last look, so the
 * phone taps once for each new person and never for the same one twice, and
 * who the host has just answered, so they leave the banner the moment the
 * server says yes rather than when the refetch lands.
 */
export function JoinRequestBanner({ tabId, people }: JoinRequestBannerProps) {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const approve = useApproveJoin();
  const reject = useRejectJoin();
  const showToast = useToast((state) => state.show);

  const [working, setWorking] = useState<Working>(null);

  const waiting = waitingIds(people);
  // A stable key, so a poll that brings back the same people changes nothing.
  const waitingKey = [...waiting].sort().join(' ');

  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const [answeredAt, setAnsweredAt] = useState(waitingKey);
  // A read that moved the roster has caught up with whatever it shows answered:
  // forget those, so a person who asks again later is shown again. Adjusted
  // while rendering, so the banner never draws one frame from the stale set.
  if (answeredAt !== waitingKey) {
    setAnsweredAt(waitingKey);
    setAnswered((previous) => stillAnswered(previous, waiting));
  }

  /** Who was waiting at the last look; `null` before the first. */
  const seen = useRef<ReadonlySet<string> | null>(null);
  /** Who the last read had waiting, for an answer that lands after a refetch. */
  const latest = useRef<ReadonlySet<string>>(waiting);

  useEffect(() => {
    const current = new Set(waitingKey ? waitingKey.split(' ') : []);
    if (newlyWaiting(seen.current, current).length > 0) haptics.tap();
    seen.current = current;
    latest.current = current;
  }, [waitingKey]);

  const say = (copy: JoinCopy, icon?: IoniconName) =>
    showToast(t(copy.key, { ...copy.params }), icon);

  /**
   * One host action per person, one after another: each carries its own
   * command id, so a retry never answers somebody twice, and the server takes
   * them in turn rather than racing them on one tab.
   */
  const answer = async (kind: JoinAnswer, who: readonly RosterPerson[]) => {
    const mutation = kind === 'approved' ? approve : reject;
    const done: RosterPerson[] = [];
    setWorking(kind === 'approved' ? 'approve' : 'reject');
    try {
      for (const person of who) {
        await mutation.mutateAsync({
          tabId,
          participantId: person.participantId,
          commandId: newCommandId(),
        });
        done.push(person);
      }
      say(joinToast(kind, done), kind === 'approved' ? undefined : actionIcon.close);
    } catch (caught) {
      // Nothing is assumed: whoever the server did not answer stays waiting.
      say({ key: tabAccessCopy(caught)?.body ?? 'people.failed' }, actionIcon.error);
    } finally {
      if (done.length > 0) {
        setAnswered((previous) =>
          stillAnswered(
            new Set([...previous, ...done.map((person) => person.participantId)]),
            latest.current,
          ),
        );
      }
      setWorking(null);
    }
  };

  const banner = joinBanner(people, answered);
  if (!banner) return null;

  const title = joinTitle(banner);
  const line = joinLine(banner, {
    namesMore: (names, more) => t('tab.namesMore', { names, more }),
    waitingOne: t('tab.joinRequest.waitingOne'),
    waitingSeveral: t('tab.joinRequest.waitingSeveral'),
  });
  const everyone = banner.kind === 'one' ? [banner.person] : banner.people;
  const busy = working !== null;

  return (
    <Rise delay={riseDelay(1)}>
      <Card radiusToken="hero" style={styles.card}>
        <View style={styles.top}>
          <Faces people={everyone} guest={t('tab.guest')} />
          {/* One announcement for the two lines, said when it appears. */}
          <View style={styles.text} accessible role="status" accessibilityLiveRegion="polite">
            <Text style={styles.title} numberOfLines={2}>
              {t(title.key, { ...title.params })}
            </Text>
            <Text style={styles.line} numberOfLines={1}>
              {line}
            </Text>
          </View>
        </View>

        {banner.kind === 'one' ? (
          <View style={styles.actions}>
            <Button
              label={t('people.approve')}
              busy={working === 'approve'}
              disabled={busy}
              onPress={() => void answer('approved', [banner.person])}
              style={styles.action}
            />
            <Button
              label={t('people.reject')}
              variant="secondary"
              busy={working === 'reject'}
              disabled={busy}
              onPress={() => void answer('rejected', [banner.person])}
              style={styles.action}
            />
          </View>
        ) : (
          // Stacked, not halves: "Approve all" outgrows half a 375pt card in
          // Armenian and Russian, and See who is the quieter way on.
          <View style={styles.stacked}>
            <Button
              label={t('tab.joinRequest.approveAll')}
              busy={working === 'approve'}
              disabled={busy}
              onPress={() => void answer('approved', banner.people)}
            />
            <Button
              label={t('tab.joinRequest.seeWho')}
              variant="text"
              disabled={busy}
              onPress={() => router.push({ pathname: '/tab/[tabId]/people', params: { tabId } })}
            />
          </View>
        )}
      </Card>
    </Rise>
  );
}

/**
 * Whose request it is, as faces: one, or the first two and a "+n". Decorative:
 * the status line beside it says the same in words.
 */
function Faces({ people, guest }: { people: readonly RosterPerson[]; guest: string }) {
  const shown = people.slice(0, MAX_FACES);
  const folded = people.length - shown.length;
  return (
    <View style={styles.faces} aria-hidden>
      {shown.map((person, index) => (
        <View key={person.participantId} style={index > 0 ? styles.overlap : null}>
          <PersonAvatar
            name={person.displayName?.trim() || guest}
            photo={person.photo}
            size={FACE}
            tone="other"
            ringed={people.length > 1}
          />
        </View>
      ))}
      {folded > 0 ? (
        <View style={[styles.folded, styles.overlap]}>
          <Text style={styles.foldedText}>{`+${folded}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Edged in the brand's rim so it reads as something to answer, not one more
  // card of information.
  card: { gap: space.md, borderWidth: 1, borderColor: colors.brandEdge },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, minWidth: 0, gap: space.xs / 2 },
  title: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text },
  line: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: space.sm },
  // Equal halves, with room for the longer Armenian and Russian labels.
  action: { flex: 1, paddingHorizontal: space.md },
  stacked: { gap: space.xs },
  faces: { flexDirection: 'row', alignItems: 'center' },
  overlap: { marginLeft: -12 },
  folded: {
    width: FACE,
    height: FACE,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.sheet,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foldedText: { ...typography.caption, fontWeight: fontWeight.bold, color: colors.text },
});
