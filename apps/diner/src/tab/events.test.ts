import { createMockGateway, mockTableCode, type TabEvent } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { applyTabEvents, liveMarkers, MARKER_LIFETIME_MS } from './events';

/**
 * The live bill.
 *
 * Two properties matter and they pull in opposite directions: the screen has to
 * keep up with a waiter adding a spoken order from the tablet, and it must never
 * show a bill assembled from a page of events that was missing one.
 */

function event(sequence: number, overrides: Partial<TabEvent> = {}): TabEvent {
  return {
    sequence,
    tabId: 'tab-1',
    type: 'orderPlaced',
    actor: 'staff',
    actorName: 'Aram',
    atUtc: '2026-09-06T10:00:00Z',
    data: null,
    ...overrides,
  };
}

// --- 5. incremental application versus a full refetch ---------------------

describe('applying a page of events', () => {
  it('does nothing for an empty page', () => {
    expect(applyTabEvents(4, [])).toEqual({ kind: 'unchanged', lastSequence: 4 });
  });

  it('asks for a refetch when the bill changed, and advances the sequence', () => {
    const update = applyTabEvents(4, [event(5), event(6, { type: 'lineVoided' })]);

    expect(update.kind).toBe('refetch');
    if (update.kind !== 'refetch') return;
    expect(update.reason).toBe('changed');
    expect(update.lastSequence).toBe(6);
  });

  it('advances without a refetch for events that do not touch the bill', () => {
    // A rename or a permission toggle is not worth a round trip, and a screen
    // that flickers on every chatty event teaches people to ignore it.
    const update = applyTabEvents(4, [
      event(5, { type: 'participantRenamed' }),
      event(6, { type: 'participantPermissionsChanged' }),
    ]);

    expect(update).toEqual({ kind: 'unchanged', lastSequence: 6 });
  });

  it('ignores an event type it does not recognise but keeps its place', () => {
    // The backend's own note on the enum says clients must do this: new types
    // will be added, and a build already on somebody's phone must not break on
    // a tab that used one.
    const update = applyTabEvents(4, [event(5, { type: 'unknown' })]);
    expect(update).toEqual({ kind: 'unchanged', lastSequence: 5 });
  });

  it('reaches the same state as a full refetch', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t3'),
      commandId: '55555555-5555-4555-8555-555555555555',
    });
    const tab = scan.tab;

    const menu = await gateway.getBranchMenuDetail(tab.branchId);
    const item = (menu?.categories ?? []).flatMap((category) => category.items)[0]!;

    const before = await gateway.getDinerTab(tab.id);
    let cursor = before!.lastSequence;

    await gateway.placeOrder({
      tabId: tab.id,
      clientCommandId: '66666666-6666-4666-8666-666666666666',
      lines: [
        { menuItemId: item.id, quantity: 2, isShared: false, participantId: tab.yourParticipantId },
      ],
    });

    // The incremental path: read the page, decide, refetch.
    const page = await gateway.getTabEvents({ tabId: tab.id, afterSequence: cursor });
    const update = applyTabEvents(cursor, page.events);
    expect(update.kind).toBe('refetch');
    if (update.kind !== 'refetch') return;
    cursor = update.lastSequence;

    const incremental = await gateway.getDinerTab(tab.id);

    // The full-refetch path: throw the cursor away and read everything.
    const full = await gateway.getDinerTab(tab.id);

    expect(incremental?.lines.map((line) => line.id)).toEqual(full?.lines.map((line) => line.id));
    expect(incremental?.money).toEqual(full?.money);
    // And the cursor the incremental path kept matches what a cold read reports,
    // so the next page continues from the right place rather than replaying.
    expect(cursor).toBe(full?.lastSequence);
  });
});

describe('a gap in the sequence', () => {
  it('triggers a full refetch rather than applying what did arrive', () => {
    // Event 5 never came. The events that did arrive may describe a bill that
    // has since been superseded, and nothing on screen would say which part.
    const update = applyTabEvents(4, [event(6), event(7)]);

    expect(update.kind).toBe('refetch');
    if (update.kind !== 'refetch') return;
    expect(update.reason).toBe('gap');
    // The cursor does not move: the caller refetches the tab and reads its own
    // sequence back out of the response.
    expect(update.lastSequence).toBe(4);
    expect(update.markers).toEqual([]);
  });

  it('refuses a page that is contiguous internally but starts late', () => {
    const update = applyTabEvents(10, [event(12), event(13)]);
    expect(update.kind).toBe('refetch');
    if (update.kind !== 'refetch') return;
    expect(update.reason).toBe('gap');
  });
});

// --- staff changes are announced, not silent -------------------------------

describe('what the diner is told', () => {
  it('marks a line a waiter voided, naming who did it', () => {
    const update = applyTabEvents(4, [
      event(5, { type: 'lineVoided', actorName: 'Aram', data: { lineId: 'l7' } }),
    ]);

    expect(update.kind).toBe('refetch');
    if (update.kind !== 'refetch') return;
    expect(update.markers).toHaveLength(1);
    expect(update.markers[0]?.type).toBe('lineVoided');
    expect(update.markers[0]?.actorName).toBe('Aram');
    expect(update.markers[0]?.lineId).toBe('l7');
  });

  it('does not announce the diner their own order back at them', () => {
    // Noise is what makes people stop reading the markers that matter.
    const update = applyTabEvents(4, [event(5, { actor: 'diner', actorName: null })]);

    expect(update.kind).toBe('refetch');
    if (update.kind !== 'refetch') return;
    expect(update.markers).toEqual([]);
  });

  it('keeps a marker long enough to read, then drops it', () => {
    const at = Date.parse('2026-09-06T10:00:00Z');
    const markers = [
      {
        type: 'lineVoided' as const,
        actor: 'staff' as const,
        actorName: 'Aram',
        atUtc: '2026-09-06T10:00:00Z',
        lineId: 'l7',
        sequence: 5,
      },
    ];

    expect(liveMarkers(markers, at + 1_000)).toHaveLength(1);
    expect(liveMarkers(markers, at + MARKER_LIFETIME_MS - 1)).toHaveLength(1);
    expect(liveMarkers(markers, at + MARKER_LIFETIME_MS + 1)).toHaveLength(0);
  });
});
