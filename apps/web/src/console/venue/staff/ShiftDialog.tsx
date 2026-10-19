import {
  SHIFT_HORIZON_DAYS,
  SHIFT_MAX_MINUTES,
  StaffPermissionError,
  ValidationError,
  describeFailure,
  type BranchShifts,
  type ShiftInput,
  type StaffMember,
  type StaffShift,
} from '@yalla/api';
import { useShiftMutations } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useMemo, useState, type FormEvent } from 'react';
import { Dialog } from '../../ui/Dialog';
import { useToast } from '../../ui/toast';
import { addDays, minutesOf, shiftLength, shiftTimes } from './staffShifts';

export interface ShiftDialogProps {
  readonly member: StaffMember;
  readonly branchId: string;
  readonly branchName: string;
  /** The branch's shifts, as the page read them; the dialog lists this person's. */
  readonly shifts: BranchShifts | undefined;
  readonly onClose: () => void;
  /** The row's ⋮ button: the menu item that opened this is gone. */
  readonly returnFocusTo?: () => HTMLElement | null;
}

type Field = 'date' | 'startsAt' | 'endsAt' | 'form';

interface Draft {
  /** The shift being changed, or null for a new one. */
  readonly editing: string | null;
  readonly date: string;
  readonly dayOff: boolean;
  readonly startsAt: string;
  readonly endsAt: string;
}

const blank = (date: string): Draft => ({
  editing: null,
  date,
  dayOff: false,
  startsAt: '10:00',
  endsAt: '19:00',
});

/**
 * One person's shifts at this branch (HANDOFF section 6: "a small editor on the
 * Staff screen, a Shift action in the row menu").
 *
 * The days to come, each with Change and Remove, and one line of a form under
 * them: a date, a working shift's start and end — an end at or before the
 * start runs past midnight, and the form says "(next day)" as soon as it
 * does — or a day off. Removing says so in a toast with Undo, which plans the
 * same shift again.
 *
 * The rules are checked before the call where they are the person's own
 * (times, an end equal to the start, 16 hours at most, the date window); the
 * overlap with another of their shifts, at any branch, is the server's to
 * know, and lands under the start time in the console's own words.
 */
export function ShiftDialog({
  member,
  branchId,
  branchName,
  shifts,
  onClose,
  returnFocusTo,
}: ShiftDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const { create, update, remove } = useShiftMutations(branchId);

  const today = shifts?.serviceDate ?? new Date().toISOString().slice(0, 10);
  const lastDay = addDays(today, SHIFT_HORIZON_DAYS);
  const [draft, setDraft] = useState<Draft>(() => blank(today));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const theirs = useMemo(
    () =>
      (shifts?.shifts ?? []).filter(
        (shift) => shift.staffMemberId === member.id && shift.date >= today,
      ),
    [shifts, member.id, today],
  );

  const dayFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }),
    [locale],
  );
  const dayLabel = (date: string) =>
    date === today
      ? t('staff.shift.today')
      : date === addDays(today, 1)
        ? t('staff.shift.tomorrow')
        : dayFormat.format(new Date(`${date}T12:00:00Z`));
  const nextDay = t('hours.nextDay');

  const busy = create.isPending || update.isPending;
  const overnight =
    !draft.dayOff &&
    Boolean(draft.startsAt && draft.endsAt) &&
    minutesOf(draft.endsAt) <= minutesOf(draft.startsAt) &&
    draft.endsAt !== '00:00';

  function focus(field: Field) {
    const id = field === 'date' ? 'sh-date' : field === 'startsAt' ? 'sh-from' : 'sh-to';
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  /** The person's own mistakes, before anything is sent. */
  function problems(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    if (!draft.date) found.date = t('staff.shift.error.dateRequired');
    else if (draft.date < today) found.date = t('staff.shift.error.past');
    else if (draft.date > lastDay)
      found.date = t('staff.shift.error.tooFar', { days: SHIFT_HORIZON_DAYS });
    if (!draft.dayOff) {
      if (!draft.startsAt) found.startsAt = t('staff.shift.error.timeRequired');
      if (!draft.endsAt) found.endsAt = t('staff.shift.error.timeRequired');
      if (draft.startsAt && draft.endsAt) {
        if (draft.startsAt === draft.endsAt) found.endsAt = t('staff.shift.error.noLength');
        else if (shiftLength(draft.startsAt, draft.endsAt) > SHIFT_MAX_MINUTES)
          found.endsAt = t('staff.shift.error.tooLong', { hours: SHIFT_MAX_MINUTES / 60 });
      }
    }
    return found;
  }

  /** The server's 422, field by field, in the console's own sentences. */
  function refused(error: unknown): Partial<Record<Field, string>> {
    if (error instanceof ValidationError && error.violations.length > 0) {
      const found: Partial<Record<Field, string>> = {};
      for (const violation of error.violations) {
        const field: Field =
          violation.field === 'date' ||
          violation.field === 'startsAt' ||
          violation.field === 'endsAt'
            ? violation.field
            : 'form';
        const text =
          field === 'startsAt' && violation.bound === 'conflict'
            ? t('staff.shift.error.overlap')
            : field === 'date' && violation.bound === 'conflict'
              ? t('staff.shift.error.dayOffClash')
              : field === 'date' && violation.bound === 'min'
                ? t('staff.shift.error.past')
                : field === 'date' && violation.bound === 'max'
                  ? t('staff.shift.error.tooFar', { days: SHIFT_HORIZON_DAYS })
                  : field === 'endsAt' && violation.bound === 'max'
                    ? t('staff.shift.error.tooLong', { hours: SHIFT_MAX_MINUTES / 60 })
                    : field === 'endsAt' && violation.bound === 'conflict'
                      ? t('staff.shift.error.noLength')
                      : violation.message;
        found[field] ??= text;
      }
      return found;
    }
    if (error instanceof StaffPermissionError) return { form: error.message };
    if (describeFailure(error) === 'offline') return { form: t('state.offline') };
    if (describeFailure(error) === 'conflict' && error instanceof Error && error.message)
      return { form: error.message };
    return { form: t('state.error') };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = problems();
    setErrors(found);
    const first = (['date', 'startsAt', 'endsAt'] as const).find((field) => found[field]);
    if (first) {
      focus(first);
      return;
    }
    const shift: ShiftInput = {
      date: draft.date,
      dayOff: draft.dayOff,
      startsAt: draft.dayOff ? null : draft.startsAt,
      endsAt: draft.dayOff ? null : draft.endsAt,
    };
    try {
      if (draft.editing) {
        await update.mutateAsync({ shiftId: draft.editing, shift });
        toast.say(t('staff.shift.changed'));
      } else {
        await create.mutateAsync({ staffMemberId: member.id, shift });
        toast.say(t('staff.shift.added'));
      }
      setDraft(blank(draft.date));
      setErrors({});
    } catch (error) {
      const found = refused(error);
      setErrors(found);
      const field = (['date', 'startsAt', 'endsAt'] as const).find((name) => found[name]);
      if (field) focus(field);
    }
  }

  function removeShift(shift: StaffShift) {
    remove.mutate(shift.id, {
      onSuccess: () => {
        if (draft.editing === shift.id) setDraft(blank(today));
        toast.say(t('staff.shift.removed', { day: dayLabel(shift.date) }), {
          undo: () =>
            create.mutate(
              {
                staffMemberId: member.id,
                shift: {
                  date: shift.date,
                  dayOff: shift.dayOff,
                  startsAt: shift.startsAt,
                  endsAt: shift.endsAt,
                },
              },
              {
                onSuccess: () => toast.say(t('staff.shift.restored')),
                onError: () => toast.say(t('staff.shift.restoreFailed'), { tone: 'error' }),
              },
            ),
          fallbackFocus: () => document.getElementById('sh-date'),
        });
      },
      onError: (error) => setErrors(refused(error)),
    });
  }

  const describe = (field: Field) =>
    errors[field] ? { 'aria-invalid': true, 'aria-describedby': `sh-${field}-err` } : {};

  return (
    <Dialog
      wide
      title={t('staff.shift.title', { name: member.fullName })}
      description={t('staff.shift.lead', { branch: branchName })}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
      {...(returnFocusTo ? { returnFocusTo } : {})}
    >
      {theirs.length === 0 ? (
        <p className="yc-help">{t('staff.shift.none')}</p>
      ) : (
        <ul
          className="yc-shifts"
          aria-label={t('staff.shift.listLabel', { name: member.fullName })}
        >
          {theirs.map((shift) => (
            <li key={shift.id} className={draft.editing === shift.id ? 'is-editing' : undefined}>
              <span className="yc-shift-day">{dayLabel(shift.date)}</span>
              <span className="yc-shift-t">
                {shift.dayOff ? t('staff.shift.dayOff') : shiftTimes(shift, nextDay)}
              </span>
              <button
                type="button"
                className="yc-btn yc-btn-ghost yc-btn-sm"
                aria-label={t('staff.shift.changeNamed', { day: dayLabel(shift.date) })}
                onClick={() => {
                  setErrors({});
                  setDraft({
                    editing: shift.id,
                    date: shift.date,
                    dayOff: shift.dayOff,
                    startsAt: shift.startsAt ?? '10:00',
                    endsAt: shift.endsAt ?? '19:00',
                  });
                  focus('date');
                }}
              >
                {t('staff.shift.change')}
              </button>
              <button
                type="button"
                className="yc-btn yc-btn-ghost-red yc-btn-sm"
                aria-label={t('staff.shift.removeNamed', { day: dayLabel(shift.date) })}
                disabled={remove.isPending}
                onClick={() => removeShift(shift)}
              >
                {t('staff.shift.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="yc-form yc-shift-form" noValidate onSubmit={(event) => void save(event)}>
        <h3 className="yc-h3">
          {draft.editing ? t('staff.shift.editTitle') : t('staff.shift.addTitle')}
        </h3>
        <div
          className="yc-radios yc-shift-kind"
          role="radiogroup"
          aria-label={t('staff.shift.kind')}
        >
          <label className={draft.dayOff ? 'yc-radio' : 'yc-radio is-on'}>
            <input
              type="radio"
              name="shift-kind"
              checked={!draft.dayOff}
              onChange={() => setDraft({ ...draft, dayOff: false })}
            />
            {t('staff.shift.works')}
          </label>
          <label className={draft.dayOff ? 'yc-radio is-on' : 'yc-radio'}>
            <input
              type="radio"
              name="shift-kind"
              checked={draft.dayOff}
              onChange={() => setDraft({ ...draft, dayOff: true })}
            />
            {t('staff.shift.dayOff')}
          </label>
        </div>
        <div className="yc-shift-fields">
          <div className="yc-fld">
            <label htmlFor="sh-date">{t('staff.shift.date')}</label>
            <input
              id="sh-date"
              className="yc-ctl"
              type="date"
              data-autofocus=""
              min={today}
              max={lastDay}
              value={draft.date}
              {...describe('date')}
              onChange={(event) => setDraft({ ...draft, date: event.currentTarget.value })}
            />
            {errors.date ? (
              <span className="yc-err" id="sh-date-err">
                {errors.date}
              </span>
            ) : null}
          </div>
          {draft.dayOff ? null : (
            <>
              <div className="yc-fld">
                <label htmlFor="sh-from">{t('staff.shift.from')}</label>
                <input
                  id="sh-from"
                  className="yc-ctl"
                  type="time"
                  value={draft.startsAt}
                  {...describe('startsAt')}
                  onChange={(event) => setDraft({ ...draft, startsAt: event.currentTarget.value })}
                />
                {errors.startsAt ? (
                  <span className="yc-err" id="sh-startsAt-err">
                    {errors.startsAt}
                  </span>
                ) : null}
              </div>
              <div className="yc-fld">
                <label htmlFor="sh-to">
                  {t('staff.shift.to')}
                  {overnight ? <span className="yc-optional">{nextDay}</span> : null}
                </label>
                <input
                  id="sh-to"
                  className="yc-ctl"
                  type="time"
                  value={draft.endsAt}
                  {...describe('endsAt')}
                  onChange={(event) => setDraft({ ...draft, endsAt: event.currentTarget.value })}
                />
                {errors.endsAt ? (
                  <span className="yc-err" id="sh-endsAt-err">
                    {errors.endsAt}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
        {errors.form ? (
          <p className="yc-alert" role="alert">
            {errors.form}
          </p>
        ) : null}
        <div className="yc-acts">
          {draft.editing ? (
            <button
              type="button"
              className="yc-btn yc-btn-sec"
              disabled={busy}
              onClick={() => {
                setErrors({});
                setDraft(blank(today));
              }}
            >
              {t('staff.shift.cancelEdit')}
            </button>
          ) : (
            <button type="button" className="yc-btn yc-btn-sec" disabled={busy} onClick={onClose}>
              {t('staff.shift.done')}
            </button>
          )}
          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={busy}>
            {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
            {draft.editing ? t('staff.shift.saveChange') : t('staff.shift.add')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
