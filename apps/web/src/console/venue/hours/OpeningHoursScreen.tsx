import { OverlappingHoursError, WEEK_ORDER, type WeekdayIndex } from '@yalla/api';
import { useOpeningHours, useSaveOpeningHours } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useReducer, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { useVenueOutlet } from '../VenueLayout';
import {
  dinerPreview,
  hoursProblems,
  hoursReducer,
  initialHoursState,
  isClosed,
  isDirty,
  problemIndexes,
} from './reducer';

/**
 * Seven rows, one per day.
 *
 * Three decisions this screen makes for the person using it, rather than asking:
 *
 * - **Crossing midnight is derived.** A closing time at or before the opening
 *   time is the next day, shown as "10:00 – 01:00 (next day)". A checkbox for
 *   it is a checkbox somebody gets wrong on the one row where it matters, and
 *   the server refuses to accept the flag from a client anyway.
 * - **Closed is the absence of a span**, not a zero-length one. `00:00–00:00`
 *   reads to every consumer as a venue open for an instant at midnight.
 * - **The week is saved as a whole.** The endpoint replaces it atomically, so
 *   this is an explicit save with a dirty indicator. Autosave on blur would
 *   mean the last field to lose focus silently wins over everything before it.
 *
 * The diner preview is on the page because that string is generated from this
 * data, and getting it wrong is silently visible to every user of the product.
 */
export function OpeningHoursScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId } = useVenueOutlet();

  const hoursQuery = useOpeningHours(branchId ?? undefined);
  const save = useSaveOpeningHours(branchId ?? undefined);

  const [state, dispatch] = useReducer(hoursReducer, undefined, () => initialHoursState());
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Loaded once per branch. Not merged into a draft: a load that kept local
  // edits would silently reapply them on top of somebody else's saved week.
  useEffect(() => {
    if (hoursQuery.data) dispatch({ type: 'loaded', week: hoursQuery.data });
  }, [hoursQuery.data]);

  const dirty = isDirty(state);
  const problems = hoursProblems(state.draft);
  useUnsavedChangesGuard(dirty);

  if (!branchId) {
    return (
      <section className="page">
        <p className="muted">{t('menu.noBranch')}</p>
      </section>
    );
  }

  if (hoursQuery.isError) {
    return (
      <section className="page">
        <QueryFailureNotice error={hoursQuery.error} onRetry={() => void hoursQuery.refetch()} />
      </section>
    );
  }

  return (
    <section className="page hours-screen">
      <header className="page-head">
        <h2>{t('nav.hours')}</h2>
        <div className="page-actions">
          {dirty ? <span className="badge badge-warn">{t('hours.unsaved')}</span> : null}
          {savedAt !== null && !dirty ? (
            <span className="badge badge-ok">{t('hours.saved')}</span>
          ) : null}
          <button
            type="button"
            className="button"
            disabled={!dirty || save.isPending}
            onClick={() => dispatch({ type: 'discard' })}
          >
            {t('hours.discard')}
          </button>
          <button
            type="button"
            className="button button-primary"
            // Blocked on a problem the server would refuse anyway. Sending a
            // week we know is invalid costs a round trip and returns one
            // sentence about the whole PUT, which marks nothing.
            disabled={!dirty || save.isPending || problems.length > 0}
            onClick={() => {
              setServerProblem(null);
              save.mutate(state.draft, {
                onSuccess: (week) => {
                  dispatch({ type: 'loaded', week });
                  setSavedAt(Date.now());
                },
                onError: (error) =>
                  setServerProblem(
                    error instanceof OverlappingHoursError ? error.message : t('hours.saveFailed'),
                  ),
              });
            }}
          >
            {save.isPending ? t('saving') : t('hours.save')}
          </button>
        </div>
      </header>

      <p className="muted">{t('hours.body')}</p>

      {problems.length > 0 ? (
        <p className="error" role="alert">
          {t('hours.overlapWarning')}
        </p>
      ) : null}
      {serverProblem ? (
        <p className="error" role="alert">
          {serverProblem}
        </p>
      ) : null}

      {hoursQuery.isLoading ? (
        <p className="muted">{t('loading')}</p>
      ) : (
        <>
          <div className="hours-shortcuts">
            <button
              type="button"
              className="button"
              onClick={() =>
                dispatch({
                  type: 'copyDay',
                  from: 1,
                  to: WEEK_ORDER.filter((day) => day !== 1),
                })
              }
            >
              {t('hours.sameEveryDay')}
            </button>
            <span className="small muted">{t('hours.sameEveryDayHint')}</span>
          </div>

          <ul className="hours-list">
            {state.draft.map((day) => {
              const marked = problemIndexes(problems, day.day);
              const closed = isClosed(day);
              const preview = dinerPreview(day);

              return (
                <li key={day.day} className={`hours-row ${closed ? 'is-closed' : ''}`}>
                  <div className="hours-day">
                    <strong>{t(`hours.day.${day.day}`)}</strong>
                    <label className="switch small">
                      <input
                        type="checkbox"
                        checked={!closed}
                        onChange={(event) =>
                          dispatch({
                            type: 'setClosed',
                            day: day.day,
                            closed: !event.target.checked,
                          })
                        }
                      />
                      <span>{closed ? t('hours.closed') : t('hours.open')}</span>
                    </label>
                  </div>

                  <div className="hours-blocks">
                    {closed ? (
                      <p className="muted small">{t('hours.closedAllDay')}</p>
                    ) : (
                      day.blocks.map((block, index) => (
                        <div
                          key={index}
                          className={`hours-block ${marked.has(index) ? 'is-invalid' : ''}`}
                        >
                          <input
                            className="field time-field"
                            type="time"
                            value={block.opensAt}
                            onChange={(event) =>
                              dispatch({
                                type: 'setTime',
                                day: day.day,
                                index,
                                field: 'opensAt',
                                value: event.target.value,
                              })
                            }
                          />
                          <span aria-hidden>–</span>
                          <input
                            className="field time-field"
                            type="time"
                            value={block.closesAt}
                            onChange={(event) =>
                              dispatch({
                                type: 'setTime',
                                day: day.day,
                                index,
                                field: 'closesAt',
                                value: event.target.value,
                              })
                            }
                          />
                          {day.blocks.length > 1 ? (
                            <button
                              type="button"
                              className="link-button danger"
                              onClick={() => dispatch({ type: 'removeBlock', day: day.day, index })}
                            >
                              {t('common:action.delete')}
                            </button>
                          ) : null}
                        </div>
                      ))
                    )}

                    {!closed ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => dispatch({ type: 'addBlock', day: day.day })}
                      >
                        {t('hours.split')}
                      </button>
                    ) : null}
                  </div>

                  {/* What the diner's branch card will say, from this data.
                      Shown because that string is generated here and getting
                      it wrong is invisible everywhere else. */}
                  <div className="hours-preview">
                    {closed ? (
                      <span className="muted small">{t('hours.previewClosed')}</span>
                    ) : (
                      preview.spans.map((span, index) => (
                        <span key={index} className="small">
                          {span.text}
                          {span.nextDay ? ` ${t('hours.nextDay')}` : ''}
                        </span>
                      ))
                    )}
                  </div>

                  <div className="hours-copy">
                    <CopyToDays
                      from={day.day}
                      onCopy={(to) => dispatch({ type: 'copyDay', from: day.day, to })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** One day onto others. Most venues have two patterns, not seven. */
function CopyToDays({
  from,
  onCopy,
}: {
  readonly from: WeekdayIndex;
  readonly onCopy: (to: readonly WeekdayIndex[]) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<readonly WeekdayIndex[]>([]);

  if (!open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        {t('hours.copyTo')}
      </button>
    );
  }

  return (
    <div className="copy-days">
      {WEEK_ORDER.filter((day) => day !== from).map((day) => (
        <label key={day} className="small">
          <input
            type="checkbox"
            checked={chosen.includes(day)}
            onChange={(event) =>
              setChosen((current) =>
                event.target.checked ? [...current, day] : current.filter((entry) => entry !== day),
              )
            }
          />
          {t(`hours.dayShort.${day}`)}
        </label>
      ))}
      <button
        type="button"
        className="button"
        disabled={chosen.length === 0}
        onClick={() => {
          onCopy(chosen);
          setChosen([]);
          setOpen(false);
        }}
      >
        {t('hours.copy')}
      </button>
      <button type="button" className="link-button" onClick={() => setOpen(false)}>
        {t('common:action.cancel')}
      </button>
    </div>
  );
}
