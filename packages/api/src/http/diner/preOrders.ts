import type { OnMyWayResult, PreOrderResult } from '../../contracts/preOrder';
import type { RunningLateResult } from '../../contracts/onMyWay';
import {
  onMyWayResultFromWire,
  preOrderResultFromWire,
  replacePreOrderBody,
  rethrowPreOrderRefusal,
  runningLateResultFromWire,
  type WireOnMyWayResult,
  type WirePreOrderResult,
  type WireRunningLateResult,
} from '../preOrderMapping';
import type { YallaGateway } from '../../gateway';
import type { DinerHttpContext } from './context';

export function preOrdersMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  'replacePreOrder' | 'clearPreOrder' | 'confirmOnMyWay' | 'reportRunningLate'
> {
  const { client } = ctx;
  return {
    // --- Pre-orders (2026-10-21) --------------------------------------------
    //
    // The diner's own booking only; somebody else's answers 404, as for an id
    // that is no booking. Every refusal is read by `preOrderMapping.ts`.

    async replacePreOrder(command): Promise<PreOrderResult> {
      try {
        const { data } = await client.put<WirePreOrderResult>(
          `/api/reservations/${command.reservationId}/pre-order`,
          replacePreOrderBody(command, command.clientCommandId),
        );
        return preOrderResultFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
    },

    async clearPreOrder({ reservationId, clientCommandId }): Promise<PreOrderResult> {
      try {
        const { data } = await client.post<WirePreOrderResult>(
          `/api/reservations/${reservationId}/pre-order/clear`,
          { clientCommandId },
        );
        return preOrderResultFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
    },

    async confirmOnMyWay(reservationId): Promise<OnMyWayResult> {
      try {
        // No body. "Can't come" is the booking's ordinary cancel.
        const { data } = await client.post<WireOnMyWayResult>(
          `/api/reservations/${reservationId}/on-my-way`,
        );
        return onMyWayResultFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
    },

    async reportRunningLate({ reservationId, minutes }): Promise<RunningLateResult> {
      try {
        // Outside the window: `on-my-way-not-open`, as for on my way.
        const { data } = await client.post<WireRunningLateResult>(
          `/api/reservations/${reservationId}/running-late`,
          { minutes },
        );
        return runningLateResultFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
    },
  };
}
