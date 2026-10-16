import { connectionStateKey, isStale, type ConnectionState } from '@yalla/realtime';
import { useTranslation } from '@yalla/i18n';
import { DevRoleSwitcher } from '../auth/DevRoleSwitcher';
import { staffSession } from './auth/staffSession';

export interface StaffHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  /** Whose session is open. Empty on the mock, which has no sign-in. */
  readonly who: string;
  readonly state: ConnectionState;
  /** Derived from the queue by the floor screen. Never counted here. */
  readonly pending: number;
  readonly conflicts: number;
  readonly syncing: boolean;
  readonly online: boolean;
  readonly onOpenConflicts: () => void;
  readonly onRefresh: () => void;
  /** What the refresh button refreshes. The floor, unless the screen says otherwise. */
  readonly refreshLabel?: string | undefined;
}

/**
 * Where you are, whether the screen can be trusted, and what has not landed.
 *
 * Three separate truths, deliberately not merged into one traffic light:
 *
 * - **Connection** — whether what is on screen is current.
 * - **Queue** — whether what this tablet did has reached the server.
 * - **Conflicts** — whether anything needs a person to decide.
 *
 * They fail independently. A tablet can be online with three actions stuck, or
 * offline with nothing pending, and collapsing that into one green dot is how a
 * waiter ends up trusting a screen that has quietly stopped agreeing with the
 * kitchen.
 *
 * Both counts arrive as props from the floor screen, which derives them from
 * the command queue. The header does not read the queue itself: two readers is
 * two answers, and the wrong one is always the one on screen.
 */
export function StaffHeader({
  title,
  subtitle,
  who,
  state,
  pending,
  conflicts,
  syncing,
  online,
  onOpenConflicts,
  onRefresh,
  refreshLabel,
}: StaffHeaderProps) {
  const { t } = useTranslation(['staff', 'common']);

  const stale = isStale(state);

  return (
    <header className="floor-head">
      <div className="floor-where">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="floor-status">
        {/* "Live" while the polls are answered, "Reconnecting…" the moment one
            is not. The hint says how live is achieved, for anybody who wants
            to know; the chip itself only ever says what is true right now. */}
        <span
          className={`status-chip ${stale ? 'status-stale' : 'status-live'}`}
          title={t('connection.pollingHint')}
        >
          {t(`common:${connectionStateKey(state)}`)}
        </span>

        {/* Connection and count are shown together, never one instead of the
            other. "Offline" alone leaves a waiter unable to tell whether three
            actions are waiting on this tablet or none are, which is exactly the
            question offline makes urgent. */}
        <span
          className={`status-chip ${
            !online ? 'status-stale' : pending > 0 ? 'status-pending' : 'status-live'
          }`}
        >
          {!online
            ? pending > 0
              ? `${t('queue.offline')} · ${t('queue.pending', { count: pending })}`
              : t('queue.offline')
            : syncing
              ? t('queue.syncing')
              : pending > 0
                ? t('queue.pending', { count: pending })
                : t('queue.synced')}
        </span>

        {/* Shown until it is zero. A conflict that stops being visible is a
            decision nobody made. */}
        {conflicts > 0 ? (
          <button type="button" className="status-chip status-conflict" onClick={onOpenConflicts}>
            {t('queue.conflicts', { count: conflicts })}
          </button>
        ) : null}

        <button type="button" className="floor-button" onClick={onRefresh}>
          {refreshLabel ?? t('connection.refresh')}
        </button>

        {/* Whose session is open, and the way to hand the tablet over. One
            control, because "sign out" on this screen means exactly that: the
            device stays enrolled and the next person taps four digits. */}
        {who ? (
          <button
            type="button"
            className="status-chip status-who"
            onClick={() => void staffSession?.signOut()}
            title={t('session.handOverHint')}
          >
            {t('session.signedInAs', { name: who })}
          </button>
        ) : null}

        <DevRoleSwitcher variant="bar" />
      </div>
    </header>
  );
}
