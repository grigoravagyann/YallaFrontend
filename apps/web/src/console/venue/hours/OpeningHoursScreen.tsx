import {
  ApiError,
  OverlappingHoursError,
  SPECIAL_DAY_HORIZON_DAYS,
  SPECIAL_DAY_NOTE_MAX,
  ValidationError,
  WEEK_ORDER,
  closesNextDay,
  type HoursBlock,
  type SpecialDay,
  type SpecialDaysSaved,
  type WeekdayIndex,
} from '@yalla/api';
import {
  useOpeningHours,
  useSaveOpeningHours,
  useSaveSpecialDays,
  useSpecialDays,
} from '@yalla/api/react';
import { branchDayKey, formatTime, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useEffect, useId, useReducer, useRef, useState, type FormEvent } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { AlertCircleIcon, CrossIcon } from '../../ui/icons';
import { PageHeader } from '../../ui/PageHeader';
import { useToast } from '../../ui/toast';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { useVenueOutlet } from '../VenueLayout';
import { guestNow, todayIn, weekSummary } from './hoursPreview';
import { hoursProblems, hoursReducer, initialHoursState, isDirty, problemIndexes } from './reducer';

type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * The opening hours (Hours artboard): the week, the special days, and what a
 * guest sees.
 *
 * Three decisions this screen makes for the person using it, rather than asking:
 *
 * - **Crossing midnight is derived.** A closing time at or before the opening
 *   time is the next day, said beside it: "(next day)". A checkbox for it is
 *   a checkbox somebody gets wrong on the one row where it matters.
 * - **Closed is the absence of a span**, not a zero-length one.
 * - **The week is saved as a whole**, from the bar at the foot, because the
 *   endpoint replaces it atomically. The special days are not part of it: each
 *   is added or removed on its own, at once, with a toast — the list is
 *   replaced whole on the server (VC3 wire §1), from the copy just read.
 *
 * "What a guest sees now" is read from the week as typed and the special days,
 * in the branch's own zone, so a bar that shuts at one in the morning shows as
 * open until one before it is saved — not after a diner has found out.
 */
export function OpeningHoursScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const { branchId, branchName, timeZoneId } = useVenueOutlet();
  const zone = timeZoneId as TimeZone;

  const hoursQuery = useOpeningHours(branchId ?? undefined);
  const save = useSaveOpeningHours(branchId ?? undefined);

  const [state, dispatch] = useReducer(hoursReducer, undefined, () => initialHoursState());
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<WeekdayIndex | null>(null);
  const now = useNow();

  // Loaded once per branch. Not merged into a draft: a load that kept local
  // edits would silently reapply them on top of somebody else's saved week.
  useEffect(() => {
    if (hoursQuery.data) dispatch({ type: 'loaded', week: hoursQuery.data });
  }, [hoursQuery.data]);

  const dirty = isDirty(state);
  const problems = hoursProblems(state.draft);
  const overlap = problems.length > 0;
  useUnsavedChangesGuard(dirty);

  const specialQuery = useSpecialDays(branchId ?? undefined);
  const specialDays = specialQuery.data ?? [];

  if (!branchId) {
    return (
      <div className="yc-page">
        <PageHeader title={t('nav.hours')} />
        <p className="yc-card yc-empty-line">{t('menu.noBranch')}</p>
      </div>
    );
  }

  if (hoursQuery.isError) {
    return (
      <div className="yc-page">
        <PageHeader title={t('nav.hours')} />
        <div className="yc-card yc-ov-pad">
          <QueryFailureNotice error={hoursQuery.error} onRetry={() => void hoursQuery.refetch()} />
        </div>
      </div>
    );
  }

  const today = todayIn(now, zone);

  function onSave() {
    if (overlap) {
      toast.say(t('hours.fixOverlapFirst'), { tone: 'error' });
      return;
    }
    if (!dirty) {
      toast.say(t('hours.noChanges'));
      return;
    }
    setServerProblem(null);
    save.mutate(state.draft, {
      onSuccess: (week) => {
        dispatch({ type: 'loaded', week });
        toast.say(t('hours.savedToast'));
      },
      onError: (error) =>
        setServerProblem(
          error instanceof OverlappingHoursError
            ? t('hours.overlapWarning')
            : t('hours.saveFailed'),
        ),
    });
  }

  return (
    <div className="yc-page yc-hours-page">
      <PageHeader
        title={t('nav.hours')}
        sub={t('hours.sub', { branch: branchName ?? '' })}
        actions={
          <button
            type="button"
            className="yc-btn yc-btn-sec"
            disabled={hoursQuery.isLoading || save.isPending}
            onClick={() => {
              dispatch({ type: 'copyDay', from: 1, to: WEEK_ORDER.filter((day) => day !== 1) });
              toast.say(t('hours.sameEveryDayDone'));
            }}
          >
            {t('hours.sameEveryDay')}
          </button>
        }
      />

      {overlap || serverProblem ? (
        <div className="yc-banner yc-banner-red" role="alert">
          <AlertCircleIcon />
          <span className="yc-grow">{overlap ? t('hours.overlapWarning') : serverProblem}</span>
        </div>
      ) : null}

      <div className="yc-hr">
        <section className="yc-card" aria-labelledby="hr-week-h">
          <div className="yc-card-h">
            <div>
              <h2 className="yc-h2" id="hr-week-h">
                {t('hours.week')}
              </h2>
              <p className="yc-cap">{t('hours.zone', { zone: timeZoneId })}</p>
            </div>
          </div>
          {hoursQuery.isLoading ? (
            <p className="yc-empty-p" role="status">
              {t('loading')}
            </p>
          ) : (
            <fieldset className="yc-week-f" disabled={save.isPending}>
              <legend className="yc-sr">{t('hours.week')}</legend>
              <ul className="yc-week">
                {WEEK_ORDER.map((weekday) => {
                  const day = state.draft.find((entry) => entry.day === weekday) ?? {
                    day: weekday,
                    blocks: [],
                  };
                  const marked = problemIndexes(problems, weekday);
                  const open = day.blocks.length > 0;
                  const name = t(`hours.day.${weekday}`);
                  return (
                    <li
                      key={weekday}
                      className={marked.size > 0 ? 'yc-day is-bad' : 'yc-day'}
                      aria-current={weekday === today ? 'date' : undefined}
                    >
                      <span className="yc-dname">
                        {name}
                        {weekday === today ? (
                          <span className="yc-today">{t('hours.today')}</span>
                        ) : null}
                      </span>
                      <span className="yc-swl">
                        <button
                          type="button"
                          className="yc-sw"
                          role="switch"
                          aria-checked={open}
                          aria-label={t('hours.openAria', { day: name })}
                          onClick={() =>
                            dispatch({ type: 'setClosed', day: weekday, closed: open })
                          }
                        />
                        {open ? t('hours.open') : t('hours.closed')}
                      </span>
                      <div className="yc-spans">
                        {open ? (
                          day.blocks.map((block, index) => (
                            <BlockRow
                              key={index}
                              day={weekday}
                              dayName={name}
                              index={index}
                              block={block}
                              bad={marked.has(index)}
                              onTime={(field, value) =>
                                dispatch({ type: 'setTime', day: weekday, index, field, value })
                              }
                              onRemove={
                                index > 0
                                  ? () => dispatch({ type: 'removeBlock', day: weekday, index })
                                  : null
                              }
                            />
                          ))
                        ) : (
                          <span className="yc-closed">{t('hours.closedAllDay')}</span>
                        )}
                      </div>
                      <div className="yc-dacts">
                        {open && day.blocks.length === 1 ? (
                          <button
                            type="button"
                            className="yc-btn yc-btn-ghost yc-btn-sm"
                            onClick={() => dispatch({ type: 'splitDay', day: weekday })}
                          >
                            {t('hours.split')}
                          </button>
                        ) : null}
                        <CopyToDays
                          from={weekday}
                          open={copyFrom === weekday}
                          onOpenChange={(next) => setCopyFrom(next ? weekday : null)}
                          onCopy={(to) => {
                            dispatch({ type: 'copyDay', from: weekday, to });
                            setCopyFrom(null);
                            toast.say(t('hours.copied', { day: name, count: to.length }));
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
        </section>

        <aside className="yc-hr-side">
          <SpecialDaysCard
            branchId={branchId}
            zone={zone}
            locale={locale}
            now={now}
            days={specialDays}
            loading={specialQuery.isLoading}
            failed={specialQuery.isError ? specialQuery.error : null}
            onRetry={() => void specialQuery.refetch()}
          />
          <GuestNowCard
            t={t}
            locale={locale}
            zone={zone}
            now={now}
            week={state.draft}
            specialDays={specialDays}
          />
          <section className="yc-card" aria-labelledby="hr-sum-h">
            <div className="yc-card-h">
              <h2 className="yc-h2 yc-h2-sm" id="hr-sum-h">
                {t('hours.summaryTitle')}
              </h2>
            </div>
            <ul className="yc-hsum">
              {weekSummary(state.draft).map((line) => (
                <li key={line.from}>
                  <b>
                    {line.from === line.to
                      ? t(`hours.dayShort.${line.from}`)
                      : `${t(`hours.dayShort.${line.from}`)}–${t(`hours.dayShort.${line.to}`)}`}
                  </b>
                  <span>
                    {line.blocks.length === 0
                      ? t('hours.closed')
                      : line.blocks.map((block) => `${block.opensAt}–${block.closesAt}`).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <div className="yc-savebar" role="region" aria-label={t('hours.saveBar')}>
        <span className="yc-grow" aria-live="polite">
          {overlap ? t('hours.overlapBar') : dirty ? t('hours.unsaved') : t('hours.saved')}
        </span>
        {dirty ? (
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            disabled={save.isPending}
            onClick={() => {
              dispatch({ type: 'discard' });
              setServerProblem(null);
              toast.say(t('hours.discarded'));
            }}
          >
            {t('hours.discard')}
          </button>
        ) : null}
        <button
          type="button"
          className="yc-btn yc-btn-pri yc-btn-sm"
          aria-busy={save.isPending}
          onClick={() => !save.isPending && onSave()}
        >
          {save.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
          {save.isPending ? t('saving') : t('hours.save')}
        </button>
      </div>
    </div>
  );
}

/** The clock "now" is read against, moved on every minute. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** One span of a day: two times, "(next day)" when it crosses midnight, and remove after a break. */
function BlockRow({
  day,
  dayName,
  index,
  block,
  bad,
  onTime,
  onRemove,
}: {
  readonly day: WeekdayIndex;
  readonly dayName: string;
  readonly index: number;
  readonly block: HoursBlock;
  readonly bad: boolean;
  readonly onTime: (field: 'opensAt' | 'closesAt', value: string) => void;
  readonly onRemove: (() => void) | null;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const fromId = `hr-${day}-f${index}`;
  const toId = `hr-${day}-t${index}`;
  return (
    <div className="yc-span">
      <label className="yc-sr" htmlFor={fromId}>
        {t('hours.fromAria', { day: dayName, n: index + 1 })}
      </label>
      <input
        id={fromId}
        type="time"
        className="yc-ctl yc-tm"
        value={block.opensAt}
        aria-invalid={bad}
        onChange={(event) => onTime('opensAt', event.target.value)}
      />
      <span aria-hidden="true">–</span>
      <label className="yc-sr" htmlFor={toId}>
        {t('hours.toAria', { day: dayName, n: index + 1 })}
      </label>
      <input
        id={toId}
        type="time"
        className="yc-ctl yc-tm"
        value={block.closesAt}
        aria-invalid={bad}
        onChange={(event) => onTime('closesAt', event.target.value)}
      />
      {closesNextDay(block) && block.opensAt !== block.closesAt ? (
        <span className="yc-next">{t('hours.nextDay')}</span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          className="yc-ib"
          aria-label={t('hours.removeSpan')}
          onClick={onRemove}
        >
          <CrossIcon />
        </button>
      ) : null}
    </div>
  );
}

/**
 * "Copy…": one day onto others, in a small panel. Most venues have two
 * patterns, not seven. Escape closes it and gives the focus back.
 */
function CopyToDays({
  from,
  open,
  onOpenChange,
  onCopy,
}: {
  readonly from: WeekdayIndex;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCopy: (to: readonly WeekdayIndex[]) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const [chosen, setChosen] = useState<readonly WeekdayIndex[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const name = t(`hours.day.${from}`);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [open]);

  function close() {
    setChosen([]);
    onOpenChange(false);
    buttonRef.current?.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="yc-btn yc-btn-ghost yc-btn-sm"
        aria-expanded={open}
        onClick={() => {
          setChosen([]);
          onOpenChange(!open);
        }}
      >
        {t('hours.copyTo')}
      </button>
      {open ? (
        <div
          ref={panelRef}
          className="yc-pop"
          role="dialog"
          aria-label={t('hours.copyAria', { day: name })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <span className="yc-help yc-pop-t">
            {t('hours.copyLead', { day: t(`hours.dayShort.${from}`) })}
          </span>
          {WEEK_ORDER.filter((day) => day !== from).map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={chosen.includes(day)}
                onChange={(event) =>
                  setChosen((current) =>
                    event.target.checked
                      ? [...current, day]
                      : current.filter((entry) => entry !== day),
                  )
                }
              />
              {t(`hours.day.${day}`)}
            </label>
          ))}
          <div className="yc-pop-acts">
            <button type="button" className="yc-btn yc-btn-sec yc-btn-sm" onClick={close}>
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="yc-btn yc-btn-pri yc-btn-sm"
              onClick={() => {
                if (chosen.length === 0) {
                  toast.say(t('hours.copyNone'));
                  return;
                }
                onCopy(chosen);
                setChosen([]);
                buttonRef.current?.focus();
              }}
            >
              {chosen.length > 0 ? t('hours.copyCount', { count: chosen.length }) : t('hours.copy')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** "31 Dec 2026": a calendar date, with no zone to move it. */
function formatDate(dateKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function shiftDate(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** A special day's hours, as the list says them: "18:00–03:00 (next day)", or "Closed". */
function specialHours(t: Translate, day: SpecialDay): string {
  if (day.blocks.length === 0) return t('hours.closed');
  return day.blocks
    .map(
      (block) =>
        `${block.opensAt}–${block.closesAt}${closesNextDay(block) ? ` ${t('hours.nextDay')}` : ''}`,
    )
    .join(', ');
}

/**
 * Holidays, closures, one-day hours (Hours artboard, "Special days").
 *
 * Each add and remove is its own save, at once: the whole list from today on
 * is sent with the one change, and the answer is the list from then on. Not
 * part of the week's save bar — a closure for tomorrow should not wait on
 * somebody finishing their edit of Thursdays.
 */
function SpecialDaysCard({
  branchId,
  zone,
  locale,
  now,
  days,
  loading,
  failed,
  onRetry,
}: {
  readonly branchId: string;
  readonly zone: TimeZone;
  readonly locale: Locale;
  readonly now: Date;
  readonly days: readonly SpecialDay[];
  readonly loading: boolean;
  readonly failed: unknown;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const saveDays = useSaveSpecialDays(branchId);
  const id = useId();
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<'closed' | 'hours'>('closed');
  const [from, setFrom] = useState('12:00');
  const [to, setTo] = useState('18:00');
  const [error, setError] = useState<{ text: string; field: 'date' | 'note' | 'hours' } | null>(
    null,
  );

  const today = branchDayKey(now, zone);
  const horizon = shiftDate(today, SPECIAL_DAY_HORIZON_DAYS);
  const label = (day: SpecialDay) =>
    day.note ??
    (day.blocks.length === 0 ? t('hours.special.closedDay') : t('hours.special.otherHours'));

  /** What the server's refusal says, under the form. */
  function refusal(caught: unknown): { text: string; field: 'date' | 'note' | 'hours' } {
    if (caught instanceof ValidationError) {
      const first = caught.violations[0];
      if (first?.field.endsWith('.date')) {
        return {
          field: 'date',
          text:
            first.bound === 'min'
              ? t('hours.special.past')
              : first.bound === 'max'
                ? t('hours.special.tooFar')
                : t('hours.special.taken'),
        };
      }
      if (first?.field.endsWith('.note')) {
        return {
          field: 'note',
          text: t('hours.special.noteTooLong', { max: SPECIAL_DAY_NOTE_MAX }),
        };
      }
      if (first?.field.includes('blocks'))
        return { field: 'hours', text: t('hours.special.badHours') };
    }
    return { field: 'date', text: t('hours.special.failed') };
  }

  /**
   * The bookings a change left outside the hours, said only when there are
   * some: the server lists those on the dates this save changed.
   */
  function affected(saved: SpecialDaysSaved): string {
    const count = saved.affectedReservationIds.length;
    return count > 0 ? ` ${t('hours.special.affected', { count })}` : '';
  }

  /** Somebody else saved the list meanwhile (409): theirs is read, never overwritten. */
  function superseded(caught: unknown): boolean {
    if (!(caught instanceof ApiError) || caught.status !== 409) return false;
    toast.say(t('hours.special.superseded'), { tone: 'error' });
    onRetry();
    return true;
  }

  /**
   * The list to send: from the branch's today on. A page left open past
   * midnight still holds yesterday's day, which is history the server keeps.
   */
  const upcoming = (list: readonly SpecialDay[]) => list.filter((day) => day.date >= today);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (saveDays.isPending) return;
    const focus = (field: 'date' | 'note' | 'hours') =>
      document.getElementById(`${id}-${field === 'hours' ? 'from' : field}`)?.focus();
    const fail = (next: { text: string; field: 'date' | 'note' | 'hours' }) => {
      setError(next);
      focus(next.field);
    };
    if (!date) return fail({ field: 'date', text: t('hours.special.pickDate') });
    if (days.some((day) => day.date === date)) {
      return fail({ field: 'date', text: t('hours.special.taken') });
    }
    if (date < today) return fail({ field: 'date', text: t('hours.special.past') });
    if (date > horizon) return fail({ field: 'date', text: t('hours.special.tooFar') });
    if (kind === 'hours' && from === to)
      return fail({ field: 'hours', text: t('hours.special.badHours') });

    const day: SpecialDay = {
      date,
      note: note.trim() || null,
      blocks: kind === 'closed' ? [] : [{ opensAt: from, closesAt: to }],
    };
    try {
      const saved = await saveDays.mutateAsync(upcoming([...days, day]));
      setDate('');
      setNote('');
      setError(null);
      toast.say(
        `${t('hours.special.added', { date: formatDate(date, locale), name: label(day) })}${affected(saved)}`,
      );
    } catch (caught) {
      if (!superseded(caught)) fail(refusal(caught));
    }
  }

  function remove(day: SpecialDay) {
    const before = upcoming(days);
    const failed = (caught: unknown) => {
      if (!superseded(caught)) toast.say(t('hours.special.failed'), { tone: 'error' });
    };
    saveDays.mutate(
      before.filter((candidate) => candidate.date !== day.date),
      {
        onSuccess: (saved) =>
          toast.say(`${t('hours.special.removed', { name: label(day) })}${affected(saved)}`, {
            focusUndo: true,
            fallbackFocus: () => document.getElementById(`${id}-date`),
            undo: () =>
              saveDays.mutate(upcoming(before), {
                onSuccess: () => toast.say(t('hours.special.restored', { name: label(day) })),
                onError: failed,
              }),
          }),
        onError: failed,
      },
    );
  }

  return (
    <section className="yc-card" aria-labelledby={`${id}-h`}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={`${id}-h`}>
            {t('hours.special.title')}
          </h2>
          <p className="yc-cap">{t('hours.special.cap')}</p>
        </div>
      </div>
      {loading ? (
        <p className="yc-empty-p" role="status">
          {t('loading')}
        </p>
      ) : failed ? (
        <div className="yc-ov-pad">
          <QueryFailureNotice error={failed} onRetry={onRetry} />
        </div>
      ) : days.length === 0 ? (
        <p className="yc-empty-p">{t('hours.special.empty')}</p>
      ) : (
        <ul className="yc-sd">
          {days.map((day) => (
            <li key={day.date}>
              <span>
                <b>{formatDate(day.date, locale)}</b>
                <small>{label(day)}</small>
              </span>
              <span className={day.blocks.length === 0 ? 'yc-closed' : 'yc-sd-h'}>
                {specialHours(t, day)}
              </span>
              <button
                type="button"
                className="yc-ib"
                aria-label={t('hours.special.remove', { name: label(day) })}
                disabled={saveDays.isPending}
                onClick={() => remove(day)}
              >
                <CrossIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="yc-sdadd" noValidate onSubmit={(event) => void add(event)}>
        <label htmlFor={`${id}-date`}>
          {t('hours.special.date')}
          <input
            id={`${id}-date`}
            type="date"
            className="yc-ctl"
            min={today}
            max={horizon}
            value={date}
            aria-invalid={error?.field === 'date'}
            aria-describedby={error ? `${id}-err` : undefined}
            onChange={(event) => {
              setDate(event.target.value);
              setError(null);
            }}
          />
        </label>
        <label htmlFor={`${id}-note`}>
          {t('hours.special.name')}
          <input
            id={`${id}-note`}
            className="yc-ctl yc-sd-name"
            maxLength={SPECIAL_DAY_NOTE_MAX}
            placeholder={t('hours.special.namePlaceholder')}
            value={note}
            aria-invalid={error?.field === 'note'}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <label htmlFor={`${id}-kind`}>
          {t('hours.special.kind')}
          <select
            id={`${id}-kind`}
            className="yc-ctl"
            value={kind}
            onChange={(event) => setKind(event.target.value === 'hours' ? 'hours' : 'closed')}
          >
            <option value="closed">{t('hours.closed')}</option>
            <option value="hours">{t('hours.special.otherHours')}</option>
          </select>
        </label>
        {kind === 'hours' ? (
          <>
            <label htmlFor={`${id}-from`}>
              {t('hours.special.from')}
              <input
                id={`${id}-from`}
                type="time"
                className="yc-ctl"
                value={from}
                aria-invalid={error?.field === 'hours'}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label htmlFor={`${id}-to`}>
              {t('hours.special.to')}
              <input
                id={`${id}-to`}
                type="time"
                className="yc-ctl"
                value={to}
                aria-invalid={error?.field === 'hours'}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </>
        ) : null}
        <button
          type="submit"
          className="yc-btn yc-btn-sec yc-btn-sm yc-sd-add"
          aria-busy={saveDays.isPending}
        >
          {t('hours.special.add')}
        </button>
      </form>
      {error ? (
        <p className="yc-err yc-sd-err" id={`${id}-err`} role="alert">
          {error.text}
        </p>
      ) : null}
    </section>
  );
}

/** "A guest sees right now": open or closed, until or from when, and the special day it is. */
function GuestNowCard({
  t,
  locale,
  zone,
  now,
  week,
  specialDays,
}: {
  readonly t: Translate;
  readonly locale: Locale;
  readonly zone: TimeZone;
  readonly now: Date;
  readonly week: Parameters<typeof guestNow>[0];
  readonly specialDays: readonly SpecialDay[];
}) {
  const id = useId();
  const seen = guestNow(week, specialDays, now, zone);
  const time = (utc: string) => formatTime(utc, zone, locale);
  const day = t(`hours.day.${todayIn(now, zone)}`);
  const sub = seen.isOpen
    ? seen.closesAtUtc
      ? t(seen.closesNextDay ? 'hours.now.closesNextDay' : 'hours.now.closes', {
          day,
          time: time(seen.closesAtUtc),
        })
      : day
    : seen.opensAtUtc && seen.opensToday
      ? t('hours.now.opensToday', { time: time(seen.opensAtUtc) })
      : t('hours.now.notToday');
  return (
    <section className="yc-card" aria-labelledby={id}>
      <div className="yc-now">
        <span className="yc-help yc-now-l" id={id}>
          {t('hours.now.title')}
        </span>
        <span className="yc-now-s">
          <i className={seen.isOpen ? 'is-open' : undefined} aria-hidden="true" />
          {seen.isOpen ? t('hours.open') : t('hours.closed')}
        </span>
        <span className="yc-muted yc-now-sub">
          {sub}
          {seen.special?.note ? ` · ${seen.special.note}` : ''}
        </span>
      </div>
    </section>
  );
}
