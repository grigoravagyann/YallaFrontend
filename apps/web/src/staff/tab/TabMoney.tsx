import type { ServiceRequest, StaffTab, TabTotals } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { billRequestText } from '../billRequestText';
import { useBranchFormat } from '../useBranchFormat';
import { NO_REQUEST, wholeMinutesSince } from './tabRules';

export interface TabMoneyProps {
  /** The ids under the panel's own, for the heading and the request radios. */
  readonly pickId: string;
  readonly tab: StaffTab;
  readonly totals: TabTotals;
  readonly timeZoneId: string;
  /** The minute clock, for how long ago the bill was asked for. */
  readonly now: Date;
  readonly online: boolean;
  readonly closed: boolean;
  readonly closing: boolean;
  readonly isManager: boolean;
  /** The open bill requests with amounts, newest first. */
  readonly billRequests: readonly ServiceRequest[];
  /** The one the keypad is for, or `null` for none of them. */
  readonly chosenBill: ServiceRequest | null;
  readonly onChooseBill: (choice: string) => void;
  readonly requesterName: (request: ServiceRequest) => string;
  readonly linesKnown: boolean;
  readonly linesDram: number;
  readonly adjustedDram: number;
  readonly tipsDram: number | null;
  readonly cashRefusal: { readonly remainingDram: number; readonly requestedDram: number } | null;
  /** What the keypad will open on. */
  readonly cashAmount: number;
  readonly onTakeCash: () => void;
  readonly onOrder: () => void;
  readonly onAskForBill: () => void;
  readonly onDiscountWhole: () => void;
  readonly onMarkUnpaid: () => void;
}

/**
 * The money: what the table asked to pay from the app, the totals down to
 * what is still to pay, and the actions.
 */
export function TabMoney({
  pickId,
  tab,
  totals,
  timeZoneId,
  now,
  online,
  closed,
  closing,
  isManager,
  billRequests,
  chosenBill,
  onChooseBill,
  requesterName,
  linesKnown,
  linesDram,
  adjustedDram,
  tipsDram,
  cashRefusal,
  cashAmount,
  onTakeCash,
  onOrder,
  onAskForBill,
  onDiscountWhole,
  onMarkUnpaid,
}: TabMoneyProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  return (
    <section className="ft-tab-right" aria-labelledby={`${pickId}-money`}>
      <h2 className="visually-hidden" id={`${pickId}-money`}>
        {t('tab.toPay')}
      </h2>
      {/* What people asked for from the app, each with their name, so the
      waiter walks over knowing who wants to pay what rather than
      asking again. Two people can ask at once — the host the whole
      bill, a guest their own share — so the waiter picks whose cash
      the keypad is for, and "none of these" keeps a payment nobody
      asked for from being credited to somebody who did. */}
      {billRequests.length > 0 && !closed ? (
        <fieldset className="ft-request">
          <legend>
            <span>{t('billRequest.pickTitle')}</span>
            <small>
              {t('billRequest.askedAgo', {
                count: wholeMinutesSince(now, billRequests[0]!.requestedAtUtc),
              })}
            </small>
          </legend>
          <p>{t('billRequest.pickNote')}</p>
          {/* Named by the person, described by what they asked for: two
          spans run together would read "KarenWants to pay…". */}
          {billRequests.map((request) => (
            <label key={request.id} className="ft-request-option">
              <input
                type="radio"
                name={`${pickId}-bill-request`}
                value={request.id}
                checked={chosenBill?.id === request.id}
                onChange={() => onChooseBill(request.id)}
                aria-labelledby={`${pickId}-${request.id}-who`}
                aria-describedby={`${pickId}-${request.id}-what`}
              />
              <span className="ft-request-who" id={`${pickId}-${request.id}-who`}>
                {requesterName(request)}
              </span>
              <span id={`${pickId}-${request.id}-what`}>
                {billRequestText(request.bill!, t, format.dram, 'wants')}
              </span>
            </label>
          ))}
          <label className="ft-request-option">
            <input
              type="radio"
              name={`${pickId}-bill-request`}
              value={NO_REQUEST}
              checked={chosenBill === null}
              onChange={() => onChooseBill(NO_REQUEST)}
              aria-labelledby={`${pickId}-none-who`}
              aria-describedby={`${pickId}-none-what`}
            />
            <span className="ft-request-who" id={`${pickId}-none-who`}>
              {t('billRequest.noneTitle')}
            </span>
            <span id={`${pickId}-none-what`}>
              {t('billRequest.noneBody', { amount: format.dram(totals.remainingDram) })}
            </span>
          </label>
        </fieldset>
      ) : null}

      <dl className="tab-totals">
        <div>
          <dt>{linesKnown ? t('tab.dishes') : t('tab.dishesAfter')}</dt>
          <dd>{format.dram(linesKnown ? linesDram : totals.subtotalDram)}</dd>
        </div>
        {adjustedDram > 0 ? (
          <div className="is-muted">
            <dt>{t('tab.adjusted')}</dt>
            <dd>−{format.dram(adjustedDram)}</dd>
          </div>
        ) : null}
        {tab.serviceChargePercent !== null ? (
          <div className="is-muted">
            <dt>{t('tab.serviceCharge', { percent: tab.serviceChargePercent })}</dt>
            <dd>{format.dram(totals.serviceChargeDram)}</dd>
          </div>
        ) : null}
        <div className="is-big">
          <dt>{t('tab.total')}</dt>
          <dd>{format.dram(totals.totalDram)}</dd>
        </div>
        <div className="is-muted">
          <dt>{t('tab.paid')}</dt>
          <dd>{format.dram(totals.paidDram)}</dd>
        </div>
        <div className="is-big is-owed">
          <dt>{t('tab.toPay')}</dt>
          <dd>{format.dram(totals.remainingDram)}</dd>
        </div>
      </dl>

      {/* Tips are money the venue took, never money the table owes, so
      they sit under the balance and outside it — only once there is
      one, since "tips: 0" next to a bill reads as a hint. */}
      {tipsDram !== null && tipsDram > 0 ? (
        <p className="ft-hint">{t('tab.tips', { amount: format.dram(tipsDram) })}</p>
      ) : null}
      <p className="ft-hint">{t('tab.sharesStaffBlind')}</p>

      {closed ? (
        // Closed and freed are not the same thing, and conflating them is
        // how a waiter clears a table people are still sitting at.
        <p className="ft-note ft-note-info">{t('tab.closedNote')}</p>
      ) : closing ? (
        <p className="ft-note ft-note-info">{t('tab.closingNote')}</p>
      ) : null}

      {/* The refusal, with the number that resolves it. Shown here rather
      than inside the keypad because the keypad has been dismissed by
      the time this arrives, and the waiter is looking at the bill. */}
      {cashRefusal ? (
        <p className="ft-note ft-note-failure" role="alert">
          {t('cash.exceeds', {
            requested: format.dram(cashRefusal.requestedDram),
            remaining: format.dram(cashRefusal.remainingDram),
          })}
        </p>
      ) : null}

      <div className="ft-tab-actions">
        <button
          type="button"
          className="ft-btn ft-btn-ok ft-btn-big"
          // Nothing owed is nothing to take: a tip alone has no balance to ride on.
          disabled={!online || closed || totals.remainingDram === 0}
          onClick={onTakeCash}
        >
          {closed || totals.remainingDram === 0
            ? t('tab.takeCash')
            : t('tab.takeCashAmount', { amount: format.dram(cashAmount) })}
        </button>
        {!online ? (
          // Disabled with a plain reason rather than silently absent. A
          // payment recorded against a balance this tablet cannot verify
          // is how a table pays twice, so it waits for the connection.
          <p className="ft-note ft-note-waiting">{t('tab.cashOffline')}</p>
        ) : null}
        <div className="ft-tab-row">
          <button
            type="button"
            className="ft-btn ft-btn-secondary"
            disabled={closed || closing}
            onClick={onOrder}
          >
            {t('tab.addDish')}
          </button>
          {!closed && !closing ? (
            <button
              type="button"
              className="ft-btn ft-btn-secondary"
              disabled={!online}
              onClick={onAskForBill}
            >
              {t('tab.askForBill')}
            </button>
          ) : null}
        </div>
        {closed ? null : isManager ? (
          <>
            <button
              type="button"
              className="ft-btn ft-btn-secondary"
              disabled={!online}
              onClick={onDiscountWhole}
            >
              {t('tab.discountWhole')}
            </button>
            {/* Placed apart from everything frequent, and behind a typed
            confirmation with the amount in it. */}
            <hr className="ft-sep" />
            <button
              type="button"
              className="ft-btn ft-btn-ghost"
              disabled={!online}
              onClick={onMarkUnpaid}
            >
              {t('tab.markUnpaid')}
            </button>
          </>
        ) : (
          <p className="ft-hint ft-manager-only">{t('tab.managerOnly')}</p>
        )}
      </div>
    </section>
  );
}
