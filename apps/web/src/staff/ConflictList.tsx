import { useTranslation } from '@yalla/i18n';
import type { ConflictEntry } from './commands/types';
import { useBranchFormat } from './useBranchFormat';

/**
 * The conflict list.
 *
 * A real screen, not a toast. Every entry here is a thing a waiter did that the
 * system could not apply, and the only two ways out are a person choosing to
 * discard it or a person choosing to apply it anyway. Nothing resolves
 * automatically in either direction, and nothing expires: a conflict that
 * disappears on its own is a decision nobody made about somebody's dinner.
 *
 * ## State first, then what happened to your action
 *
 * Each entry is two lines, in that order, and the order is the point. The
 * earlier version led with history — *"you seated a walk-in at table 5 at
 * 00:02"* — and buried the fact that decides what to do next four lines down.
 * A waiter reading this is standing up, mid-service, and will stop after the
 * first line; so the first line is the state of the table, in bold, with the
 * detail that qualifies it. Their own action is the second line, because by
 * then they have already decided.
 *
 * The two refusals are worded differently on purpose:
 *
 * - **The state changed.** Somebody seated the party you were about to hold it
 *   for. Visible on the floor behind this screen, and usually obvious.
 * - **The table changed and changed back.** It reads free and it is not the
 *   same free: a whole other party has been seated, served and has left since
 *   the tap. Nothing on any screen shows this. It is the reason the row version
 *   is sent at all, and saying only "the table changed" would waste it.
 */

export interface ConflictListProps {
  readonly conflicts: readonly ConflictEntry[];
  readonly timeZoneId: string;
  readonly onDiscard: (id: string) => void;
  readonly onApplyAnyway: (id: string) => void;
  readonly onClose: () => void;
}

export function ConflictList({
  conflicts,
  timeZoneId,
  onDiscard,
  onApplyAnyway,
  onClose,
}: ConflictListProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);

  return (
    <div className="staff-overlay" role="dialog" aria-label={t('conflicts.title')}>
      <header className="staff-overlay-head">
        <div>
          <h1>{t('conflicts.title')}</h1>
          <p>{t('conflicts.subtitle')}</p>
        </div>
        <button type="button" className="button big" onClick={onClose}>
          {t('common:action.close')}
        </button>
      </header>

      <div className="staff-overlay-body">
        {conflicts.length === 0 ? (
          <p className="floor-todo">{t('conflicts.empty')}</p>
        ) : (
          <ul className="conflict-list">
            {conflicts.map((entry) => {
              const { command, observed } = entry;
              const label = observed?.tableLabel || command.subject.tableLabel || '—';
              const changedBack = observed?.failure === 'tableChangedAndChangedBack';

              /**
               * The line that carries the decision.
               *
               * Written to be readable on its own, because it is the only line
               * some people will read. "Table 5 is occupied — open tab, seated
               * by Aram" answers what to do next; "there was a conflict" does
               * not.
               */
              const head = changedBack
                ? t('conflicts.head.changedBack', {
                    label,
                    state: t(`conflicts.status.${observed?.currentStatus ?? 'free'}`),
                  })
                : observed
                  ? t('conflicts.head.state', {
                      label,
                      state: t(`conflicts.status.${observed.currentStatus}`),
                    })
                  : t('conflicts.head.unknown', { label });

              return (
                <li key={command.id} className="conflict-card">
                  <p className="conflict-state">
                    <strong>{head}</strong>
                    {observed?.changedBy ? (
                      <span className="conflict-by">
                        {t('conflicts.by', { name: observed.changedBy })}
                      </span>
                    ) : null}
                  </p>

                  {/* Their own action, second, and in one sentence. The old
                      fourth line — "somebody else changed the table first" —
                      is gone: it repeated the line above it. */}
                  <p className="conflict-what">
                    {t('conflicts.notApplied', {
                      action: t(`conflicts.action.${command.kind}`, {
                        count: command.subject.itemCount ?? 0,
                      }),
                      time: format.time(command.takenAtMs),
                    })}
                  </p>

                  {entry.reason === 'refused' ? (
                    <p className="conflict-why">{t('conflicts.reason.refused')}</p>
                  ) : null}

                  <div className="conflict-actions">
                    {/* Both labels name their own effect. The surrounding text
                        may not have been read, and on this screen "OK" and
                        "Cancel" are two ways of losing somebody's dinner. */}
                    <button
                      type="button"
                      className="floor-button big"
                      onClick={() => onDiscard(command.id)}
                    >
                      {t('conflicts.discard')}
                    </button>
                    <button
                      type="button"
                      className="button big danger-spaced"
                      onClick={() => onApplyAnyway(command.id)}
                    >
                      {t(`conflicts.applyAnyway.${command.kind}`, {
                        defaultValue: t('conflicts.applyAnywayGeneric'),
                        count: command.subject.itemCount ?? 0,
                      })}
                    </button>
                  </div>
                  <p className="table-note">{t('conflicts.applyAnywayNote')}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
