import { defaultPolicyFor, type ReservationPolicy } from '@yalla/api';
import {
  useBranchReadiness,
  useReservationPolicy,
  useReservationPolicyDefaults,
  useSaveReservationPolicy,
} from '@yalla/api/react';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useEffect, useRef, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { InfoIcon, PhoneIcon } from '../../ui/icons';
import { PageHeader } from '../../ui/PageHeader';
import { useToast } from '../../ui/toast';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { useVenueOutlet } from '../VenueLayout';
import {
  PRE_ORDER_CARD_ID,
  PreOrderSettingsCard,
  type PreOrderCardDraft,
} from './PreOrderSettingsCard';
import {
  EXAMPLE_START,
  POLICY_GROUPS,
  changedFields,
  clock,
  differsFromDefaults,
  fieldsInGroup,
  inactiveBecause,
  leadExample,
  outOfBounds,
  refusalFor,
  stepped,
  withServerBounds,
  type PolicyDraft,
  type PolicyFieldSpec,
  type PolicyGroup,
} from './policyFields';

type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * The reservation policy (Policy artboard): every field, with a sentence each,
 * in five groups, and what a diner sees under each group as it is typed.
 *
 * This screen is the one place the product's behaviour is configurable, and
 * every field is a number whose meaning is not obvious from its name. "Turn
 * time" is not a concept a cafe owner has. "How long a table is held for a
 * booking — it is why a diner is told the table is theirs until 19:45" is, and
 * that is what is written beside the stepper rather than hidden behind an icon.
 *
 * Three things this screen refuses to do:
 *
 * - **Clamp.** A number typed outside the server's bounds is marked red and
 *   the save asks for it to be fixed; the steppers stop at the bounds, but a
 *   typed number is never silently corrected to one the owner did not choose.
 * - **Hide the defaults.** What ships is beside every field, with a reset. An
 *   owner who set turn time to 45 minutes and watched bookings collapse needs
 *   a way back without knowing what it used to be.
 * - **Let the affected-bookings count disappear.** Changing a policy never
 *   rewrites an existing booking, and the server reports how many now fall
 *   outside the new rules. That is the most surprising behaviour on the screen
 *   and it stays on the page until it is closed — never a toast.
 */
export function ReservationPolicyScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId, branchName, venueType } = useVenueOutlet();
  const policyQuery = useReservationPolicy(branchId ?? undefined);
  // What ships and the bounds, from the server. A server that predates the
  // route answers 404: the client's own copy for the venue's type stands in.
  const defaultsQuery = useReservationPolicyDefaults(branchId ?? undefined);

  const header = (
    <PageHeader title={t('nav.policy')} sub={t('policy.sub', { branch: branchName ?? '' })} />
  );

  if (!branchId) {
    return (
      <div className="yc-page">
        {header}
        <p className="yc-card yc-empty-line">{t('menu.noBranch')}</p>
      </div>
    );
  }

  if (policyQuery.isError) {
    return (
      <div className="yc-page">
        {header}
        <div className="yc-card yc-ov-pad">
          <QueryFailureNotice
            error={policyQuery.error}
            onRetry={() => void policyQuery.refetch()}
          />
        </div>
      </div>
    );
  }

  const defaults =
    defaultsQuery.data?.defaults ??
    (defaultsQuery.isError ? defaultPolicyFor(venueType ?? 'cafe') : null);

  if (!policyQuery.data || !defaults) {
    return (
      <div className="yc-page">
        {header}
        <p className="yc-card yc-empty-line" role="status">
          {t('loading')}
        </p>
      </div>
    );
  }

  // The form owns its draft from the moment the policy arrives, and another
  // branch is another form: nothing typed, and no result, carries over.
  return (
    <PolicyForm
      key={branchId}
      branchId={branchId}
      branchName={branchName ?? ''}
      defaults={defaults}
      fields={withServerBounds(defaultsQuery.data?.bounds)}
      initial={policyQuery.data}
    />
  );
}

function PolicyForm({
  branchId,
  branchName,
  defaults,
  fields,
  initial,
}: {
  readonly branchId: string;
  readonly branchName: string;
  /** What this branch ships with: the server's copy. */
  readonly defaults: ReservationPolicy;
  /** Every field, with the server's bounds. */
  readonly fields: readonly PolicyFieldSpec[];
  readonly initial: ReservationPolicy;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const save = useSaveReservationPolicy(branchId);
  // Saving the form, changed or not, is what the checklist counts as reviewed.
  const readiness = useBranchReadiness(branchId);
  const unreviewed = readiness.data?.reservationPolicyReviewed === false;

  /** As last loaded or saved: what "discard" goes back to. */
  const [saved, setSaved] = useState<PolicyDraft>(initial);
  const [draft, setDraft] = useState<PolicyDraft>(initial);
  /** The fields the last save's refusal named: marked until they are edited. */
  const [refused, setRefused] = useState<ReadonlySet<keyof ReservationPolicy>>(() => new Set());
  const [result, setResult] = useState<{ readonly affected: number } | null>(null);
  /**
   * The field a refused save sends the cursor to, once the inputs the save
   * disabled are enabled again: focusing a disabled input does nothing.
   */
  const focusTo = useRef<keyof ReservationPolicy | null>(null);
  useEffect(() => {
    if (!focusTo.current || save.isPending) return;
    document.getElementById(inputId(focusTo.current))?.focus();
    focusTo.current = null;
  });

  const dirtyKeys = changedFields(draft, saved);
  const dirty = dirtyKeys.length > 0;
  /**
   * The pre-order card's draft. Its own endpoint and its own button, but the
   * bar at the foot is the page's: it says the card holds changes, and its
   * Save and Discard take the card's with the policy's (live QA 2026-10-21).
   */
  const [preOrders, setPreOrders] = useState<PreOrderCardDraft | null>(null);
  const preOrdersDirty = preOrders?.dirty ?? false;
  useUnsavedChangesGuard(dirty);
  const invalid = outOfBounds(draft, fields);
  const fromDefault = differsFromDefaults(draft, defaults);

  function set<K extends keyof ReservationPolicy>(key: K, value: PolicyDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
    // A result is about the policy that was saved; editing starts a new one.
    setResult(null);
    setRefused((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  function onSave() {
    if (save.isPending) return;
    const first = invalid[0];
    if (first) {
      toast.say(t('policy.fixFirst'), { tone: 'error' });
      document.getElementById(inputId(first))?.focus();
      return;
    }
    // The card's changes go with the page's; a card that would send nothing
    // (its minutes out of bounds) has said why, and holds the policy back too.
    if (preOrders?.dirty && !preOrders.save()) return;
    // Unchanged, the save still has a use while nobody has confirmed the
    // policy: it is what ticks "policy reviewed" for a venue happy with the
    // defaults, which otherwise could only get there by changing something.
    if (!dirty && !unreviewed) {
      if (!preOrders?.dirty) toast.say(t('policy.noChanges'));
      return;
    }
    setRefused(new Set());
    save.mutate(draft as ReservationPolicy, {
      onSuccess: (outcome) => {
        setSaved(outcome.policy);
        setDraft(outcome.policy);
        setResult({ affected: outcome.affectedExistingReservations });
      },
      onError: (error) => {
        const refusal = refusalFor(error);
        const first = refusal?.fields[0];
        if (refusal && first) {
          setRefused(new Set(refusal.fields));
          focusTo.current = first;
        }
        toast.say(t('policy.saveFailed'), { tone: 'error' });
      },
    });
  }

  const barText =
    invalid.length > 0 || preOrders?.invalid
      ? t('policy.bar.outOfBounds')
      : dirty && preOrdersDirty
        ? t('policy.bar.unsavedWithPreOrders', { count: dirtyKeys.length })
        : preOrdersDirty
          ? t('policy.bar.unsavedPreOrders')
          : dirty
            ? t('policy.bar.unsaved', { count: dirtyKeys.length })
            : unreviewed
              ? t('policy.bar.unreviewed')
              : t('policy.bar.saved');

  return (
    <div className="yc-page yc-pol-page">
      <PageHeader
        title={t('nav.policy')}
        sub={t('policy.sub', { branch: branchName })}
        actions={
          <span className="yc-pill yc-pill-brand">
            {fromDefault.length > 0
              ? t('policy.changedCount', { count: fromDefault.length })
              : t('policy.allDefault')}
          </span>
        }
      />

      {/* Not a toast. This is the single most surprising behaviour on the
          screen and it stays until somebody closes it. */}
      {result ? (
        <div
          className={
            result.affected > 0 ? 'yc-banner yc-banner-amber' : 'yc-banner yc-banner-green'
          }
          role="status"
        >
          <InfoIcon />
          <span className="yc-grow yc-pol-result">
            <b>
              {result.affected > 0
                ? t('policy.result.affectedTitle', { count: result.affected })
                : t('policy.result.noneTitle')}
            </b>
            <span>
              {result.affected > 0 ? t('policy.result.affectedBody') : t('policy.result.noneBody')}
            </span>
          </span>
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            onClick={() => setResult(null)}
          >
            {t('common:action.close')}
          </button>
        </div>
      ) : null}

      <div className="yc-pol">
        <nav className="yc-card yc-toc" aria-label={t('policy.tocLabel')}>
          {POLICY_GROUPS.map((group) => {
            const changed = fieldsInGroup(group, fields).filter((field) =>
              fromDefault.includes(field.key),
            ).length;
            return (
              <a key={group} href={`#${groupId(group)}`}>
                <span>{t(`policy.group.${group}.title`)}</span>
                {changed > 0 ? (
                  <span
                    className="yc-toc-n"
                    role="img"
                    aria-label={t('policy.tocChanged', { count: changed })}
                  >
                    {changed}
                  </span>
                ) : null}
              </a>
            );
          })}
          {/* Saved on its own (its own endpoint), but read with the rest. */}
          <a href={`#${PRE_ORDER_CARD_ID}`}>
            <span>{t('preOrders.title')}</span>
          </a>
        </nav>

        <div className="yc-pol-groups">
          {POLICY_GROUPS.map((group) => (
            <section
              key={group}
              className="yc-card"
              id={groupId(group)}
              aria-labelledby={`${groupId(group)}-h`}
            >
              <div className="yc-card-h">
                <div>
                  <h2 className="yc-h2" id={`${groupId(group)}-h`}>
                    {t(`policy.group.${group}.title`)}
                  </h2>
                  <p className="yc-cap">{t(`policy.group.${group}.body`)}</p>
                </div>
              </div>
              {fieldsInGroup(group, fields).map((field) => (
                <PolicyField
                  key={field.key}
                  spec={field}
                  policy={draft}
                  shipped={defaults[field.key]}
                  invalid={invalid.includes(field.key)}
                  refused={refused.has(field.key)}
                  disabled={save.isPending}
                  onChange={set}
                />
              ))}
              <p className="yc-pol-example">
                <PhoneIcon />
                <span>
                  <b>{t('policy.guestSees')}</b> {groupExample(group, draft, t, locale)}
                </span>
              </p>
            </section>
          ))}
          <PreOrderSettingsCard branchId={branchId} onDraft={setPreOrders} />
        </div>
      </div>

      <div className="yc-savebar" role="region" aria-label={t('policy.saveBar')}>
        <span className="yc-grow" aria-live="polite">
          {barText}
        </span>
        {dirty || preOrdersDirty ? (
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            disabled={save.isPending}
            onClick={() => {
              setDraft(saved);
              setRefused(new Set());
              preOrders?.discard();
              toast.say(t('policy.discarded'));
            }}
          >
            {t('policy.discard')}
          </button>
        ) : null}
        <button
          type="button"
          className="yc-btn yc-btn-pri yc-btn-sm"
          aria-busy={save.isPending}
          onClick={onSave}
        >
          {save.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
          {save.isPending ? t('saving') : t('policy.save')}
        </button>
      </div>
    </div>
  );
}

const groupId = (group: PolicyGroup) => `pol-${group}`;
const inputId = (key: keyof ReservationPolicy) => `pol-in-${key}`;

/** One field: what it is, why it matters, its stepper or switch, and the default with a way back. */
function PolicyField({
  spec,
  policy,
  shipped,
  invalid,
  refused,
  disabled,
  onChange,
}: {
  readonly spec: PolicyFieldSpec;
  readonly policy: PolicyDraft;
  /** The value this field ships with. */
  readonly shipped: ReservationPolicy[keyof ReservationPolicy];
  readonly invalid: boolean;
  /** The server refused this field's value although it looked fine here. */
  readonly refused: boolean;
  readonly disabled: boolean;
  readonly onChange: <K extends keyof ReservationPolicy>(key: K, value: PolicyDraft[K]) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const key = spec.key;
  const value = policy[key];
  const changed = value !== shipped;
  const label = t(`policy.field.${key}.label`);
  const labelId = `pol-l-${key}`;
  const whyId = `pol-w-${key}`;
  const errorId = `pol-e-${key}`;
  const offId = `pol-o-${key}`;
  // Nothing for it to do as the rest of the form stands: offered, but not to
  // be changed, with the reason beside it rather than a switch that does nothing.
  const inactive = inactiveBecause(key, policy);
  const unit = spec.kind === 'toggle' ? '' : t(`policy.unit.${spec.kind}`);

  const error = invalid
    ? spec.bounds && spec.bounds.max !== null
      ? t('policy.outOfBounds', { min: spec.bounds.min, max: spec.bounds.max })
      : t('policy.atLeast', { min: spec.bounds?.min ?? 0 })
    : refused
      ? t('policy.refused')
      : null;

  let why = t(`policy.field.${key}.why`);
  if (key === 'minLeadMinutes') {
    const lead = leadExample(policy.minLeadMinutes);
    why = `${why} ${
      lead.kind === 'zero'
        ? t('policy.lead.zero')
        : lead.kind === 'sameDay'
          ? t('policy.lead.sameDay', { minutes: policy.minLeadMinutes })
          : t('policy.lead.until', { minutes: policy.minLeadMinutes, time: lead.time })
    }`;
  }

  const shippedText =
    spec.kind === 'toggle'
      ? shipped
        ? t('policy.defaultOn')
        : t('policy.defaultOff')
      : shipped === null
        ? t('policy.noLimit')
        : `${String(shipped)} ${unit}`;

  return (
    <div className={changed ? 'yc-pf is-changed' : 'yc-pf'}>
      <div className="yc-pf-t">
        <span className="yc-pf-l" id={labelId}>
          {label}
          {changed ? (
            <span className="yc-pill yc-pill-brand yc-pill-xs">{t('policy.changed')}</span>
          ) : null}
        </span>
        <span className="yc-pf-w" id={whyId}>
          {why}
        </span>
        {inactive ? (
          <span className="yc-pf-w yc-pf-off" id={offId}>
            {t(`policy.inactive.${inactive}`)}
          </span>
        ) : null}
      </div>
      <div className="yc-pf-c">
        {spec.kind === 'toggle' ? (
          <span className="yc-swl">
            <button
              type="button"
              className="yc-sw"
              role="switch"
              id={inputId(key)}
              aria-checked={value === true}
              aria-labelledby={labelId}
              aria-describedby={inactive ? `${whyId} ${offId}` : whyId}
              disabled={disabled || inactive !== null}
              onClick={() => onChange(key, !(value === true))}
            />
            {value === true ? t('policy.on') : t('policy.off')}
          </span>
        ) : (
          <Stepper
            spec={spec}
            value={typeof value === 'number' ? value : null}
            unit={unit}
            label={label}
            labelId={labelId}
            describedBy={error ? `${whyId} ${errorId}` : whyId}
            invalid={error !== null}
            disabled={disabled}
            onChange={(next) => onChange(key, next)}
          />
        )}
        {error ? (
          // Said at once only when a save was refused; while typing, the
          // field points at it (`aria-describedby`) rather than interrupting.
          <span className="yc-err" id={errorId} role={refused ? 'alert' : undefined}>
            {error}
          </span>
        ) : null}
        <span className="yc-pf-d">
          {t('policy.default', { value: shippedText })}
          {changed ? (
            <button
              type="button"
              className="yc-lnk"
              disabled={disabled || inactive !== null}
              onClick={() => onChange(key, shipped)}
            >
              {t('policy.reset')}
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/**
 * − number +, with the unit after it.
 *
 * The number is typed as text and kept as typed while the field has the focus,
 * so a half-typed "12." is not rewritten under the cursor; what the draft gets
 * is the number it parses to, or null for an empty field.
 */
function Stepper({
  spec,
  value,
  unit,
  label,
  labelId,
  describedBy,
  invalid,
  disabled,
  onChange,
}: {
  readonly spec: PolicyFieldSpec;
  readonly value: number | null;
  readonly unit: string;
  readonly label: string;
  readonly labelId: string;
  readonly describedBy: string;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: number | null) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [typing, setTyping] = useState<string | null>(null);
  const decimals = spec.kind === 'percent';
  const shown = typing ?? (value === null ? '' : String(value));

  return (
    <div className={invalid ? 'yc-step is-bad' : 'yc-step'}>
      <button
        type="button"
        aria-label={t('policy.decrease', { field: label })}
        disabled={disabled}
        onClick={() => {
          setTyping(null);
          onChange(stepped(spec, value, -1));
        }}
      >
        −
      </button>
      <input
        id={inputId(spec.key)}
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={shown}
        placeholder={spec.nullable ? t('policy.noLimit') : undefined}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        disabled={disabled}
        onChange={(event) => {
          const text = event.target.value.replace(decimals ? /[^\d.,]/gu : /\D/gu, '');
          setTyping(text);
          const parsed = text === '' ? null : Number(text.replace(',', '.'));
          // Something that is not a number yet ("1.2.3") is an empty field to the draft: marked, not guessed.
          onChange(parsed !== null && Number.isFinite(parsed) ? parsed : null);
        }}
        onBlur={() => setTyping(null)}
      />
      <button
        type="button"
        aria-label={t('policy.increase', { field: label })}
        disabled={disabled}
        onClick={() => {
          setTyping(null);
          onChange(stepped(spec, value, 1));
        }}
      >
        +
      </button>
      <span className="yc-step-u">{unit}</span>
    </div>
  );
}

/** What a diner sees, for one group, as typed (Policy artboard's examples). */
export function groupExample(
  group: PolicyGroup,
  policy: PolicyDraft,
  t: Translate,
  locale: Locale,
): string {
  const n = (value: number | null) => value ?? 0;
  switch (group) {
    case 'booking': {
      const hours = Math.round((n(policy.cancellationDeadlineMinutes) / 60) * 10) / 10;
      const window = t('policy.example.window', { count: n(policy.bookingWindowDays) });
      const cancel = t('policy.example.cancel', {
        count: hours,
        hours: new Intl.NumberFormat(intlTag(locale), { maximumFractionDigits: 1 }).format(hours),
      });
      return t('policy.example.quote', { text: `${window} ${cancel}` });
    }
    case 'holding':
      return t('policy.example.quote', {
        text: t('policy.example.holding', {
          start: clock(EXAMPLE_START),
          end: clock(EXAMPLE_START + n(policy.turnTimeMinutes)),
        }),
      });
    case 'lateness':
      return t('policy.example.lateness', {
        nudgeAt: clock(EXAMPLE_START + n(policy.lateNudgeAfterMinutes)),
        heldUntil: clock(EXAMPLE_START + n(policy.graceMinutes)),
        count: n(policy.graceExtensionMinutes),
      });
    case 'approval':
      if (policy.autoConfirm !== true) {
        return policy.autoConfirmGuestsWithGoodRecord === true
          ? t('policy.example.approvalGoodRecord')
          : t('policy.example.approvalManual');
      }
      return policy.approvalRequiredAbovePartySize === null
        ? t('policy.example.approvalAll')
        : t('policy.example.approvalAbove', { count: policy.approvalRequiredAbovePartySize });
    case 'scanning':
      return policy.unverifiedScansNeedAdmission === false
        ? t('policy.example.unverifiedScanOrders')
        : t('policy.example.unverifiedScanWaits');
    case 'money':
      return n(policy.serviceChargePercent) > 0
        ? t('policy.example.serviceCharge', { percent: policy.serviceChargePercent })
        : t('policy.example.noServiceCharge');
    default:
      return '';
  }
}
