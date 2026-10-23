import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { isStale, type ConnectionState } from '@yalla/realtime';
import type { TFunction } from 'i18next';
import { DevRoleSwitcher } from '../auth/DevRoleSwitcher';
import { staffSession } from './auth/staffSession';
import { useBranchFormat } from './useBranchFormat';
import { useMinuteClock } from './useMinuteClock';
import { Wordmark } from '../components/Wordmark';

/** The screens the tablet shows: the floor, the kitchen, the takeaway counter and the messages. */
export type StaffView = 'floor' | 'kitchen' | 'takeaway' | 'messages';

export interface StaffHeaderProps {
  /** The screen's name: the page's heading, for a screen reader; the tab says it on screen. */
  readonly title: string;
  /** "Lumen · Lumen North" — or the branch alone where the venue is not known. */
  readonly place: string;
  readonly timeZoneId: string;
  /** Whose session is open. Empty on the mock, which has no sign-in. */
  readonly who: string;
  readonly state: ConnectionState;
  /** When the screen's live read last answered, epoch ms. Null before it ever has. */
  readonly updatedAt: number | null;
  /** Derived from the queue by the screen. Never counted here. */
  readonly pending: number;
  readonly conflicts: number;
  readonly online: boolean;
  readonly onOpenConflicts: () => void;
  /** Tapping the connection chip refreshes the screen's live read. */
  readonly onRefresh: () => void;
  /** What that refreshes. The floor, unless the screen says otherwise. */
  readonly refreshLabel?: string | undefined;
  readonly view: StaffView;
  /** Orders new or in the kitchen: the count on the Kitchen tab. */
  readonly kitchenWaiting: number;
  /**
   * Bookings to answer and calls to go to: the count on the Floor tab while
   * the kitchen shows, so a request with a clock on it is never out of sight.
   */
  readonly floorWaiting?: number | undefined;
  /**
   * The takeaway counter (2026-10-22): its tab, with the orders waiting for an
   * answer and the ones waiting at the counter counted on it. Left out where
   * the branch has no takeaway today, and then there is no tab.
   */
  readonly takeawayWaiting?: number | undefined;
  /**
   * Guest messages (2026-10-23): the Messages tab, with the guest messages
   * nobody here has read counted on it. Left out on the kitchen's own
   * screen, which has no tab for them.
   */
  readonly messagesWaiting?: number | undefined;
  /**
   * Switches the screen. Left out where the floor cannot be opened at all — a
   * kitchen account, which the server refuses the floor — and then the bar
   * offers the kitchen alone.
   */
  readonly onSelectView?: ((view: StaffView) => void) | undefined;
  /** Hands the tablet over. Signing out by default: the PIN gate comes up over the screen. */
  readonly onSwitchPerson?: (() => void) | undefined;
}

/**
 * The one top bar every staff screen wears (floor-tablet HANDOFF §2).
 *
 * Where the tablet is, which screen it shows, whether that screen can be
 * trusted, what needs a person to decide, and who is signed in — in that
 * order, left to right, on the dark bar.
 *
 * Connection and queue are one chip but two truths, never one instead of the
 * other: "Offline" alone leaves a waiter unable to tell whether three actions
 * are waiting on this tablet or none are, which is exactly the question
 * offline makes urgent. So the chip says the state and, whenever anything is
 * waiting, the count — and tapping it refreshes.
 *
 * Conflicts are their own chip and are shown until there are none. A conflict
 * that stops being visible is a decision nobody made.
 *
 * Both counts arrive as props from the screen, which derives them from the
 * command queue. The header does not read the queue itself: two readers is two
 * answers, and the wrong one is always the one on screen.
 */
export function StaffHeader({
  title,
  place,
  timeZoneId,
  who,
  state,
  updatedAt,
  pending,
  conflicts,
  online,
  onOpenConflicts,
  onRefresh,
  refreshLabel,
  view,
  kitchenWaiting,
  floorWaiting = 0,
  takeawayWaiting,
  messagesWaiting,
  onSelectView,
  onSwitchPerson,
}: StaffHeaderProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { locale } = useLocale();
  const format = useBranchFormat(timeZoneId);
  // The clock in the corner, and how old the data is, both move by the minute.
  const now = useMinuteClock();

  const day = new Intl.DateTimeFormat(intlTag(locale), {
    weekday: 'long',
    timeZone: timeZoneId,
  }).format(now);
  const today = `${day.charAt(0).toLocaleUpperCase(locale)}${day.slice(1)}, ${format.time(now)}`;

  const chip = connectionChip({
    state,
    online,
    pending,
    updatedAt,
    now: now.getTime(),
    t,
    time: format.time,
  });

  const kitchenName =
    kitchenWaiting > 0
      ? `${t('kitchen.title')}, ${t('views.kitchenWaiting', { count: kitchenWaiting })}`
      : t('kitchen.title');
  // Counted only while the floor is not on screen: on the floor, the rail says it.
  const floorCount = view === 'floor' ? 0 : floorWaiting;
  const floorName =
    floorCount > 0
      ? `${t('floor.title')}, ${t('views.floorWaiting', { count: floorCount })}`
      : t('floor.title');

  const takeawayCount = takeawayWaiting ?? 0;
  const takeawayName =
    takeawayCount > 0
      ? `${t('takeaway.title')}, ${t('views.takeawayWaiting', { count: takeawayCount })}`
      : t('takeaway.title');

  const messagesCount = messagesWaiting ?? 0;
  const messagesName =
    messagesCount > 0
      ? `${t('messages.title')}, ${t('views.messagesWaiting', { count: messagesCount })}`
      : t('messages.title');

  const initials = who
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase(locale))
    .join('');
  const firstName = who.split(/\s+/u)[0] ?? who;

  return (
    <header className="ft-top">
      <h1 className="visually-hidden">{title}</h1>
      <span className="ft-brand">
        <Wordmark />
      </span>
      <div className="ft-where">
        <b>{place}</b>
        <span>{today}</span>
      </div>

      <nav className="ft-views" aria-label={t('views.label')}>
        {onSelectView ? (
          <>
            <button
              type="button"
              aria-current={view === 'floor' ? 'page' : undefined}
              aria-label={floorName}
              onClick={() => onSelectView('floor')}
            >
              {t('floor.title')}
              {floorCount > 0 ? (
                <span className="ft-views-count" aria-hidden="true">
                  {floorCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              aria-current={view === 'kitchen' ? 'page' : undefined}
              aria-label={kitchenName}
              onClick={() => onSelectView('kitchen')}
            >
              {t('kitchen.title')}
              {kitchenWaiting > 0 ? (
                <span className="ft-views-count" aria-hidden="true">
                  {kitchenWaiting}
                </span>
              ) : null}
            </button>
            {takeawayWaiting !== undefined ? (
              <button
                type="button"
                aria-current={view === 'takeaway' ? 'page' : undefined}
                aria-label={takeawayName}
                onClick={() => onSelectView('takeaway')}
              >
                {t('takeaway.title')}
                {takeawayCount > 0 ? (
                  <span className="ft-views-count" aria-hidden="true">
                    {takeawayCount}
                  </span>
                ) : null}
              </button>
            ) : null}
            {messagesWaiting !== undefined ? (
              <button
                type="button"
                aria-current={view === 'messages' ? 'page' : undefined}
                aria-label={messagesName}
                onClick={() => onSelectView('messages')}
              >
                {t('messages.title')}
                {messagesCount > 0 ? (
                  <span className="ft-views-count is-messages" aria-hidden="true">
                    {messagesCount}
                  </span>
                ) : null}
              </button>
            ) : null}
          </>
        ) : (
          // The one screen this account has: said, not offered.
          <span className="ft-views-only" aria-current="page">
            {t('kitchen.title')}
            {kitchenWaiting > 0 ? (
              <span className="ft-views-count" aria-hidden="true">
                {kitchenWaiting}
              </span>
            ) : null}
          </span>
        )}
      </nav>

      <span className="ft-top-gap" />

      {/* Says what is true right now; the hint says how live is achieved, for
          anybody who wants to know. */}
      <button
        type="button"
        className={`ft-chip ft-chip-${chip.tone}`}
        aria-label={t('connection.chip.name', {
          chip: chip.text,
          action: refreshLabel ?? t('connection.refresh'),
        })}
        title={t('connection.pollingHint')}
        onClick={onRefresh}
      >
        <i aria-hidden="true" />
        {chip.text}
      </button>

      {conflicts > 0 ? (
        <button type="button" className="ft-chip ft-chip-failure" onClick={onOpenConflicts}>
          <i aria-hidden="true" />
          {t('queue.conflicts', { count: conflicts })}
        </button>
      ) : null}

      {/* Whose session is open, and the way to hand the tablet over. One
          control, because "sign out" on this screen means exactly that: the
          device stays enrolled and the next person taps four digits. */}
      {who ? (
        <button
          type="button"
          className="ft-who"
          aria-label={t('session.switchPerson', { name: who })}
          onClick={onSwitchPerson ?? (() => void staffSession?.signOut())}
        >
          <span className="ft-avatar" aria-hidden="true">
            {initials}
          </span>
          <span aria-hidden="true">{firstName}</span>
          <svg
            className="ft-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      ) : null}

      <DevRoleSwitcher variant="bar" />
    </header>
  );
}

type ChipTone = 'live' | 'waiting' | 'offline' | 'failure';

/**
 * The connection chip's words and tone.
 *
 * - **Live**: the polls are answered — with the time of the last answer, or
 *   the count still to sync when there is one.
 * - **Offline**: the browser has no network. Amber, never red: the work is
 *   kept on the tablet, and the count says how much.
 * - **Reconnecting**: the network is there and the polls fail. The one real
 *   failure, so the one red; once the data is minutes old, it says how old.
 */
function connectionChip({
  state,
  online,
  pending,
  updatedAt,
  now,
  t,
  time,
}: {
  readonly state: ConnectionState;
  readonly online: boolean;
  readonly pending: number;
  readonly updatedAt: number | null;
  readonly now: number;
  readonly t: TFunction;
  readonly time: (value: number) => string;
}): { readonly text: string; readonly tone: ChipTone } {
  if (!online) {
    return {
      tone: 'offline',
      text:
        pending > 0
          ? t('connection.chip.offlinePending', { count: pending })
          : t('connection.chip.offline'),
    };
  }
  if (state === 'connected') {
    return {
      tone: 'live',
      text:
        pending > 0
          ? t('connection.chip.livePending', { count: pending })
          : t('connection.chip.live', { time: time(updatedAt ?? now) }),
    };
  }
  // The count rides along whatever the connection says: three actions stuck
  // behind a server that does not answer are the thing a waiter needs to know.
  const withPending = (text: string) =>
    pending > 0 ? t('connection.chip.waiting', { state: text, count: pending }) : text;
  if (isStale(state)) {
    const minutes = updatedAt === null ? 0 : Math.floor((now - updatedAt) / 60_000);
    return {
      tone: 'failure',
      text: withPending(
        minutes >= 1
          ? t('connection.chip.stale', { count: minutes })
          : t('common:connection.reconnecting'),
      ),
    };
  }
  return { tone: 'waiting', text: withPending(t('common:connection.connecting')) };
}
