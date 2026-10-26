import {
  type AbandonTabCommand,
  type AbandonTabResult,
  type CompCommand,
  type PaymentResult,
  type RecordCashPaymentCommand,
  type TabAdjustment,
  type TabLine,
  type VoidLineCommand,
  voidReasonText,
} from '../../contracts/ordering';
import type { components } from '../../generated/schema';
import type { StaffGateway } from '../../staffGateway';
import { adjustment, adjustmentKindCode, paymentResult, tabLine } from '../staffMapping';
import { type StaffHttpContext, rethrow } from './context';

type Schemas = components['schemas'];

export function billMethods(
  ctx: StaffHttpContext,
): Pick<StaffGateway, 'voidLine' | 'compLine' | 'recordCashPayment' | 'abandonTab'> {
  const { client } = ctx;
  return {
    // --- Money --------------------------------------------------------------

    async voidLine(command: VoidLineCommand): Promise<readonly TabLine[]> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Ordering.OrderView']>(
          `/api/tabs/${command.tabId}/lines/${command.lineId}/void`,
          {
            // The server stores free text and the diner reads it on their phone.
            reason: voidReasonText(command),
            clientCommandId: command.clientCommandId,
          } satisfies Schemas['Yalla.Api.Endpoints.VoidLineRequest'],
        );
        return data.lines.map((line) =>
          tabLine(line, {
            orderId: data.orderId,
            placedAtUtc: data.placedAtUtc,
            status: data.status,
          }),
        );
      } catch (error) {
        return rethrow(error);
      }
    },

    async compLine(command: CompCommand): Promise<TabAdjustment> {
      const { data } = await client.post<Schemas['Yalla.Application.Ordering.AdjustmentView']>(
        `/api/tabs/${command.tabId}/adjustments`,
        {
          clientCommandId: command.clientCommandId,
          kind: adjustmentKindCode(command.kind),
          reason: command.reason,
          ...(command.lineId ? { tabOrderLineId: command.lineId } : {}),
          ...(command.percent !== null ? { percent: command.percent } : {}),
          ...(command.amountDram !== null ? { amountAmd: command.amountDram } : {}),
        } satisfies Schemas['Yalla.Api.Endpoints.AddAdjustmentRequest'],
      );
      return adjustment(data);
    },

    async recordCashPayment(command: RecordCashPaymentCommand): Promise<PaymentResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Ordering.CashPaymentView']>(
          `/api/tabs/${command.tabId}/payments/cash`,
          {
            amountAmd: command.amountDram,
            tipAmd: command.tipDram,
            clientCommandId: command.clientCommandId,
            ...(command.participantId ? { tabParticipantId: command.participantId } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.RecordCashRequest'],
        );
        return paymentResult(data);
      } catch (error) {
        return rethrow(error);
      }
    },

    async abandonTab(command: AbandonTabCommand): Promise<AbandonTabResult> {
      const { data } = await client.post<Schemas['Yalla.Application.Ordering.TabTotalsSnapshot']>(
        `/api/tabs/${command.tabId}/abandon`,
        { reason: command.reason } satisfies Schemas['Yalla.Api.Endpoints.AbandonTabRequest'],
      );

      const totals = {
        subtotalDram: data.subtotalAmd,
        serviceChargeDram: data.serviceChargeAmd,
        totalDram: data.totalAmd,
        paidDram: data.paidAmd,
        remainingDram: data.remainingAmd,
      };
      // The endpoint answers with the tab's totals, so what was written off is
      // that snapshot's remaining balance. There is no `wasReplay` on it.
      return { tabId: command.tabId, writtenOffDram: totals.remainingDram, totals };
    },
  };
}
