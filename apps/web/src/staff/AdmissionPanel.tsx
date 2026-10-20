import {
  ApiError,
  isOffline,
  isTabAdmissionDecided,
  newCommandId,
  type TabAwaitingAdmission,
} from '@yalla/api';
import { useAdmitTab, useRejectTab } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ICONS, RailSection } from './FloorRail';
import { useBranchFormat } from './useBranchFormat';

/**
 * Tables that scanned with no verified number, waiting for a waiter
 * (2026-10-20).
 *
 * A printed QR code can be photographed and scanned from anywhere, so a scan
 * whose host proved no number opens a tab that cannot order yet. The waiter is
 * the one who can see whether anybody is sitting there:
 *
 * - **Admit** lets the table order. One tap: it changes nothing anybody would
 *   regret.
 * - **Reject** asks first. It closes the tab, and when the scan itself seated
 *   the table it frees it — a party really there would have to scan again — or,
 *   when the scan took a table held for a late booking, gives it back to that
 *   booking (the server puts it back to Held).
 *
 * Both are online only and never queued: a reject frees a table, and an
 * offline tablet cannot see whether somebody sat down there since. Each tap is
 * its own command id; the server answers a repeat as the tab stands.
 */

/**
 * Whether the table was held for a late booking when a scan took it: its next
 * booking has started and is still not seated. Rejecting such a scan gives the
 * table back to that booking (the server returns it to Held), and the screens
 * say so rather than "frees the table" (UG review S3).
 */
export function wasHeldForLateParty(
  detail:
    | { readonly nextReservationId: string | null; readonly nextReservationStartUtc: string | null }
    | undefined,
  nowMs: number,
): boolean {
  if (!detail?.nextReservationId || !detail.nextReservationStartUtc) return false;
  const start = Date.parse(detail.nextReservationStartUtc);
  return Number.isFinite(start) && start <= nowMs;
}

/** What a decision did, for the floor's notice. */
export interface AdmissionOutcome {
  readonly kind: 'admitted' | 'rejected';
  readonly tableLabel: string;
  /** On a reject: whether the table was freed. */
  readonly tableFreed: boolean;
  /** On a reject that freed it: the table went back to the late booking it was held for. */
  readonly heldAgain: boolean;
}

/** The one table a decision is about: from the rail's list, or the floor's own flag. */
export interface AdmissionSubject {
  readonly tabId: string;
  readonly tableLabel: string;
  /** Rejecting frees the table. Unknown (null) from the floor's flag alone. */
  readonly sittingSeatedByScan: boolean | null;
  /**
   * The table's next booking had started and was not seated before the scan
   * took the table — it was held for that late party, and a reject that frees
   * it gives it back to them (Held, not Free). From the floor as it stands.
   */
  readonly heldForLateParty?: boolean | undefined;
}

export interface AdmissionSectionProps {
  readonly branchId: string;
  readonly waiting: readonly TabAwaitingAdmission[];
  readonly timeZoneId: string;
  readonly loading: boolean;
  /** The list could not be read: said, rather than shown as nobody waiting. */
  readonly failed: boolean;
  readonly online: boolean;
  readonly onDecided: (outcome: AdmissionOutcome) => void;
  /** Whether a table was held for a late booking before the scan took it (see `AdmissionSubject`). */
  readonly heldForLateParty?: ((tableId: string) => boolean) | undefined;
}

/**
 * The rail's section. Only there while somebody waits (or the list could not
 * be read): an empty heading on every shift would teach the floor to skip it.
 */
export function AdmissionSection(props: AdmissionSectionProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(props.timeZoneId);
  const { waiting, onDecided } = props;
  const listRef = useRef<HTMLUListElement>(null);
  /**
   * A card a decision is taking away, by its place in the list: when it goes,
   * the focus moves to the card now in that place (or the one before), and to
   * the rail when none is left — never to the page's top (review N3).
   */
  const leaving = useRef<{ readonly tabId: string; readonly index: number } | null>(null);
  const decided = useCallback(
    (outcome: AdmissionOutcome, tabId: string, index: number) => {
      if (listRef.current?.contains(document.activeElement)) leaving.current = { tabId, index };
      onDecided(outcome);
    },
    [onDecided],
  );
  useEffect(() => {
    const gone = leaving.current;
    if (!gone || waiting.some((entry) => entry.tabId === gone.tabId)) return;
    leaving.current = null;
    const cards = listRef.current?.querySelectorAll<HTMLElement>(':scope > li') ?? [];
    const next = cards[Math.min(gone.index, cards.length - 1)];
    next?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }, [waiting]);
  // The last card went with the section: the rail keeps the focus.
  const rail = useRef<HTMLElement | null>(null);
  useEffect(() => {
    rail.current = listRef.current?.closest('aside') ?? null;
  });
  useEffect(
    () => () => {
      const aside = rail.current;
      if (!leaving.current || !aside) return;
      leaving.current = null;
      if (!aside.hasAttribute('tabindex')) aside.setAttribute('tabindex', '-1');
      aside.focus();
    },
    [],
  );

  if (props.loading || (waiting.length === 0 && !props.failed)) return null;

  return (
    <RailSection
      title={t('admission.title')}
      count={waiting.length}
      tone="waiting"
      icon={ICONS.scan}
    >
      {props.failed && waiting.length === 0 ? (
        <p className="ft-rail-empty is-failed">{t('admission.unreachable')}</p>
      ) : (
        <ul className="ft-items" ref={listRef}>
          {waiting.map((entry, index) => {
            const minutes = Math.max(0, format.minutesSince(entry.openedAtUtc));
            const who = [
              entry.hostDisplayName ? t('admission.host', { name: entry.hostDisplayName }) : null,
              t('admission.phones', { count: entry.participantCount }),
              entry.roomName,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={entry.tabId} className="ft-item admission-card">
                <div className="ft-item-top">
                  <b>{t('table.title', { label: entry.tableLabel })}</b>
                  <span className="badge badge-warn">{t('admission.unverified')}</span>
                  <span className="ft-item-age">
                    {minutes < 1
                      ? t('admission.scannedJustNow')
                      : t('admission.scanned', { count: minutes })}
                  </span>
                </div>
                <p className="admission-who">{who}</p>
                <AdmissionDecision
                  branchId={props.branchId}
                  subject={{
                    ...entry,
                    heldForLateParty: props.heldForLateParty?.(entry.tableId) ?? false,
                  }}
                  online={props.online}
                  variant="rail"
                  onDecided={(outcome) => decided(outcome, entry.tabId, index)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </RailSection>
  );
}

export interface AdmissionDecisionProps {
  readonly branchId: string;
  readonly subject: AdmissionSubject;
  readonly online: boolean;
  /** The rail's buttons, or the table panel's. */
  readonly variant: 'rail' | 'panel';
  readonly onDecided: (outcome: AdmissionOutcome) => void;
}

const BUTTONS = {
  rail: {
    admit: 'ft-btn ft-btn-ok',
    reject: 'ft-btn ft-btn-secondary',
    confirm: 'ft-btn ft-btn-danger',
    cancel: 'ft-btn ft-btn-secondary',
    row: 'ft-item-actions',
    note: 'table-note',
    warn: 'table-warn',
  },
  panel: {
    admit: 'tp-btn tp-ok',
    reject: 'tp-btn tp-danger',
    confirm: 'tp-btn tp-danger-fill',
    cancel: 'tp-btn tp-sec',
    row: 'tp-row',
    note: 'tp-hint',
    warn: 'tp-warn',
  },
} as const;

/** Admit, and Reject behind its question: the same on the rail and in the table panel. */
export function AdmissionDecision({
  branchId,
  subject,
  online,
  variant,
  onDecided,
}: AdmissionDecisionProps) {
  const { t } = useTranslation(['staff', 'common']);
  const admit = useAdmitTab(branchId);
  const reject = useRejectTab(branchId);
  const titleId = useId();
  const [asking, setAsking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * A send is under way. A ref, not the mutations' pending state: two taps in
   * one frame both run before that state reaches a render.
   */
  const sending = useRef(false);
  const questionRef = useRef<HTMLDivElement>(null);
  const classes = BUTTONS[variant];
  const busy = admit.isPending || reject.isPending;
  const off = busy || !online;

  // The question replaces the button that asked it: focus follows it there.
  useEffect(() => {
    if (asking) questionRef.current?.focus({ preventScroll: true });
  }, [asking]);

  function refused(error: unknown) {
    sending.current = false;
    setFailure(
      isTabAdmissionDecided(error)
        ? t('admission.decidedElsewhere')
        : error instanceof ApiError && error.code === 'conflicting-state'
          ? // Orders were keyed on it: somebody is there. Admit is the way on.
            t('admission.hasOrders')
          : error instanceof ApiError && error.code === 'table-state-conflict'
            ? // Another waiter moved the table under this reject (review N4).
              t('admission.tableChanged')
            : isOffline(error)
              ? t('admission.needsOnline')
              : t('admission.failed'),
    );
  }

  function decide(kind: 'admit' | 'reject') {
    if (sending.current || !online) return;
    sending.current = true;
    setFailure(null);
    const command = { tabId: subject.tabId, clientCommandId: newCommandId() };
    if (kind === 'admit') {
      admit.mutate(command, {
        onSuccess: () => {
          sending.current = false;
          onDecided({
            kind: 'admitted',
            tableLabel: subject.tableLabel,
            tableFreed: false,
            heldAgain: false,
          });
        },
        onError: refused,
      });
      return;
    }
    reject.mutate(command, {
      onSuccess: (tab) => {
        sending.current = false;
        setAsking(false);
        const freed = tab.admission.tableFreed === true;
        onDecided({
          kind: 'rejected',
          tableLabel: subject.tableLabel,
          tableFreed: freed,
          heldAgain: freed && subject.heldForLateParty === true,
        });
      },
      onError: refused,
    });
  }

  return (
    <>
      {asking ? (
        <div
          ref={questionRef}
          className={variant === 'panel' ? 'tp-confirm' : 'admission-confirm'}
          role="group"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <h3 id={titleId}>{t('admission.confirmTitle', { label: subject.tableLabel })}</h3>
          <p className={classes.note}>
            {subject.sittingSeatedByScan === false
              ? t('admission.confirmKeeps')
              : subject.sittingSeatedByScan === true
                ? subject.heldForLateParty
                  ? // The scan took a table held for a late booking: it goes back to them.
                    t('admission.confirmHeld')
                  : t('admission.confirmFrees')
                : t('admission.confirmMayFree')}
          </p>
          <div className={classes.row}>
            <button
              type="button"
              className={classes.cancel}
              disabled={busy}
              onClick={() => {
                setAsking(false);
                setFailure(null);
              }}
            >
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className={classes.confirm}
              disabled={off}
              onClick={() => decide('reject')}
            >
              {reject.isPending ? t('approvals.sending') : t('admission.confirmReject')}
            </button>
          </div>
        </div>
      ) : (
        <div className={classes.row}>
          <button
            type="button"
            className={classes.reject}
            disabled={off}
            // Every card has one: the name says which table (review N1).
            aria-label={t('admission.rejectTable', { label: subject.tableLabel })}
            onClick={() => {
              setFailure(null);
              setAsking(true);
            }}
          >
            {t('admission.reject')}
          </button>
          <button
            type="button"
            className={classes.admit}
            disabled={off}
            aria-label={t('admission.admitTable', { label: subject.tableLabel })}
            onClick={() => decide('admit')}
          >
            {admit.isPending ? t('approvals.sending') : t('admission.admit')}
          </button>
        </div>
      )}
      {!online ? <p className={classes.note}>{t('admission.needsOnline')}</p> : null}
      {failure ? (
        <p
          className={classes.warn}
          data-tone={variant === 'panel' ? 'red' : undefined}
          role="alert"
        >
          {failure}
        </p>
      ) : null}
    </>
  );
}
