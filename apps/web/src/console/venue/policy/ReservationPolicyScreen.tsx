import type { ReservationPolicy } from '@yalla/api';
import { useManagedVenue, useReservationPolicy, useSaveReservationPolicy } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { useCurrentUser } from '../../../auth/useCurrentUser';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { useVenueOutlet } from '../VenueLayout';
import { AwaitingApprovalPanel } from './AwaitingApprovalPanel';
import {
  POLICY_GROUPS,
  defaultValue,
  differsFromDefaults,
  fieldsInGroup,
  isDefault,
  outOfBounds,
  refusalFor,
  type FieldRefusal,
  type PolicyFieldSpec,
} from './policyFields';

/**
 * Every field of the reservation policy, with a sentence each.
 *
 * This screen is the one place the product's behaviour is configurable, and
 * every field is a number whose meaning is not obvious from its name. "Turn
 * time" is not a concept a cafe owner has. "How long a table is held for a
 * booking — it is why a diner is told the table is theirs until 19:45" is, and
 * that is what is written under the input rather than hidden behind an icon.
 *
 * Three things this screen refuses to do:
 *
 * - **Clamp.** The server refuses an out-of-range value and names the field;
 *   the refusal is shown against that input. A number silently corrected to
 *   something the owner did not choose is worse than being told no.
 * - **Hide the defaults.** What ships is beside every field, with a reset. An
 *   owner who set turn time to 45 minutes and watched bookings collapse needs a
 *   way back without knowing what it used to be.
 * - **Let the affected-bookings count disappear.** Changing a policy never
 *   rewrites an existing booking, and the server reports how many now fall
 *   outside the new rules. That is the most surprising behaviour on the screen
 *   and it stays on the page until it is dismissed — never a toast.
 */
export function ReservationPolicyScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId } = useVenueOutlet();
  const { user } = useCurrentUser();
  // The venue read a venue user may make. The platform one answered every
  // owner 403, and this fell through to 'cafe' for every restaurant.
  const venue = useManagedVenue(user?.scope.venueId ?? undefined);
  const venueType = venue.data?.type === 'restaurant' ? 'restaurant' : 'cafe';

  const policyQuery = useReservationPolicy(branchId ?? undefined);
  const save = useSaveReservationPolicy(branchId ?? undefined);

  // A reducer rather than `useState` plus an effect that copies the query into
  // it: setting state from an effect body is a cascading render, and the
  // "loaded" transition here is genuinely an action rather than a side effect.
  const [state, dispatch] = useReducer(policyDraftReducer, { saved: null, draft: null });
  const [refusal, setRefusal] = useState<FieldRefusal | null>(null);
  const [affected, setAffected] = useState<{ count: number; ids: readonly string[] } | null>(null);

  useEffect(() => {
    if (policyQuery.data) dispatch({ type: 'loaded', policy: policyQuery.data });
  }, [policyQuery.data]);

  const { draft, saved } = state;
  const dirty = useMemo(() => Boolean(draft && saved && !same(draft, saved)), [draft, saved]);
  useUnsavedChangesGuard(dirty);

  const marked = useMemo(() => (draft ? outOfBounds(draft) : []), [draft]);
  const changed = useMemo(
    () => (draft ? differsFromDefaults(draft, venueType) : []),
    [draft, venueType],
  );

  if (!branchId) {
    return (
      <section className="page">
        <p className="muted">{t('menu.noBranch')}</p>
      </section>
    );
  }

  if (policyQuery.isError) {
    return (
      <section className="page">
        <QueryFailureNotice error={policyQuery.error} onRetry={() => void policyQuery.refetch()} />
      </section>
    );
  }

  if (!draft) {
    return (
      <section className="page">
        <p className="muted">{t('loading')}</p>
      </section>
    );
  }

  function set<K extends keyof ReservationPolicy>(key: K, value: ReservationPolicy[K]): void {
    dispatch({ type: 'set', key, value });
    // A refusal is about the value that was sent. Editing the field it named
    // clears it; leaving it up would have somebody reading a complaint about a
    // number they have already changed.
    setRefusal((current) => (current?.field === key ? null : current));
  }

  return (
    <section className="page policy-screen">
      <header className="page-head">
        <h2>{t('nav.policy')}</h2>
        <div className="page-actions">
          {dirty ? <span className="badge badge-warn">{t('hours.unsaved')}</span> : null}
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
            disabled={!dirty || save.isPending}
            onClick={() => {
              setRefusal(null);
              save.mutate(draft, {
                onSuccess: (result) =>
                  setAffected({
                    count: result.affectedExistingReservations,
                    ids: result.affectedReservationIds,
                  }),
                onError: (error) =>
                  setRefusal(refusalFor(error) ?? { field: null, message: t('policy.saveFailed') }),
              });
            }}
          >
            {save.isPending ? t('saving') : t('policy.save')}
          </button>
        </div>
      </header>

      {/* Not a toast. This is the single most surprising behaviour on the
          screen and it stays until somebody dismisses it. */}
      {affected ? (
        <div className={affected.count > 0 ? 'todo policy-affected' : 'todo'}>
          <span className="todo-label">{t('policy.affected.label')}</span>
          <p>
            {affected.count > 0
              ? t('policy.affected.body', { count: affected.count })
              : t('policy.affected.none')}
          </p>
          {affected.count > 0 ? (
            <>
              <p className="small muted">{t('policy.affected.explain')}</p>
              <ul className="small muted affected-ids">
                {affected.ids.slice(0, 10).map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </>
          ) : null}
          <button type="button" className="button" onClick={() => setAffected(null)}>
            {t('common:action.close')}
          </button>
        </div>
      ) : null}

      {refusal && refusal.field === null ? (
        <p className="error" role="alert">
          {refusal.message}
        </p>
      ) : null}

      {/* Where the approval rule's consequence lands: above the fields that
          set it, so an owner sees what "waits for you" actually means. */}
      <AwaitingApprovalPanel branchId={branchId} />

      {POLICY_GROUPS.map((group) => (
        <fieldset key={group} className="policy-group">
          <legend>{t(`policy.group.${group}.title`)}</legend>
          <p className="muted small">{t(`policy.group.${group}.body`)}</p>

          <div className="policy-fields">
            {fieldsInGroup(group).map((field) => (
              <PolicyField
                key={field.key}
                spec={field}
                policy={draft}
                venueType={venueType}
                invalid={marked.includes(field.key)}
                refusal={refusal?.field === field.key ? refusal : null}
                onChange={set}
              />
            ))}
          </div>

          {group === 'money' ? (
            // Said on the screen because it is the field an owner is most
            // likely to change mid-service and the least likely to guess right
            // about: it is snapshotted onto a tab when the tab opens.
            <p className="table-note">{t('policy.serviceChargeNote')}</p>
          ) : null}
        </fieldset>
      ))}

      {changed.length > 0 ? (
        <p className="small muted">{t('policy.changedCount', { count: changed.length })}</p>
      ) : null}
    </section>
  );
}

function PolicyField({
  spec,
  policy,
  venueType,
  invalid,
  refusal,
  onChange,
}: {
  readonly spec: PolicyFieldSpec;
  readonly policy: ReservationPolicy;
  readonly venueType: 'cafe' | 'restaurant';
  readonly invalid: boolean;
  readonly refusal: FieldRefusal | null;
  readonly onChange: <K extends keyof ReservationPolicy>(
    key: K,
    value: ReservationPolicy[K],
  ) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const value = policy[spec.key];
  const shipped = defaultValue(spec.key, venueType);
  const atDefault = isDefault(policy, spec.key, venueType);

  return (
    <div className={`policy-field ${invalid || refusal ? 'is-invalid' : ''}`}>
      <label className="labelled">
        {t(`policy.field.${spec.key}.label`)}

        {spec.kind === 'toggle' ? (
          <label className="switch">
            <input
              type="checkbox"
              checked={value === true}
              onChange={(event) =>
                onChange(spec.key, event.target.checked as ReservationPolicy[typeof spec.key])
              }
            />
            <span className="small">{value === true ? t('policy.on') : t('policy.off')}</span>
          </label>
        ) : (
          <span className="policy-input">
            <input
              className="field numeric"
              type="number"
              inputMode="numeric"
              min={spec.bounds?.min}
              max={spec.bounds?.max}
              value={value === null ? '' : String(value)}
              placeholder={spec.nullable ? t('policy.noLimit') : undefined}
              onChange={(event) =>
                onChange(
                  spec.key,
                  (event.target.value === ''
                    ? spec.nullable
                      ? null
                      : 0
                    : Number(event.target.value)) as ReservationPolicy[typeof spec.key],
                )
              }
            />
            <span className="small muted">{t(`policy.unit.${spec.kind}`)}</span>
          </span>
        )}
      </label>

      {/* One plain sentence, in terms of what somebody experiences. */}
      <p className="policy-why">{t(`policy.field.${spec.key}.why`)}</p>

      <p className="small muted policy-default">
        {t('policy.shipped', { value: String(shipped ?? t('policy.noLimit')) })}
        {!atDefault ? (
          <button
            type="button"
            className="link-button"
            onClick={() => onChange(spec.key, shipped as ReservationPolicy[typeof spec.key])}
          >
            {t('policy.reset')}
          </button>
        ) : null}
      </p>

      {/* The server's own sentence, against the input it is about. */}
      {refusal ? (
        <p className="error small" role="alert">
          {refusal.message}
        </p>
      ) : invalid && spec.bounds ? (
        <p className="table-warn small">
          {t('policy.outOfBounds', { min: spec.bounds.min, max: spec.bounds.max })}
        </p>
      ) : null}
    </div>
  );
}

function same(a: ReservationPolicy, b: ReservationPolicy): boolean {
  return (Object.keys(a) as (keyof ReservationPolicy)[]).every((key) => a[key] === b[key]);
}

interface PolicyDraftState {
  /** As last loaded or last saved. What "discard" goes back to. */
  readonly saved: ReservationPolicy | null;
  readonly draft: ReservationPolicy | null;
}

type PolicyDraftAction =
  | { readonly type: 'loaded'; readonly policy: ReservationPolicy }
  | {
      readonly type: 'set';
      readonly key: keyof ReservationPolicy;
      readonly value: ReservationPolicy[keyof ReservationPolicy];
    }
  | { readonly type: 'discard' };

export function policyDraftReducer(
  state: PolicyDraftState,
  action: PolicyDraftAction,
): PolicyDraftState {
  switch (action.type) {
    case 'loaded':
      // Replaces both. A load that kept a draft would reapply edits on top of
      // somebody else's saved policy without saying so.
      return { saved: action.policy, draft: action.policy };
    case 'set':
      return state.draft
        ? { ...state, draft: { ...state.draft, [action.key]: action.value } }
        : state;
    case 'discard':
      return { ...state, draft: state.saved };
    default:
      return state;
  }
}
