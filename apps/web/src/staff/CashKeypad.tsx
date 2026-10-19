import { newCommandId, type BillRequest, type TabTotals } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, useRef, useState } from 'react';
import { useDialogFocus } from '../components/useDialogFocus';
import { billRequestText } from './billRequestText';
import { OverlayBar } from './OverlayBar';
import { useBranchFormat } from './useBranchFormat';

/**
 * Taking cash (floor-tablet `Cash`).
 *
 * A keypad rather than a text field: this is the one place on the screen where
 * typing is unavoidable, and a numeric keypad with big keys is faster and far
 * harder to mistype than a soft keyboard on a tablet held in one hand. The keys
 * build a string of digits, so there is nothing locale-shaped to parse — no
 * separator, no decimal point — and every sum here is whole dram in integers.
 *
 * Two things are deliberately separate and always visible:
 *
 * - **The amount** is the cash handed over. It opens on what is owed, or on
 *   what the table asked to pay from the app — still editable, because people
 *   change their minds at the table. More than is owed is **change**: the
 *   balance goes on the tab and the rest goes back, which is why the server is
 *   never sent more than the balance (it refuses that). Less is a part payment
 *   that leaves the tab open, and says what is left.
 * - **The tip** is its own field, visibly outside the balance. A tip folded
 *   into the amount makes a tab look settled while money is still owed, and the
 *   waiter finds out at the end of the shift.
 *
 * The first key after a filled-in amount — the balance it opened on, the app's
 * request, a quick amount — replaces it, as on a till; later keys append, and
 * ⌫ edits what is there.
 *
 * The keypad stays up until the server answers: a "done" card with the change
 * to hand back when it took the payment, the form frozen behind it as it was
 * recorded; the words of the failure when it did not, with what was typed still
 * there. A send whose answer never came is **not** "nothing was taken": it may
 * have landed. The retry goes with the same `clientCommandId` while the amount,
 * the tip and the payer are unchanged, so the server replays the first payment
 * instead of taking a second.
 */

export type CashOutcome =
  | { readonly kind: 'recorded'; readonly tabClosed: boolean }
  /** More than the tab owes by now: the tab shows the real balance instead. */
  | { readonly kind: 'refused' }
  /** The server answered and said no: nothing was taken. */
  | { readonly kind: 'failed' }
  /** No answer came (offline, a timeout, a server fault): it may have been taken. */
  | { readonly kind: 'unknown' };

export interface CashKeypadProps {
  readonly tableLabel: string;
  readonly totals: TabTotals;
  /**
   * The bill request the keypad opened on, with whose it is. The amount opens
   * capped at what the tab still owes: a share priced before somebody else
   * paid can be more than is left.
   */
  readonly request: { readonly name: string; readonly bill: BillRequest } | null;
  /** Who is taking the money, for the bar. */
  readonly staffName: string | null;
  readonly partySize?: number | null | undefined;
  readonly timeZoneId: string;
  readonly online: boolean;
  /**
   * `clientCommandId` is the keypad's: the same on a retry of the same amount
   * and tip, so a payment whose answer was lost is replayed, never taken twice.
   */
  readonly onRecord: (input: {
    amountDram: number;
    tipDram: number;
    clientCommandId: string;
  }) => Promise<CashOutcome>;
  readonly onBack: () => void;
  readonly onFloor: () => void;
  readonly onFreeTable: () => void;
}

/** Eight digits: tens of millions of dram, far past any table. */
const MAX_DIGITS = 8;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'] as const;

/** Round-up notes a table hands over: the next 5 000, 10 000 and 20 000 above. */
const ROUND_TO = [5_000, 10_000, 20_000] as const;

/** The next two round amounts above what is owed, distinct, smallest first. */
export function roundUps(owedDram: number): readonly number[] {
  const ups = [...new Set(ROUND_TO.map((step) => (Math.floor(owedDram / step) + 1) * step))];
  return ups.sort((a, b) => a - b).slice(0, 2);
}

const digitsOf = (amount: number) => (amount > 0 ? String(amount) : '');
const amountOf = (digits: string) => (digits === '' ? 0 : Number(digits));

export function CashKeypad(props: CashKeypadProps) {
  const { totals, request, online, timeZoneId } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const ids = useId();

  const [field, setField] = useState<'amount' | 'tip'>('amount');
  const [amount, setAmount] = useState(() =>
    digitsOf(
      // A whole-bill request is "all of it": what the tab owes now, which can
      // have grown since it was asked. A share is that person's, capped at what
      // is left.
      request && request.bill.scope === 'mine'
        ? Math.max(0, Math.min(request.bill.amountDram, totals.remainingDram))
        : totals.remainingDram,
    ),
  );
  const [tip, setTip] = useState(() => digitsOf(request?.bill.tipDram ?? 0));
  /**
   * Which field still holds a value the keypad filled in rather than one the
   * waiter typed: its next digit replaces it. Both start filled in.
   */
  const [filled, setFilled] = useState({ amount: true, tip: true });
  /** Still what the app asked for: said until the waiter changes anything. */
  const [fromRequest, setFromRequest] = useState(request !== null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'failed' | 'unknown' | null>(null);
  const [done, setDone] = useState<{
    readonly closed: boolean;
    readonly applied: number;
    readonly change: number;
    readonly left: number;
    readonly tip: number;
    /** The bill as it stood when it was recorded: the form behind the card keeps it. */
    readonly totals: TabTotals;
  } | null>(null);
  /** The last send's id, and the amount and tip it was for. */
  const attempt = useRef<{ readonly key: string; readonly id: string } | null>(null);

  // Behind the done card the form stays as it was recorded, not recomputed
  // against the balance the payment left.
  const shown = done?.totals ?? totals;
  const owed = shown.remainingDram;
  const amountDram = amountOf(amount);
  const tipDram = amountOf(tip);
  // Integer arithmetic on whole dram, all of it.
  const applied = Math.min(amountDram, owed);
  const change = Math.max(0, amountDram - owed);
  const left = Math.max(0, owed - amountDram);
  const canRecord = online && applied > 0 && !busy && !done;

  /** A value the waiter chose; `fill` marks one the keypad put there (a quick amount). */
  function edit(next: string, which: 'amount' | 'tip' = field, fill = false): void {
    setFromRequest(false);
    setFailure(null);
    setFilled((current) => ({ ...current, [which]: fill }));
    if (which === 'amount') setAmount(next);
    else setTip(next);
  }

  function press(key: (typeof KEYS)[number]): void {
    const current = field === 'amount' ? amount : tip;
    if (key === 'clear') return edit('');
    if (key === 'del') return edit(current.slice(0, -1));
    // The first digit after a filled-in value starts a new one, as on a till.
    const base = filled[field] ? '' : current;
    // No leading zeros: "0500" is a number nobody meant to type.
    const next = (base + key).replace(/^0+/u, '');
    if (next.length > MAX_DIGITS) return;
    edit(next);
  }

  async function record(): Promise<void> {
    if (!canRecord) return;
    // One id per amount and tip (the payer is fixed for this keypad): a retry
    // of the same payment replays it on the server instead of taking it twice.
    const key = `${applied}:${tipDram}`;
    if (attempt.current?.key !== key) attempt.current = { key, id: newCommandId() };
    const recordedTotals = totals;
    setBusy(true);
    setFailure(null);
    const outcome = await props.onRecord({
      amountDram: applied,
      tipDram,
      clientCommandId: attempt.current.id,
    });
    setBusy(false);
    if (outcome.kind === 'recorded') {
      setDone({
        closed: outcome.tabClosed,
        applied,
        change,
        left,
        tip: tipDram,
        totals: recordedTotals,
      });
    } else if (outcome.kind === 'refused') {
      props.onBack();
    } else {
      setFailure(outcome.kind);
    }
  }

  // Rounded up, so two halves cover the bill.
  const half = Math.ceil(owed / 2);
  const quick: readonly { key: string; label: string; pressed: boolean; pick: () => void }[] = [
    {
      key: 'all',
      label: t('cash.all'),
      pressed: amountDram === owed,
      pick: () => edit(digitsOf(owed), 'amount', true),
    },
    ...roundUps(owed).map((value) => ({
      key: String(value),
      label: format.dramAmount(value),
      pressed: amountDram === value,
      pick: () => edit(digitsOf(value), 'amount', true),
    })),
    {
      key: 'half',
      label: t('cash.half'),
      pressed: amountDram === half,
      pick: () => edit(digitsOf(half), 'amount', true),
    },
    {
      key: 'noTip',
      label: t('cash.noTip'),
      pressed: tipDram === 0,
      pick: () => edit('', 'tip', true),
    },
  ];

  const fieldName = (which: 'amount' | 'tip', value: number) =>
    `${t(which === 'amount' ? 'cash.amount' : 'cash.tip')} ${format.dram(value)}${
      field === which ? `, ${t('cash.typing')}` : ''
    }`;

  const sub = [
    request?.name ?? null,
    props.partySize ? t('order.people', { count: props.partySize }) : null,
    props.staffName ? t('cash.takenBy', { name: props.staffName }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const recordLabel = !online
    ? t('cash.recordOffline')
    : busy
      ? t('cash.recording')
      : applied === 0
        ? t('cash.recordEmpty')
        : tipDram > 0
          ? t('cash.recordWithTip', { amount: format.dram(applied) })
          : t('cash.recordAmount', { amount: format.dram(applied) });

  const message =
    change > 0
      ? { tone: 'ok', text: t('cash.over', { change: format.dram(change) }) }
      : amountDram > 0 && left > 0
        ? { tone: 'waiting', text: t('cash.partial', { amount: format.dram(left) }) }
        : null;

  return (
    <div className="staff-overlay ft-cash" role="dialog" aria-label={t('cash.title')}>
      <OverlayBar
        back={t('cash.back')}
        backName={t('cash.backName')}
        title={t('cash.heading', { label: props.tableLabel })}
        sub={sub}
        online={online}
        offlineText={t('connection.chip.offline')}
        onBack={props.onBack}
      />

      <div className="ft-cash-body">
        <section className="ft-cash-left" aria-labelledby={`${ids}-owed`}>
          <div className="cash-owed">
            <span id={`${ids}-owed`}>{t('tab.toPay')}</span>
            <b>{format.dram(owed)}</b>
            <small>
              {t('cash.breakdown', {
                subtotal: format.dram(shown.subtotalDram),
                service: format.dram(shown.serviceChargeDram),
                paid: format.dram(shown.paidDram),
              })}
            </small>
          </div>

          {request && fromRequest ? (
            <div className="ft-note ft-note-info">
              <p>
                <b>{t('billRequest.prefilled')}</b>
              </p>
              <p>{`${request.name} · ${billRequestText(request.bill, t, format.dram, 'wants')}`}</p>
            </div>
          ) : null}

          <div className="cash-fields">
            {(['amount', 'tip'] as const).map((which) => (
              <div key={which} className="cash-field-wrap">
                <span className="cash-field-label" aria-hidden="true">
                  {t(which === 'amount' ? 'cash.amount' : 'cash.tip')}
                </span>
                <button
                  type="button"
                  className={`cash-field ${field === which ? 'is-active' : ''}`}
                  aria-label={fieldName(which, which === 'amount' ? amountDram : tipDram)}
                  onClick={() => setField(which)}
                >
                  <span className="cash-cur" aria-hidden="true">
                    ֏
                  </span>
                  {format.dramAmount(which === 'amount' ? amountDram : tipDram)}
                </button>
              </div>
            ))}
          </div>

          <div className="cash-quick" role="group" aria-label={t('cash.quick')}>
            {quick.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={entry.pressed}
                onClick={entry.pick}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {!online ? <p className="ft-note ft-note-waiting">{t('tab.cashOffline')}</p> : null}
          {/* One live region: the sentence that changes as the waiter types. */}
          <p
            role="status"
            className={message ? `ft-note ft-note-${message.tone}` : 'ft-note-empty'}
          >
            {message?.text ?? ''}
          </p>
          {failure ? (
            <p className="ft-note ft-note-failure" role="alert">
              {/* Only an answer from the server says nothing was taken. */}
              {failure === 'failed' ? t('cash.failed') : t('cash.unknown')}
            </p>
          ) : null}

          <dl className="cash-sum">
            <div>
              <dt>{t('cash.applied')}</dt>
              <dd>{format.dram(applied)}</dd>
            </div>
            <div>
              <dt>{t('cash.tip')}</dt>
              <dd>
                {tipDram > 0
                  ? t('cash.tipLine', { amount: format.dram(tipDram) })
                  : t('cash.tipNone')}
              </dd>
            </div>
            {change > 0 ? (
              <div className="is-change">
                <dt>{t('cash.change')}</dt>
                <dd>{format.dram(change)}</dd>
              </div>
            ) : null}
            <div className="is-big">
              <dt>{t('cash.left')}</dt>
              <dd>{format.dram(left)}</dd>
            </div>
          </dl>
          {/* Nobody on either team should be able to think this is fiscal. */}
          <p className="ft-hint">{t('cash.notAReceipt')}</p>
        </section>

        <div className="ft-cash-right">
          <div
            className="cash-keys"
            role="group"
            aria-label={t(field === 'amount' ? 'cash.keypadAmount' : 'cash.keypadTip')}
          >
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`cash-key ${key === 'clear' || key === 'del' ? 'is-fn' : ''}`}
                onClick={() => press(key)}
                aria-label={
                  key === 'del' ? t('cash.delete') : key === 'clear' ? t('cash.clear') : key
                }
              >
                {key === 'del' ? '⌫' : key === 'clear' ? t('cash.clear') : key}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ft-btn ft-btn-ok cash-record"
            disabled={!canRecord}
            onClick={() => void record()}
          >
            {recordLabel}
          </button>
        </div>
      </div>

      {done ? (
        <DoneCard
          headingId={`${ids}-done`}
          title={
            done.closed
              ? t('cash.paidAll')
              : t('cash.recordedTitle', { amount: format.dram(done.applied) })
          }
          change={done.change > 0 ? format.dram(done.change) : null}
          body={
            done.closed
              ? t('cash.closedBody')
              : t('cash.openBody', { amount: format.dram(done.left) })
          }
          tip={done.tip > 0 ? format.dram(done.tip) : null}
          closed={done.closed}
          onFreeTable={props.onFreeTable}
          onBack={props.onBack}
          onFloor={props.onFloor}
        />
      ) : null}
    </div>
  );
}

/**
 * What was taken, and the change to hand back. It takes the focus when it
 * opens — Record stays behind it, disabled, so no key press can take the same
 * cash twice — and keeps it inside until the waiter moves on.
 */
function DoneCard(props: {
  readonly headingId: string;
  readonly title: string;
  readonly change: string | null;
  readonly body: string;
  readonly tip: string | null;
  readonly closed: boolean;
  readonly onFreeTable: () => void;
  readonly onBack: () => void;
  readonly onFloor: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, { onEscape: props.closed ? props.onFloor : props.onBack });
  return (
    <div className="ft-scrim">
      <div
        ref={ref}
        className="ft-done"
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.headingId}
      >
        <span className="ft-done-mark" aria-hidden="true">
          ✓
        </span>
        <h2 id={props.headingId}>{props.title}</h2>
        {props.change ? (
          <>
            <span className="ft-done-change">{props.change}</span>
            <p>{t('cash.changeCaption')}</p>
          </>
        ) : null}
        <p>{props.body}</p>
        {props.tip ? <p>{t('cash.tipBody', { amount: props.tip })}</p> : null}
        <div className="ft-done-actions">
          {props.closed ? (
            <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onFreeTable}>
              {t('cash.freeTable')}
            </button>
          ) : (
            <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onBack}>
              {t('cash.backToTab')}
            </button>
          )}
          <button type="button" className="ft-btn ft-btn-ok" onClick={props.onFloor}>
            {t('order.toFloor')}
          </button>
        </div>
      </div>
    </div>
  );
}
