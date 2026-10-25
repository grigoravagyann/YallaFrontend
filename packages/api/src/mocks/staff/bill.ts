import {
  type VoidLineCommand,
  type TabLine,
  voidReasonText,
  type CompCommand,
  type TabAdjustment,
  type RecordCashPaymentCommand,
  type PaymentResult,
  type AbandonTabCommand,
  type AbandonTabResult,
} from '../../contracts/ordering';
import { NotFoundError } from '../../errors';
import { LineAlreadyPaidError, PaymentExceedsRemainingError } from '../../contracts/errors';
import { computeBill } from '../billing';
import type { StaffGateway } from '../../staffGateway';
import { type StaffMockContext, iso, SERVICE_CHARGE_PERCENT } from './context';

/** Voids, comps, cash and writing a tab off. */
export function billMethods(
  ctx: StaffMockContext,
): Pick<StaffGateway, 'voidLine' | 'compLine' | 'recordCashPayment' | 'abandonTab'> {
  const { id, now, payments, pushEvent, requireTab, settle, tables, totalsFor, wireLines } = ctx;
  return {
    async voidLine(command: VoidLineCommand): Promise<readonly TabLine[]> {
      const tab = requireTab(command.tabId);
      const index = tab.lines.findIndex((line) => line.id === command.lineId);
      const line = tab.lines[index];
      if (!line) throw new NotFoundError({ url: `/api/tabs/${command.tabId}` });
      // As the server: once the tab has been paid against, a void is a refund.
      if (tab.paidDram > 0) {
        throw new LineAlreadyPaidError({
          url: `/api/tabs/${command.tabId}/lines/${command.lineId}/void`,
          lineId: command.lineId,
        });
      }
      tab.lines[index] = {
        ...line,
        status: 'voided',
        lineTotalDram: 0,
        voidReason: voidReasonText(command),
      };
      pushEvent(tab, 'lineVoided', now());
      // The endpoint answers with the whole order's lines, not the tab's.
      const orderId = line.orderId;
      return settle(wireLines(tab).filter((candidate) => candidate.orderId === orderId));
    },

    async compLine(command: CompCommand): Promise<TabAdjustment> {
      const tab = requireTab(command.tabId);
      const at = now();
      // A comp is an adjustment, not a line status. The line stays exactly as
      // it was ordered and the reduction is its own row with a reason on it —
      // a bill that quietly shrinks is a bill nobody trusts.
      const record: TabAdjustment = {
        id: id('adj'),
        kind: command.kind,
        lineId: command.lineId,
        percent: command.percent,
        amountDram: command.amountDram,
        reductionDram: 0,
        reason: command.reason,
        isVoided: false,
        byName: null,
        atUtc: iso(at),
      };
      tab.adjustments.push(record);
      // Recomputed after the adjustment lands, so the reduction is the server's
      // arithmetic rather than the client's guess at it.
      const before = tab.adjustments.slice(0, -1);
      const reduction =
        computeBill({
          lines: tab.lines.map((line) => ({
            lineId: line.id,
            ownerParticipantId: line.ownerParticipantId,
            unitPriceDram: line.unitPriceDram,
            quantity: line.quantity,
            isVoided: line.status === 'voided',
            isSplitAcrossParticipants: line.isShared || line.isTableAttributed,
            shareParticipantIds: [],
          })),
          adjustments: before.map((a) => ({
            lineId: a.lineId,
            percent: a.percent,
            amountDram: a.amountDram,
          })),
          participants: [],
          serviceChargePercent: SERVICE_CHARGE_PERCENT,
          paidDram: tab.paidDram,
        }).bill.subtotalDram - totalsFor(tab).subtotalDram;

      const applied: TabAdjustment = { ...record, reductionDram: Math.max(0, reduction) };
      tab.adjustments[tab.adjustments.length - 1] = applied;
      pushEvent(tab, 'adjustmentAdded', at);
      return settle(applied);
    },

    async recordCashPayment(command: RecordCashPaymentCommand): Promise<PaymentResult> {
      const replayed = payments.get(command.clientCommandId);
      if (replayed) return settle({ ...replayed, wasReplay: true });
      const tab = requireTab(command.tabId);
      const at = now();
      const before = totalsFor(tab);

      // Who handed it over, when the waiter said: somebody on this tab, as on
      // the server, which answers a stranger's id with a 404.
      const payer = command.participantId
        ? tab.participants.find((person) => person.id === command.participantId)
        : undefined;
      if (command.participantId && !payer) {
        throw new NotFoundError({ url: `/api/tabs/${tab.id}/payments/cash` });
      }

      // Refused, with the real balance on the refusal. The waiter is standing at
      // the table holding notes and that number is the whole point.
      if (command.amountDram > before.remainingDram) {
        throw new PaymentExceedsRemainingError({
          url: `/api/tabs/${tab.id}/payments/cash`,
          tabId: tab.id,
          remainingDram: before.remainingDram,
          requestedDram: command.amountDram,
        });
      }

      // The tip is added to what the venue holds, never to what the tab owes.
      tab.paidDram += command.amountDram;
      tab.tipDram += command.tipDram;
      // And against the payer's own share when the waiter named one — the
      // person who asked to pay their share has paid it.
      if (payer) payer.paidDram += command.amountDram;
      tab.settlementModeLocked = true;
      const after = totalsFor(tab);
      const closed = after.remainingDram === 0;
      if (closed && tab.status !== 'closed') {
        tab.status = 'closed';
        tab.closedAtUtc = iso(at);
        // As on the server: paying in full closes the sitting, not the table. The party is
        // usually still there, so the table stays occupied with no sitting and no tab.
        for (const state of tables.values()) {
          if (state.tabId === tab.id) {
            state.tabId = null;
            state.sessionId = null;
          }
        }
      }
      pushEvent(tab, 'paymentRecorded', at);

      const result: PaymentResult = {
        paymentId: id('pay'),
        tabId: tab.id,
        amountDram: command.amountDram,
        tipDram: command.tipDram,
        totals: after,
        tabClosed: closed,
        // Closing the tab closes the sitting; freeing the table stays a waiter's
        // explicit action, because physical and financial state are independent.
        tableSessionClosed: closed,
        wasReplay: false,
      };
      payments.set(command.clientCommandId, result);
      return settle(result);
    },

    async abandonTab(command: AbandonTabCommand): Promise<AbandonTabResult> {
      const tab = requireTab(command.tabId);
      const at = now();
      const written = totalsFor(tab).remainingDram;
      tab.status = 'abandoned';
      tab.closedAtUtc = iso(at);
      tab.paidDram = totalsFor(tab).totalDram;
      pushEvent(tab, 'tabAbandoned', at);
      return settle({ tabId: tab.id, writtenOffDram: written, totals: totalsFor(tab) });
    },
  };
}
