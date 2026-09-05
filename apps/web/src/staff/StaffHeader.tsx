import { connectionStateKey, isStale, type ConnectionState } from '@yalla/realtime';
import { useTranslation } from '@yalla/i18n';
import { DevRoleSwitcher } from '../auth/DevRoleSwitcher';

export interface StaffHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  readonly state: ConnectionState;
  /** Derived from the queue by the floor screen. Never counted here. */
  readonly pending: number;
  readonly conflicts: number;
  readonly syncing: boolean;
  readonly online: boolean;
  readonly onOpenConflicts: () => void;
  readonly onRefresh: () => void;
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
  state,
  pending,
  conflicts,
  syncing,
  online,
  onOpenConflicts,
  onRefresh,
}: StaffHeaderProps) {
  const { t } = useTranslation(['staff', 'common']);

  const stale = isStale(state);
  // `idle` means no socket has ever been opened. Saying "offline" for it would
  // be wrong; saying "live" would be worse.
  const notWired = state === 'idle';

  return (
    <header className="floor-head">
      <div className="floor-where">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="floor-status">
        <span
          className={`status-chip ${notWired ? 'status-unknown' : stale ? 'status-stale' : 'status-live'}`}
          title={notWired ? t('connection.notWiredHint') : undefined}
        >
          {notWired ? t('connection.notWired') : t(`common:${connectionStateKey(state)}`)}
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
          {t('connection.refresh')}
        </button>

        <DevRoleSwitcher variant="bar" />
      </div>
    </header>
  );
}
