import {
  DEFAULT_PRE_ORDER_SETTINGS,
  ValidationError,
  type PreOrderSettings,
  type PreOrderSettingsInput,
} from '@yalla/api';
import { usePreOrderSettings, useSavePreOrderSettings } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { useToast } from '../../ui/toast';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';

/** The card's anchor, for the policy's contents. */
export const PRE_ORDER_CARD_ID = 'pol-preorders';

/** The minutes' step, as the policy's own steppers move. */
const STEP = 5;

/**
 * Pre-orders on a booking (2026-10-21), on the Policy screen: whether this
 * branch takes them, and how long before a booking the waiter's card comes up.
 *
 * Its own card with its own save, because it is its own endpoint
 * (`PUT …/pre-order-settings`) and the policy's save bar does not send it. The
 * third setting — which dishes are not offered — is on the Menu, on each dish's
 * row; this card says how many and links there. A save reads the settings
 * fresh first and changes only what was changed here, so it never undoes a
 * switch made there, or another manager's save (review S6).
 *
 * The rules a manager cannot change are said too, because they are what the
 * staff will be asked about: the guest's two-hour lock, the "on your way"
 * question, and that nothing is cooked until a waiter says the party is coming.
 */
export function PreOrderSettingsCard({ branchId }: { readonly branchId: string }) {
  const { t } = useTranslation(['admin', 'common']);
  const query = usePreOrderSettings(branchId);
  const titleId = `${PRE_ORDER_CARD_ID}-h`;

  return (
    <section className="yc-card" id={PRE_ORDER_CARD_ID} aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('preOrders.title')}
          </h2>
          <p className="yc-cap">{t('preOrders.body')}</p>
        </div>
      </div>
      {query.isError ? (
        <div className="yc-ov-pad">
          <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : query.data ? (
        // Another branch is another form: nothing typed carries over.
        <PreOrderForm key={branchId} branchId={branchId} saved={query.data} />
      ) : (
        <p className="yc-empty-line" role="status">
          {t('loading')}
        </p>
      )}
    </section>
  );
}

function PreOrderForm({
  branchId,
  saved,
}: {
  readonly branchId: string;
  /** As the server last answered: what the draft started from and what a save keeps. */
  readonly saved: PreOrderSettings;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const save = useSavePreOrderSettings(branchId);

  const [accepts, setAccepts] = useState(saved.acceptsPreOrders);
  /** As typed: null for an empty field (marked, never guessed). */
  const [minutes, setMinutes] = useState<number | null>(saved.minutesBefore);
  const [typing, setTyping] = useState<string | null>(null);
  /** The server refused the minutes although they looked fine here. */
  const [refused, setRefused] = useState(false);
  /** The saved values the draft started from: what "changed here" is measured against. */
  const [base, setBase] = useState({
    accepts: saved.acceptsPreOrders,
    minutes: saved.minutesBefore,
  });

  // A read brought other values: another manager's save, or this card's own.
  // An untouched form takes them in — "Unsaved changes" the manager never
  // made, which a save would then revert, is worse than none (review NIT 13).
  // A touched one keeps what was typed.
  if (saved.acceptsPreOrders !== base.accepts || saved.minutesBefore !== base.minutes) {
    if (accepts === base.accepts && minutes === base.minutes) {
      setAccepts(saved.acceptsPreOrders);
      setMinutes(saved.minutesBefore);
      setTyping(null);
    }
    setBase({ accepts: saved.acceptsPreOrders, minutes: saved.minutesBefore });
  }

  const { minutesBeforeMin: min, minutesBeforeMax: max } = saved.bounds;
  const outOfBounds = minutes === null || minutes < min || minutes > max;
  const dirty = accepts !== saved.acceptsPreOrders || minutes !== saved.minutesBefore;
  useUnsavedChangesGuard(dirty);

  const label = t('preOrders.minutesBefore.label');
  const error = outOfBounds
    ? t('policy.outOfBounds', { min, max })
    : refused
      ? t('policy.refused')
      : null;
  const excluded = saved.excludedMenuItemIds.length;

  function changeMinutes(next: number | null) {
    setMinutes(next);
    setRefused(false);
  }

  function onSave() {
    if (save.isPending) return;
    if (outOfBounds || minutes === null) {
      toast.say(t('policy.fixFirst'), { tone: 'error' });
      document.getElementById('po-minutes')?.focus();
      return;
    }
    if (!dirty) {
      toast.say(t('preOrders.noChanges'));
      return;
    }
    const minutesBefore = minutes;
    const from = base;
    // On the settings as the server has them now: a field changed here wins,
    // the rest — the Menu's switches included — is kept as it is there.
    const change = (fresh: PreOrderSettings): PreOrderSettingsInput => ({
      acceptsPreOrders: accepts !== from.accepts ? accepts : fresh.acceptsPreOrders,
      minutesBefore: minutesBefore !== from.minutes ? minutesBefore : fresh.minutesBefore,
      excludedMenuItemIds: fresh.excludedMenuItemIds,
    });
    save.mutate(change, {
      onSuccess: () => toast.say(t('preOrders.saved')),
      onError: (error) => {
        if (
          error instanceof ValidationError &&
          error.violations.some((violation) => violation.field === 'minutesBefore')
        ) {
          setRefused(true);
        }
        toast.say(t('preOrders.saveFailed'), { tone: 'error' });
      },
    });
  }

  return (
    <>
      <div className="yc-pf">
        <div className="yc-pf-t">
          <span className="yc-pf-l" id="po-accept-l">
            {t('preOrders.accept.label')}
          </span>
          <span className="yc-pf-w" id="po-accept-w">
            {t('preOrders.accept.why')}
          </span>
        </div>
        <div className="yc-pf-c">
          <span className="yc-swl">
            <button
              type="button"
              className="yc-sw"
              role="switch"
              id="po-accept"
              aria-checked={accepts}
              aria-labelledby="po-accept-l"
              aria-describedby="po-accept-w"
              disabled={save.isPending}
              onClick={() => setAccepts((now) => !now)}
            />
            {accepts ? t('policy.on') : t('policy.off')}
          </span>
        </div>
      </div>

      <div className="yc-pf">
        <div className="yc-pf-t">
          <span className="yc-pf-l" id="po-minutes-l">
            {label}
          </span>
          <span className="yc-pf-w" id="po-minutes-w">
            {t('preOrders.minutesBefore.why')}
          </span>
        </div>
        <div className="yc-pf-c">
          <div className={error ? 'yc-step is-bad' : 'yc-step'}>
            <button
              type="button"
              aria-label={t('policy.decrease', { field: label })}
              disabled={save.isPending}
              onClick={() => {
                setTyping(null);
                changeMinutes(Math.max(min, Math.min(max, (minutes ?? min) - STEP)));
              }}
            >
              −
            </button>
            <input
              id="po-minutes"
              inputMode="numeric"
              value={typing ?? (minutes === null ? '' : String(minutes))}
              aria-labelledby="po-minutes-l"
              aria-describedby={error ? 'po-minutes-w po-minutes-e' : 'po-minutes-w'}
              aria-invalid={error !== null}
              disabled={save.isPending}
              onChange={(event) => {
                const text = event.target.value.replace(/\D/gu, '');
                setTyping(text);
                changeMinutes(text === '' ? null : Number(text));
              }}
              onBlur={() => setTyping(null)}
            />
            <button
              type="button"
              aria-label={t('policy.increase', { field: label })}
              disabled={save.isPending}
              onClick={() => {
                setTyping(null);
                changeMinutes(Math.max(min, Math.min(max, (minutes ?? min) + STEP)));
              }}
            >
              +
            </button>
            <span className="yc-step-u">{t('preOrders.minutesBefore.unit')}</span>
          </div>
          {error ? (
            <span className="yc-err" id="po-minutes-e" role={refused ? 'alert' : undefined}>
              {error}
            </span>
          ) : null}
          <span className="yc-pf-d">
            {t('policy.default', {
              value: `${DEFAULT_PRE_ORDER_SETTINGS.minutesBefore} ${t('policy.unit.minutes')}`,
            })}
          </span>
        </div>
      </div>

      <div className="yc-po-rules">
        <h3 className="yc-h3">{t('preOrders.rules.title')}</h3>
        <ul>
          <li>{t('preOrders.rules.lock', { count: saved.editableUntilHoursBefore })}</li>
          <li>{t('preOrders.rules.ask', { minutes: saved.onYourWayMinutesBefore })}</li>
          <li>{t('preOrders.rules.waiter')}</li>
          <li>{t('preOrders.rules.price')}</li>
        </ul>
        <p>
          {excluded > 0 ? t('preOrders.dishes', { count: excluded }) : t('preOrders.dishesAll')}{' '}
          <Link to="/venue/menu" className="yc-lnk">
            {t('preOrders.dishesLink')}
          </Link>
        </p>
      </div>

      <div className="yc-po-save">
        <span className="yc-grow" aria-live="polite">
          {dirty ? t('preOrders.unsaved') : null}
        </span>
        <button
          type="button"
          className="yc-btn yc-btn-pri yc-btn-sm"
          aria-busy={save.isPending}
          onClick={onSave}
        >
          {save.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
          {save.isPending ? t('saving') : t('preOrders.save')}
        </button>
      </div>
    </>
  );
}
