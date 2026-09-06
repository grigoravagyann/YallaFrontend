// @vitest-environment jsdom
import type { PublicBranch } from '@yalla/api';
import { useSlotFloor } from '@yalla/api/react';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomSection } from './RoomSection';
import { addDays, branchToday, defaultSelection, slotInstant, type SlotSelection } from './slots';
import { createHarness, initTestI18n, stubIntersectionObserverAsNeverVisible } from './testHarness';

/**
 * The three controls above the room are server inputs, and the room answers to
 * all three.
 *
 * Before this, only party size did anything visible and it did it locally — the
 * plan re-dimmed tables it had already been given. The time control changed
 * nothing at all: the room was drawn from a floor-state call meaning *now*, so
 * a visitor picking Saturday at 20:00 was looking at Wednesday teatime with a
 * Saturday label above it.
 */

process.env['TZ'] = 'Europe/Moscow';

const VENUE = 'lumen-coffee';
const BRANCH = 'northern-avenue';

beforeAll(async () => {
  await initTestI18n();
});

beforeEach(() => {
  stubIntersectionObserverAsNeverVisible();
});

afterEach(cleanup);

async function branchOf(harness: ReturnType<typeof createHarness>): Promise<PublicBranch> {
  const branch = await harness.publicGateway.resolveBranch({
    venueSlug: VENUE,
    branchSlug: BRANCH,
  });
  if (!branch) throw new Error('fixture branch missing');
  return branch;
}

describe('the room refetches for every control', () => {
  /** Short but real: fake timers and React Query together are a flake factory. */
  const DEBOUNCE_MS = 40;

  function harnessWithSpy() {
    const harness = createHarness();
    const spy = vi.spyOn(harness.gateway, 'getSlotFloor');
    const wrapper = ({ children }: { children: ReactNode }) => <>{harness.wrap(children)}</>;
    return { harness, spy, wrapper };
  }

  it('asks again when the time changes, and asks about the new time', async () => {
    const { harness, spy, wrapper } = harnessWithSpy();
    const branch = await branchOf(harness);

    const eight = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
    const nine = new Date(Date.now() + 4 * 60 * 60_000).toISOString();

    const { result, rerender } = renderHook(
      (props: { slotUtc: string }) =>
        useSlotFloor({
          branchId: branch.id,
          slotUtc: props.slotUtc,
          partySize: 2,
          timeZoneId: branch.timeZoneId,
          debounceMs: DEBOUNCE_MS,
        }),
      { wrapper, initialProps: { slotUtc: eight } },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(spy).toHaveBeenCalledTimes(1);

    rerender({ slotUtc: nine });

    // The time is not debounced: it comes from a picker, one deliberate change
    // at a time, and waiting on it would make the control feel broken.
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]?.[0]?.slotUtc).toBe(nine);
  });

  it('coalesces a run up the party-size stepper into one request', async () => {
    const { harness, spy, wrapper } = harnessWithSpy();
    const branch = await branchOf(harness);
    const slotUtc = new Date(Date.now() + 3 * 60 * 60_000).toISOString();

    const { result, rerender } = renderHook(
      (props: { partySize: number }) =>
        useSlotFloor({
          branchId: branch.id,
          slotUtc,
          partySize: props.partySize,
          timeZoneId: branch.timeZoneId,
          debounceMs: DEBOUNCE_MS,
        }),
      { wrapper, initialProps: { partySize: 2 } },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(spy).toHaveBeenCalledTimes(1);

    // Somebody tapping 2 → 6. Four taps inside a second, four different
    // questions, and only the last one is the question they are asking.
    for (const partySize of [3, 4, 5, 6]) rerender({ partySize });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2), { timeout: 1000 });
    expect(spy.mock.calls[1]?.[0]?.partySize).toBe(6);

    // And it stays at two: nothing arrives late for a size nobody selected.
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 4));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('still asks once for a single deliberate party-size change', async () => {
    const { harness, spy, wrapper } = harnessWithSpy();
    const branch = await branchOf(harness);
    const slotUtc = new Date(Date.now() + 3 * 60 * 60_000).toISOString();

    const { result, rerender } = renderHook(
      (props: { partySize: number }) =>
        useSlotFloor({
          branchId: branch.id,
          slotUtc,
          partySize: props.partySize,
          timeZoneId: branch.timeZoneId,
          debounceMs: DEBOUNCE_MS,
        }),
      { wrapper, initialProps: { partySize: 2 } },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ partySize: 4 });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]?.[0]?.partySize).toBe(4);
  });
});

/** Drives `RoomSection` the way `BranchRoute` does, so the controls are live. */
function LiveRoom({ branch, initial }: { branch: PublicBranch; initial: SlotSelection }) {
  const [selection, setSelection] = useState(initial);
  return (
    <RoomSection
      branch={branch}
      selection={selection}
      onSelectionChange={setSelection}
      slotUtc={slotInstant(selection, branch.timeZoneId).toISOString()}
      selectedTableId={null}
      onTableTap={() => {}}
      takenTableLabel={null}
    />
  );
}

describe('a slot the branch refuses', () => {
  it('says why, rather than drawing an empty room', async () => {
    const harness = createHarness();
    const branch = await branchOf(harness);

    // Yesterday. The server names this `pastLeadTime`; a room with every table
    // greyed out would read as "fully booked", which is a different fact and
    // sends the visitor away instead of to the date picker.
    const yesterday = addDays(branchToday(branch.timeZoneId), -1);
    const selection = {
      ...defaultSelection(branch.timeZoneId, new Date()),
      date: yesterday,
      partySize: 2,
    };

    render(harness.wrap(<LiveRoom branch={branch} initial={selection} />));

    await waitFor(() => expect(screen.getByText(/too soon to book this table/i)).toBeTruthy());
  });

  it('clears the notice once a bookable slot is picked', async () => {
    const harness = createHarness();
    const branch = await branchOf(harness);

    const yesterday = addDays(branchToday(branch.timeZoneId), -1);
    const selection = {
      ...defaultSelection(branch.timeZoneId, new Date()),
      date: yesterday,
      partySize: 2,
    };

    render(harness.wrap(<LiveRoom branch={branch} initial={selection} />));
    await waitFor(() => expect(screen.getByText(/too soon to book this table/i)).toBeTruthy());

    // Moving the date is the next step the notice exists to prompt, so the
    // control has to actually change the answer.
    // `fireEvent.change` rather than typing: a `type="date"` input passes
    // through an empty value between clear and type, and the page has no slot
    // to ask about at that instant.
    const tomorrow = addDays(branchToday(branch.timeZoneId), 1);
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: tomorrow } });

    await waitFor(() => expect(screen.queryByText(/too soon to book this table/i)).toBeNull());
  });
});
