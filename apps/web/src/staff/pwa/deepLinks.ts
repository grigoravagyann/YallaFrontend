/**
 * Where a staff push opens (`docs/notifications.md` §6a, the `url` column).
 *
 * | Push | Link | Opens |
 * |---|---|---|
 * | approvals | `/staff/approve/{reservationId}` | the booking's Approve screen (the tablet: the floor, its rail) |
 * | guestMessages | `/staff/messages/{conversationId}` | that thread |
 * | tableCalls | `/staff/now?call={serviceRequestId}` | Now, calls first (the tablet: the floor) |
 * | takeaway | `/staff/takeaway/{orderId}` | the counter |
 * | kitchenReady | `/staff/floor?table={tableId}` | the floor with that table's panel up |
 *
 * Each is read once, then the address goes back to the screen's own
 * (`/staff`, or `/staff/messages`), so Back does not reopen it.
 */
export type StaffLink =
  | { readonly kind: 'approve'; readonly reservationId: string }
  | { readonly kind: 'message'; readonly conversationId: string }
  | { readonly kind: 'call'; readonly requestId: string | null }
  | { readonly kind: 'takeaway'; readonly orderId: string | null }
  | { readonly kind: 'table'; readonly tableId: string | null };

export function staffLinkOf(pathname: string, search: string): StaffLink | null {
  const path = pathname.replace(/\/+$/u, '');
  const query = new URLSearchParams(search);
  const segment = (prefix: string) => {
    const match = new RegExp(`^/staff/${prefix}/([^/]+)$`, 'u').exec(path);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  };

  const reservationId = segment('approve');
  if (reservationId) return { kind: 'approve', reservationId };
  const conversationId = segment('messages');
  if (conversationId) return { kind: 'message', conversationId };
  if (path === '/staff/now') return { kind: 'call', requestId: query.get('call') };
  if (path === '/staff/takeaway') return { kind: 'takeaway', orderId: null };
  const orderId = segment('takeaway');
  if (orderId) return { kind: 'takeaway', orderId };
  if (path === '/staff/floor') return { kind: 'table', tableId: query.get('table') };
  return null;
}
