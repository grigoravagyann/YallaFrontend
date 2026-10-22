import {
  DEFAULT_TAKEAWAY_SETTINGS,
  ValidationError,
  takeawaySettingsViolations,
  type TakeawaySettings,
  type TakeawaySettingsInput,
} from '@yalla/api';
import { useSaveTakeawaySettings, useTakeawaySettings } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { PhoneIcon } from '../../ui/icons';
import { useToast } from '../../ui/toast';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import type { PreOrderCardDraft } from './PreOrderSettingsCard';

/** The card's anchor, for the policy's contents. */
export const TAKEAWAY_CARD_ID = 'pol-takeaway';

/** The card's draft, as the page's save bar needs it: the pre-order card's shape. */
export type TakeawayCardDraft = PreOrderCardDraft;

/** The three numbers, in the server's field names. */
type NumberField = 'prepMinutes' | 'lastOrderMinutes' | 'maxInProgress';

/**
 * Takeaway orders (2026-10-22, the Policy artboard), on the Reservation policy
 * screen: whether this branch takes them, whether they are accepted without a
 * tap, how long "as soon as possible" takes, when ordering closes before
 * closing time, and how many may be in the kitchen at once.
 *
 * Its own card and its own save, because it is its own endpoint
 * (`PUT …/takeaway-settings`), and the page's bar says when it holds changes
 * and saves or discards it with the rest, as it does the pre-order card.
 * Which dishes are not for takeaway is on the Menu, on each dish's row; the
 * card says so and links there. "Guest will see" shows the place page's line
 * as the settings stand.
 */
export function TakeawaySettingsCard({
  branchId,
  onDraft,
}: {
  readonly branchId: string;
  /** Told the card's draft as it changes, and `null` while there is no form. */
  readonly onDraft?: ((draft: TakeawayCardDraft | null) => void) | undefined;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const query = useTakeawaySettings(branchId);
  const titleId = `${TAKEAWAY_CARD_ID}-h`;

  return (
    <section className="yc-card" id={TAKEAWAY_CARD_ID} aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('takeaway.title')}
          </h2>
          <p className="yc-cap">{t('takeaway.body')}</p>
        </div>
      </div>
      {query.isError ? (
        <div className="yc-ov-pad">
          <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : query.data ? (
        // Another branch is another form: nothing typed carries over.
        <TakeawayForm key={branchId} branchId={branchId} saved={query.data} onDraft={onDraft} />
      ) : (
        <p className="yc-empty-line" role="status">
          {t('loading')}
        </p>
      )}
    </section>
  );
}

function inputOf(settings: TakeawaySettings): TakeawaySettingsInput {
  return {
    enabled: settings.enabled,
    autoAccept: settings.autoAccept,
    prepMinutes: settings.prepMinutes,
    lastOrderMinutes: settings.lastOrderMinutes,
    maxInProgress: settings.maxInProgress,
  };
}

function same(a: TakeawaySettingsInput, b: TakeawaySettingsInput): boolean {
  return (
    a.enabled === b.enabled &&
    a.autoAccept === b.autoAccept &&
    a.prepMinutes === b.prepMinutes &&
    a.lastOrderMinutes === b.lastOrderMinutes &&
    a.maxInProgress === b.maxInProgress
  );
}

function TakeawayForm({
  branchId,
  saved,
  onDraft,
}: {
  readonly branchId: string;
  readonly saved: TakeawaySettings;
  readonly onDraft?: ((draft: TakeawayCardDraft | null) => void) | undefined;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const save = useSaveTakeawaySettings(branchId);
  const { bounds } = saved;

  const [draft, setDraft] = useState<TakeawaySettingsInput>(() => inputOf(saved));
  /** As typed, per number: null when the field shows the number itself. */
  const [typing, setTyping] = useState<Partial<Record<NumberField, string | undefined>>>({});
  /** The fields the server refused although they looked fine here. */
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set());
  /** The saved values the draft started from: what "changed here" is measured against. */
  const [base, setBase] = useState<TakeawaySettingsInput>(() => inputOf(saved));

  // A read brought other values (another manager's save, or this card's own):
  // an untouched form takes them in; a touched one keeps what was typed.
  const fresh = inputOf(saved);
  if (!same(fresh, base)) {
    if (same(draft, base)) {
      setDraft(fresh);
      setTyping({});
    }
    setBase(fresh);
  }

  const violations = takeawaySettingsViolations(draft, bounds);
  const invalid = new Set(violations.map((violation) => violation.field));
  const dirty = !same(draft, fresh);
  useUnsavedChangesGuard(dirty);

  // The page's bar acts through the latest of these, whichever render it holds.
  const actions = useRef({ save: (): boolean => false, discard: () => {} });
  useEffect(() => {
    actions.current = { save: onSave, discard: onDiscard };
  });
  const outOfBounds = violations.length > 0;
  useEffect(() => {
    onDraft?.({
      dirty,
      invalid: dirty && outOfBounds,
      save: () => actions.current.save(),
      discard: () => actions.current.discard(),
    });
  }, [dirty, outOfBounds, onDraft]);
  useEffect(() => () => onDraft?.(null), [onDraft]);

  function change(next: Partial<TakeawaySettingsInput>) {
    setDraft((current) => ({ ...current, ...next }));
    setRefused((current) => {
      const keys = Object.keys(next).filter((key) => current.has(key));
      if (keys.length === 0) return current;
      const left = new Set(current);
      for (const key of keys) left.delete(key);
      return left;
    });
  }

  function onDiscard() {
    setDraft(fresh);
    setTyping({});
    setRefused(new Set());
  }

  function onSave(): boolean {
    if (save.isPending) return false;
    const first = violations[0];
    if (first) {
      toast.say(t('policy.fixFirst'), { tone: 'error' });
      document.getElementById(fieldId(first.field as NumberField))?.focus();
      return false;
    }
    if (!dirty) {
      toast.say(t('takeaway.noChanges'));
      return false;
    }
    setRefused(new Set());
    save.mutate(draft, {
      onSuccess: () => {
        setTyping({});
        toast.say(t('takeaway.saved'));
      },
      onError: (error) => {
        if (error instanceof ValidationError) {
          setRefused(new Set(error.violations.map((violation) => violation.field)));
        }
        toast.say(t('takeaway.saveFailed'), { tone: 'error' });
      },
    });
    return true;
  }

  const stepper = (
    field: NumberField,
    min: number,
    max: number,
    step: number,
    unit: string,
    shipped: number,
  ) => {
    const label = t(`takeaway.${field}.label`);
    const value = draft[field];
    const bad = invalid.has(field) || refused.has(field);
    const error = invalid.has(field)
      ? step > 1
        ? t('takeaway.outOfBoundsStep', { min, max, step })
        : t('policy.outOfBounds', { min, max })
      : refused.has(field)
        ? t('policy.refused')
        : null;
    const id = fieldId(field);
    const shown = typing[field] ?? (Number.isNaN(value) ? '' : String(value));
    const nudge = (delta: number) => {
      setTyping((current) => ({ ...current, [field]: undefined }));
      const from = Number.isNaN(value) ? min : value;
      // Back onto the step from wherever a typed value left it.
      const snapped = min + Math.round((from - min) / step) * step;
      const next = snapped === from ? from + delta * step : snapped;
      change({ [field]: Math.max(min, Math.min(max, next)) });
    };
    return (
      <div className="yc-pf" key={field}>
        <div className="yc-pf-t">
          <span className="yc-pf-l" id={`${id}-l`}>
            {label}
          </span>
          <span className="yc-pf-w" id={`${id}-w`}>
            {t(`takeaway.${field}.why`)}
          </span>
        </div>
        <div className="yc-pf-c">
          <div className={bad ? 'yc-step is-bad' : 'yc-step'}>
            <button
              type="button"
              aria-label={t('policy.decrease', { field: label })}
              disabled={save.isPending || value <= min}
              onClick={() => nudge(-1)}
            >
              −
            </button>
            <input
              id={id}
              inputMode="numeric"
              value={shown}
              aria-labelledby={`${id}-l`}
              aria-describedby={error ? `${id}-w ${id}-e` : `${id}-w`}
              aria-invalid={bad}
              disabled={save.isPending}
              onChange={(event) => {
                const text = event.target.value.replace(/\D/gu, '');
                setTyping((current) => ({ ...current, [field]: text }));
                change({ [field]: text === '' ? Number.NaN : Number(text) });
              }}
              onBlur={() => setTyping((current) => ({ ...current, [field]: undefined }))}
            />
            <button
              type="button"
              aria-label={t('policy.increase', { field: label })}
              disabled={save.isPending || value >= max}
              onClick={() => nudge(1)}
            >
              +
            </button>
            <span className="yc-step-u">{unit}</span>
          </div>
          {error ? (
            <span className="yc-err" id={`${id}-e`} role={refused.has(field) ? 'alert' : undefined}>
              {error}
            </span>
          ) : null}
          <span className="yc-pf-d">{t('policy.default', { value: `${shipped} ${unit}` })}</span>
        </div>
      </div>
    );
  };

  const toggle = (field: 'enabled' | 'autoAccept', id: string, why: string) => (
    <div className="yc-pf">
      <div className="yc-pf-t">
        <span className="yc-pf-l" id={`${id}-l`}>
          {t(`takeaway.${field}.label`)}
        </span>
        <span className="yc-pf-w" id={`${id}-w`}>
          {why}
        </span>
      </div>
      <div className="yc-pf-c">
        <span className="yc-swl">
          <button
            type="button"
            className="yc-sw"
            role="switch"
            id={id}
            aria-checked={draft[field]}
            aria-labelledby={`${id}-l`}
            aria-describedby={`${id}-w`}
            disabled={save.isPending}
            onClick={() => change({ [field]: !draft[field] })}
          />
          {draft[field] ? t('policy.on') : t('policy.off')}
        </span>
      </div>
    </div>
  );

  const prep = Number.isNaN(draft.prepMinutes) ? saved.prepMinutes : draft.prepMinutes;

  return (
    <>
      {toggle('enabled', 'tk-enabled', t('takeaway.enabled.why'))}
      {toggle(
        'autoAccept',
        'tk-auto',
        t('takeaway.autoAccept.why', { count: saved.acceptWindowMinutes }),
      )}
      {stepper(
        'prepMinutes',
        bounds.prepMinutesMin,
        bounds.prepMinutesMax,
        bounds.prepMinutesStep,
        t('takeaway.prepMinutes.unit'),
        DEFAULT_TAKEAWAY_SETTINGS.prepMinutes,
      )}
      {stepper(
        'lastOrderMinutes',
        bounds.lastOrderMinutesMin,
        bounds.lastOrderMinutesMax,
        bounds.lastOrderMinutesStep,
        t('takeaway.lastOrderMinutes.unit'),
        DEFAULT_TAKEAWAY_SETTINGS.lastOrderMinutes,
      )}
      {stepper(
        'maxInProgress',
        bounds.maxInProgressMin,
        bounds.maxInProgressMax,
        1,
        t('takeaway.maxInProgress.unit'),
        DEFAULT_TAKEAWAY_SETTINGS.maxInProgress,
      )}

      <p className="yc-pol-example yc-tk-preview">
        <PhoneIcon />
        <span>
          <b>{t('takeaway.preview.label')}</b>{' '}
          {draft.enabled ? t('takeaway.preview.on', { count: prep }) : t('takeaway.preview.off')}
        </span>
      </p>
      <p className="yc-tk-menu">
        {t('takeaway.menuNote')}{' '}
        <Link to="/venue/menu" className="yc-lnk">
          {t('takeaway.menuLink')}
        </Link>
      </p>

      <div className="yc-po-save">
        <span className="yc-grow" aria-live="polite">
          {dirty ? t('takeaway.unsaved') : null}
        </span>
        <button
          type="button"
          className="yc-btn yc-btn-pri yc-btn-sm"
          aria-busy={save.isPending}
          onClick={onSave}
        >
          {save.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
          {save.isPending ? t('saving') : t('takeaway.save')}
        </button>
      </div>
    </>
  );
}

function fieldId(field: NumberField): string {
  return `tk-${field}`;
}
