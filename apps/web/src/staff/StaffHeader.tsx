import { connectionStateKey, isStale, type ConnectionState } from '@yalla/realtime';
import { useTranslation } from '@yalla/i18n';
import { DevRoleSwitcher } from '../auth/DevRoleSwitcher';
import { useQueueStatus } from '../offline/useQueueStatus';

export interface StaffHeaderProps {
  readonly title: string;
  readonly subtitle: string;
  readonly state: ConnectionState;
  readonly onRefresh: () => void;
}

/**
 * The floor screen header: where you are, whether the screen can be trusted,
 * and what is still waiting to reach the server.
 *
 * Two separate truths, deliberately not merged into one traffic light:
 *
 * - **Connection** — whether what is on screen is current.
 * - **Queue** — whether what this tablet did has reached the server.
 *
 * They fail independently. A tablet can be online with three actions stuck, or
 * offline with nothing pending, and collapsing that into one green dot is how a
 * waiter ends up trusting a screen that has quietly stopped agreeing with the
 * kitchen.
 */
export function StaffHeader({ title, subtitle, state, onRefresh }: StaffHeaderProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { pendingCount, isSyncing, online } = useQueueStatus();

  const stale = isStale(state);
  // `idle` means no socket has ever been opened, which is today's truth. Saying
  // "offline" for it would be wrong; saying "live" would be worse.
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

        <span
          className={`status-chip ${
            !online ? 'status-stale' : pendingCount > 0 ? 'status-pending' : 'status-live'
          }`}
        >
          {!online
            ? t('queue.offline')
            : isSyncing
              ? t('queue.syncing')
              : pendingCount > 0
                ? t('queue.pending', { count: pendingCount })
                : t('queue.synced')}
        </span>

        <button type="button" className="floor-button" onClick={onRefresh}>
          {t('connection.refresh')}
        </button>

        <DevRoleSwitcher variant="bar" />
      </div>
    </header>
  );
}
