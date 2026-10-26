import type {
  AdjustmentKind,
  ServiceRequest,
  StaffTab,
  TabLine,
  TabStaffParticipant,
  UserRole,
  VoidReason,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { CashKeypad, type CashOutcome } from './CashKeypad';
import { OverlayBar } from './OverlayBar';
import { AbandonDialog, CompDialog, LineDialog } from './tab/TabDialogs';
import { TabLines } from './tab/TabLines';
import { TabMoney } from './tab/TabMoney';
import {
  cashAmountFor,
  chosenBillRequest,
  isTabManager,
  tabSums,
  wholeMinutesSince,
} from './tab/tabRules';
import { useBranchFormat } from './useBranchFormat';
import { useMinuteClock } from './useMinuteClock';

export { ParticipantAvatar } from './tab/ParticipantAvatar';
export { isTabManager } from './tab/tabRules';

/**
 * The tab, for staff (floor-tablet `Tab`).
 *
 * Left, what was ordered: every line with where it is (in the kitchen, ready,
 * served, voided), who it is for, when its order went in (the branch's clock,
 * as the diner's bill says it) and its note. Right, the money: what the table
 * asked to pay from the app, the totals down to what is still to pay, and the
 * actions. The number a waiter needs at a glance is **still to pay**, so it
 * closes the totals in the largest type.
 *
 * Nothing here may differ from what the diner is looking at on their phone. That
 * is why voided lines are struck through and labelled rather than removed: a
 * line that vanishes from one screen and not the other is an argument, and the
 * diner's phone is the screen that will be believed.
 *
 * ## Who may do what (HANDOFF §3, decided by the user)
 *
 * A waiter and above takes cash (with the tip), voids a line with a reason and
 * answers the bill request. A manager and above alone comps a line, takes a
 * percentage or an amount off the whole tab, and marks it unpaid — the server's
 * `ManagerOrAbove`. A waiter does not see those three at all; one muted line
 * where they would be says who does.
 *
 * ## One snapshot
 *
 * The lines (voided ones with their reason, phone orders with who placed
 * them), every adjustment on the tab from whichever device made it, the
 * service percentage and the totals all come from the one staff read of the
 * tab. Nothing here adds a number from one moment to a number from another:
 * the discount row is what the adjustments took off, not the lines' sum less
 * a subtotal that refreshed on its own.
 */

export interface TabPanelProps {
  /** The tab with its lines and adjustments, from one read. */
  readonly tab: StaffTab | null;
  readonly tableLabel: string;
  readonly timeZoneId: string;
  readonly role: UserRole;
  /** Who is signed in, for the cash screen's bar. */
  readonly staffName?: string | null | undefined;
  /** How many sat down, from the floor. */
  readonly partySize?: number | null | undefined;
  readonly online: boolean;
  readonly loading: boolean;
  /** There is a tab, but this device cannot read it without a connection. */
  readonly offlineUnknown: boolean;
  /** The last cash attempt was refused for exceeding the balance. */
  readonly cashRefusal: { readonly remainingDram: number; readonly requestedDram: number } | null;
  /**
   * What people at the table asked to pay from the app — the whole bill or
   * their own share, and the tip — while those requests are still being
   * handled, newest first. Only requests with amounts (`bill` set). The waiter
   * picks the one the keypad opens on; the newest by default.
   */
  readonly billRequests?: readonly ServiceRequest[];
  readonly onVoid: (line: TabLine, reason: VoidReason, detail?: string) => void;
  readonly onAdjust: (input: {
    lineId: string | null;
    kind: AdjustmentKind;
    percent: number | null;
    amountDram: number | null;
    reason: string;
  }) => void;
  /**
   * Cash taken, answered with what became of it. `billRequest` is the request
   * the keypad was opened on, as it stood then — not looked up again, because
   * it can leave the open list while the waiter types (another tablet answers
   * it, or the diner asks again) and the cash is still that person's. Null when
   * the waiter picked none of them: then nobody is named as the payer and no
   * request is marked handled.
   */
  readonly onCash: (input: {
    amountDram: number;
    tipDram: number;
    /** The keypad's, reused on a retry of the same payment. */
    clientCommandId: string;
    billRequest: ServiceRequest | null;
  }) => Promise<CashOutcome>;
  readonly onAskForBill: () => void;
  readonly onAbandon: (reason: string) => void;
  readonly onOrder: () => void;
  /** From the "paid in full" card: back to the table, to free it. */
  readonly onFreeTable?: (() => void) | undefined;
  readonly onClose: () => void;
  /**
   * Opened from the table panel's "Take cash": the keypad comes up at once, on
   * the newest bill request as the tab's own button would, instead of one tap
   * later. It still waits for the tab to load, and needs the connection.
   */
  readonly openOnCash?: boolean | undefined;
}

type Dialog =
  | { readonly kind: 'line'; readonly line: TabLine; readonly step: 'menu' | 'void' }
  | { readonly kind: 'comp'; readonly line: TabLine | null }
  | { readonly kind: 'abandon' };

export function TabPanel(props: TabPanelProps) {
  const { tab, tableLabel, timeZoneId, role, online, loading, offlineUnknown } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const now = useMinuteClock();
  const pickId = useId();

  const [dialog, setDialog] = useState<Dialog | null>(null);
  /**
   * The keypad, and the request it was opened on — fixed at the tap, so a
   * request arriving while the waiter types cannot change whose cash this is.
   */
  const [takingCash, setTakingCash] = useState<{
    readonly request: ServiceRequest | null;
    /** Recorded: its card stays up even though the payment closed the tab. */
    readonly recorded: boolean;
  } | null>(() =>
    props.openOnCash && online
      ? {
          request: (props.billRequests ?? []).find((request) => request.bill !== null) ?? null,
          recorded: false,
        }
      : null,
  );
  /** The waiter's pick among the bill requests: an id, {@link NO_REQUEST}, or null for the newest. */
  const [billChoice, setBillChoice] = useState<string | null>(null);

  const isManager = isTabManager(role);
  const totals = tab?.totals;
  const billRequests = (props.billRequests ?? []).filter((request) => request.bill !== null);
  // A pick that has since been handled elsewhere falls back to the newest.
  const chosenBill = chosenBillRequest(billRequests, billChoice);
  const tipsDram = tab?.tipsDram ?? null;

  const nameOf = (person: TabStaffParticipant | undefined): string =>
    person?.displayName ?? t('order.whoUnnamed');
  /** Whose request it is, by the tab's own roster. */
  const requesterName = (request: ServiceRequest): string => {
    const person = request.requestedByParticipantId
      ? tab?.participants.find((candidate) => candidate.id === request.requestedByParticipantId)
      : undefined;
    return person ? nameOf(person) : t('billRequest.someone');
  };
  const closed = tab?.status === 'closed' || tab?.status === 'abandoned';
  const closing = tab?.status === 'closing';

  const {
    lines,
    linesKnown,
    adjustments,
    activeLines,
    linesDram,
    dishCount,
    adjustedDram,
    paidAgainst,
  } = tabSums(tab);
  // What the keypad will open on: a share capped at what is left; the whole
  // bill as it stands now.
  const cashAmount = cashAmountFor(totals, chosenBill);

  const minutesOpen = tab ? wholeMinutesSince(now, tab.openedAtUtc) : 0;

  const lineActions = !online || closed;

  return (
    <div
      className="staff-overlay ft-tab"
      role="dialog"
      aria-label={t('tab.title', { label: tableLabel })}
    >
      <OverlayBar
        back={t('order.back', { label: tableLabel })}
        backName={t('order.backName', { label: tableLabel })}
        title={t('tab.title', { label: tableLabel })}
        sub={
          tab
            ? [
                t('tab.openSince', { time: format.time(tab.openedAtUtc), minutes: minutesOpen }),
                props.partySize ? t('order.people', { count: props.partySize }) : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : ''
        }
        online={online}
        offlineText={t('connection.chip.offline')}
        onBack={props.onClose}
      />

      {loading ? (
        <div className="staff-overlay-body">
          <p className="floor-todo">{t('floor.loading')}</p>
        </div>
      ) : offlineUnknown ? (
        <div className="staff-overlay-body">
          <p className="ft-note ft-note-waiting">{t('tab.offlineUnknown')}</p>
        </div>
      ) : !tab || !totals ? (
        <div className="staff-overlay-body">
          <p className="floor-todo">{t('tab.none')}</p>
        </div>
      ) : (
        <div className="ft-tab-body">
          <TabLines
            pickId={pickId}
            tab={tab}
            timeZoneId={timeZoneId}
            lines={lines}
            linesKnown={linesKnown}
            activeLineCount={activeLines.length}
            dishCount={dishCount}
            adjustments={adjustments}
            nameOf={nameOf}
            lineActions={lineActions}
            onLineMenu={(line) => setDialog({ kind: 'line', line, step: 'menu' })}
          />

          <TabMoney
            pickId={pickId}
            tab={tab}
            totals={totals}
            timeZoneId={timeZoneId}
            now={now}
            online={online}
            closed={closed}
            closing={closing}
            isManager={isManager}
            billRequests={billRequests}
            chosenBill={chosenBill}
            onChooseBill={setBillChoice}
            requesterName={requesterName}
            linesKnown={linesKnown}
            linesDram={linesDram}
            adjustedDram={adjustedDram}
            tipsDram={tipsDram}
            cashRefusal={props.cashRefusal}
            cashAmount={cashAmount}
            onTakeCash={() => setTakingCash({ request: chosenBill, recorded: false })}
            onOrder={props.onOrder}
            onAskForBill={props.onAskForBill}
            onDiscountWhole={() => setDialog({ kind: 'comp', line: null })}
            onMarkUnpaid={() => setDialog({ kind: 'abandon' })}
          />
        </div>
      )}

      {/* --- A line's menu, and voiding it --------------------------------- */}
      {dialog?.kind === 'line' ? (
        <LineDialog
          key={dialog.line.id}
          line={dialog.line}
          step={dialog.step}
          canComp={isManager}
          paidAgainst={paidAgainst}
          heading={`${dialog.line.quantity}× ${dialog.line.name} · ${format.dram(dialog.line.lineTotalDram)}`}
          onStep={(step) => setDialog({ ...dialog, step })}
          onComp={() => setDialog({ kind: 'comp', line: dialog.line })}
          onVoid={(reason, detail) => {
            props.onVoid(dialog.line, reason, detail);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {/* --- Comp a line, or a discount on the whole tab -------------------- */}
      {dialog?.kind === 'comp' ? (
        <CompDialog
          line={dialog.line}
          formatDram={format.dram}
          onApply={(input) => {
            props.onAdjust(input);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {/* --- Mark unpaid ----------------------------------------------------- */}
      {dialog?.kind === 'abandon' && totals ? (
        <AbandonDialog
          amount={format.dram(totals.remainingDram)}
          onConfirm={() => {
            props.onAbandon(t('tab.abandonReason'));
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {/* --- Cash ------------------------------------------------------------ */}
      {/* Never on a closed or abandoned tab, however the keypad was asked for —
          except for the card of the payment that just closed it. */}
      {takingCash && totals && (!closed || takingCash.recorded) ? (
        <CashKeypad
          tableLabel={tableLabel}
          totals={totals}
          request={
            takingCash.request?.bill
              ? { name: requesterName(takingCash.request), bill: takingCash.request.bill }
              : null
          }
          staffName={props.staffName ?? null}
          partySize={props.partySize}
          timeZoneId={timeZoneId}
          online={online}
          onRecord={async (input) => {
            const outcome = await props.onCash({ ...input, billRequest: takingCash.request });
            if (outcome.kind === 'recorded') {
              setTakingCash((current) => (current ? { ...current, recorded: true } : current));
            }
            return outcome;
          }}
          onBack={() => setTakingCash(null)}
          onFloor={props.onClose}
          onFreeTable={props.onFreeTable ?? props.onClose}
        />
      ) : null}
    </div>
  );
}
