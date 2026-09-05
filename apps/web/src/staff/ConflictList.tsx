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
 * Each entry has to answer three questions in the order a waiter asks them:
 * what did I do, when did I do it, and what does the table look like now. A
 * list that only says "conflict on table 7" is a list people close.
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
              const label = command.subject.tableLabel ?? '—';

              return (
                <li key={command.id} className="conflict-card">
                  {/* What was attempted, and when the waiter did it — not when
                      the tablet got round to noticing. */}
                  <p className="conflict-what">
                    {t(`conflicts.attempted.${command.kind}`, {
                      label,
                      time: format.time(command.takenAtMs),
                      count: command.subject.itemCount ?? 0,
                    })}
                  </p>

                  {/* What the table looks like now. This is the sentence that
                      decides which button they press. */}
                  <p className="conflict-now">
                    {observed
                      ? t('conflicts.now', {
                          label: observed.tableLabel || label,
                          state: t(`conflicts.status.${observed.currentStatus}`),
                        })
                      : t('conflicts.nowUnknown')}
                  </p>

                  {observed?.changedBy ? (
                    <p className="conflict-who">
                      {t('conflicts.changedBy', { name: observed.changedBy })}
                    </p>
                  ) : null}

                  <p className="conflict-why">{t(`conflicts.reason.${entry.reason}`)}</p>

                  <div className="conflict-actions">
                    {/* Apply anyway is deliberately not the primary: the usual
                        right answer is discard, because the world has moved on
                        and somebody else has already dealt with the table. */}
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
                      {t('conflicts.applyAnyway')}
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
