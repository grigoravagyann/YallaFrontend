import type { TabEvent, TabEventType } from '@yalla/api';
import { findSequenceGap } from '@yalla/realtime';

/**
 * Folding a tab's event stream into what the screen shows.
 *
 * The rule that shapes all of this: **an event says that something changed; the
 * money is refetched.** Reconstructing a bill from event payloads would be a
 * second implementation of the billing arithmetic, and the one on the server is
 * the one that is right. So this decides two things and nothing else — whether
 * to refetch, and what to tell the diner changed.
 *
 * The second half matters as much as the first. A total that moves with no
 * explanation is the fastest way to make somebody distrust the app; a line that
 * says *"removed by the waiter"* for a few seconds is the difference between a
 * bill that is wrong and a bill that is being kept.
 */

/**
 * What a change marker says, once, on the line or total it belongs to.
 *
 * `lineName` is the field the reconciliation forced. A `lineVoided` marker used
 * to carry only `lineId`, on the assumption that the refetched bill would still
 * hold that line struck through and the marker would attach to it. It does not:
 * `TabProjection` filters voided lines out of the diner's view entirely, so
 * after the refetch there is nothing to attach to. The name is therefore read
 * from the snapshot the phone held **before** the refetch, and the marker
 * stands alone — "Your Khorovats was removed by the waiter" — which is the only
 * honest thing left to say and, as it turns out, the more readable one.
 */
export interface ChangeMarker {
  readonly type: TabEventType;
  readonly actor: TabEvent['actor'];
  readonly actorName: string | null;
  readonly atUtc: string;
  /** The line it belongs to, when the event names one. */
  readonly lineId: string | null;
  /**
   * The line's name as this device last saw it. `null` when the phone never
   * held the line — it joined late, or the line was never theirs to see.
   */
  readonly lineName: string | null;
  readonly sequence: number;
  /**
   * When this device received it, by its own clock.
   *
   * What a marker ages by. It used to age by the server's `atUtc` against the
   * device clock, so a phone a few seconds out hid every marker the moment it
   * arrived.
   */
  readonly arrivedAtMs: number;
}

/**
 * Events that change what is on the bill.
 *
 * Anything else — somebody renaming themselves, a permission toggle — advances
 * the sequence and is not worth a refetch or a marker. Being explicit about the
 * list is what keeps a chatty stream from making the screen flicker.
 */
const BILL_CHANGING: ReadonlySet<TabEventType> = new Set<TabEventType>([
  'orderPlaced',
  'orderStatusChanged',
  'lineVoided',
  'adjustmentAdded',
  'adjustmentVoided',
  'paymentRecorded',
  'settlementModeChanged',
  'tabClosing',
  'tabClosed',
  'tabAbandoned',
]);

/** Events worth announcing on screen. A payment is not a surprise; a void is. */
const ANNOUNCED: ReadonlySet<TabEventType> = new Set<TabEventType>([
  'orderPlaced',
  'lineVoided',
  'adjustmentAdded',
]);

export type TabStreamUpdate =
  /** Nothing on the bill moved. Advance the sequence and leave the screen alone. */
  | { readonly kind: 'unchanged'; readonly lastSequence: number }
  /** Something changed. Refetch, and show these markers when it lands. */
  | {
      readonly kind: 'refetch';
      readonly reason: 'changed' | 'gap';
      readonly lastSequence: number;
      readonly markers: readonly ChangeMarker[];
    };

/**
 * Apply a page of events.
 *
 * `lastSequence` is where the caller has read up to. A page that is not
 * contiguous with it means something never arrived, and the only safe answer is
 * a full refetch: the events that did arrive may describe a bill that has since
 * been superseded, and nothing on screen would say which part is stale.
 *
 * An **unrecognised event type is not an error**. The backend's own note on the
 * enum says so, and it is right: new types will be added, and a build already on
 * somebody's phone must not break on a tab that used one. It advances the
 * sequence and does nothing else.
 */
export function applyTabEvents(
  lastSequence: number,
  events: readonly TabEvent[],
  /**
   * Resolves a line id to the name this device currently shows for it.
   *
   * Called **before** the refetch, deliberately: a `lineVoided` event names a
   * line that the next tab read will not contain.
   */
  nameLine?: (lineId: string) => string | null,
  /** This device's clock when the page arrived. */
  arrivedAtMs: number = Date.now(),
): TabStreamUpdate {
  if (events.length === 0) return { kind: 'unchanged', lastSequence };

  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);

  const gap = findSequenceGap(
    lastSequence,
    ordered.map((event) => event.sequence),
  );
  if (gap) {
    // Reset to before the page: the caller refetches the tab, reads its own
    // `lastSequence` back from the response, and continues from there.
    return { kind: 'refetch', reason: 'gap', lastSequence, markers: [] };
  }

  const nextSequence = ordered[ordered.length - 1]?.sequence ?? lastSequence;
  const changed = ordered.some((event) => BILL_CHANGING.has(event.type));

  if (!changed) return { kind: 'unchanged', lastSequence: nextSequence };

  const markers = ordered
    .filter((event) => ANNOUNCED.has(event.type))
    // A diner's own order is not news to them; a waiter's is. Announcing your
    // own tap back at you is noise, and noise is what makes people stop reading
    // the markers that matter.
    .filter((event) => event.actor === 'staff')
    .map((event): ChangeMarker => {
      const lineId = typeof event.data?.['lineId'] === 'string' ? event.data['lineId'] : null;
      return {
        type: event.type,
        actor: event.actor,
        actorName: event.actorName,
        atUtc: event.atUtc,
        lineId,
        // Resolved by the caller against what it currently holds, because after
        // the refetch the line is gone. `nameLine` is passed in rather than
        // read here so this stays a pure fold over the page.
        lineName: lineId ? (nameLine?.(lineId) ?? null) : null,
        sequence: event.sequence,
        arrivedAtMs,
      };
    });

  return { kind: 'refetch', reason: 'changed', lastSequence: nextSequence, markers };
}

/** How long a marker stays on screen. Long enough to read, short enough to go. */
export const MARKER_LIFETIME_MS = 8_000;

export function liveMarkers(
  markers: readonly ChangeMarker[],
  nowMs: number,
): readonly ChangeMarker[] {
  return markers.filter((marker) => nowMs - marker.arrivedAtMs < MARKER_LIFETIME_MS);
}
