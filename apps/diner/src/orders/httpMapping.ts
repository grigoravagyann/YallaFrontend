import type { DinerOrder } from '@yalla/api';
import type { Order } from './model';

/**
 * The backend's `DinerOrderView` onto the app's `Order`.
 *
 * Voided lines are dropped from the receipt — the server already leaves them
 * out of `totalAmd`, and a line the diner is not paying for listed at full
 * price would make the items disagree with the total.
 *
 * `cancellable` is the server's `canCancel`, which is always false: there is no
 * diner cancel in the domain, so the button must never be offered for a real
 * order even while it reads "confirmed".
 */
export function orderFromApi(order: DinerOrder): Order {
  const name = order.branchName ? `${order.venueName} · ${order.branchName}` : order.venueName;
  return {
    id: order.orderId,
    placeId: order.branchId,
    placeName: name,
    placePhoto: order.coverPhoto?.thumbnailUrl ?? order.coverPhoto?.cardUrl ?? '',
    kind: order.kind,
    status: order.status,
    ...(order.tableLabel !== null ? { tableLabel: order.tableLabel } : {}),
    ...(order.partySize !== null ? { partySize: order.partySize } : {}),
    placedAt: order.placedAtUtc,
    items: order.items
      .filter((line) => !line.isVoided)
      .map((line) => ({
        id: line.lineId,
        name: line.name,
        quantity: line.quantity,
        unitPriceDram: line.unitPriceAmd,
        ...(line.note ? { note: line.note } : {}),
      })),
    totalDram: order.totalAmd,
    timeline: order.timeline.map((entry) => ({ status: entry.status, at: entry.atUtc })),
    cancellable: order.canCancel,
  };
}
