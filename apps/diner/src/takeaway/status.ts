import type { TakeawayOrder, TakeawayStatus } from '@yalla/api';

/**
 * What the takeaway status screen says, decided from the order the server
 * last returned. Pure, so every state is tested without rendering.
 */

/** The four steps an order walks; `accepted` reads "Accepted · being prepared". */
export const TAKEAWAY_STEPS = ['sent', 'accepted', 'ready', 'collected'] as const;
export type TakeawayStep = (typeof TAKEAWAY_STEPS)[number];

export interface StepView {
  readonly step: TakeawayStep;
  /** Done before now, where the order is now, or still to come. */
  readonly state: 'done' | 'current' | 'todo';
  /** When it happened; `null` for a step still to come (or a server that did not say). */
  readonly atUtc: string | null;
}

/** Which step an order is at; `null` when it left the walk (declined, cancelled, not collected). */
export function currentStep(status: TakeawayStatus): TakeawayStep | null {
  return (TAKEAWAY_STEPS as readonly string[]).includes(status) ? (status as TakeawayStep) : null;
}

/** The steps with their times. Empty for an order that left the walk. */
export function takeawaySteps(order: TakeawayOrder): readonly StepView[] {
  const current = currentStep(order.status);
  if (!current) return [];
  const at = TAKEAWAY_STEPS.indexOf(current);
  const times: Record<TakeawayStep, string | null> = {
    sent: order.sentAtUtc,
    accepted: order.acceptedAtUtc,
    ready: order.readyMarkedAtUtc,
    collected: order.collectedAtUtc,
  };
  return TAKEAWAY_STEPS.map((step, index) => ({
    step,
    // The last step is done, not "current": a collected order is finished.
    state:
      index < at || (index === at && step === 'collected')
        ? 'done'
        : index === at
          ? 'current'
          : 'todo',
    atUtc: index <= at ? times[step] : null,
  }));
}

/** The words for where the order stands: title, body and the line under the code. */
export type StatusCase =
  | 'sent'
  | 'accepted'
  | 'ready'
  | 'collected'
  | 'declined'
  | 'declinedNoAnswer'
  | 'cancelled'
  | 'noShow';

export function statusCase(order: Pick<TakeawayOrder, 'status' | 'declinedBecause'>): StatusCase {
  switch (order.status) {
    case 'declined':
      return order.declinedBecause === 'noAnswer' ? 'declinedNoAnswer' : 'declined';
    case 'sent':
    case 'accepted':
    case 'ready':
    case 'collected':
    case 'cancelled':
    case 'noShow':
      return order.status;
    default:
      // A status a newer server added: said as sent — nothing is offered on it.
      return 'sent';
  }
}

/** The code is what is said at the counter: shown while it can still be collected. */
export function showsCode(status: TakeawayStatus): boolean {
  return status === 'sent' || status === 'accepted' || status === 'ready';
}

/**
 * "Ready around 19:05" while sent (the time asked for), "Ready at 19:10" once
 * accepted (the time promised), "Waiting for you since 19:10" once ready.
 */
export function readyLine(
  order: Pick<TakeawayOrder, 'status' | 'requestedPickupAt' | 'readyAt'>,
): { readonly key: string; readonly time: string } | null {
  switch (order.status) {
    case 'sent':
      return { key: 'takeaway.status.readyAround', time: order.requestedPickupAt };
    case 'accepted':
      return { key: 'takeaway.status.readyAt', time: order.readyAt ?? order.requestedPickupAt };
    case 'ready':
      return {
        key: 'takeaway.status.waitingSince',
        time: order.readyAt ?? order.requestedPickupAt,
      };
    default:
      return null;
  }
}
