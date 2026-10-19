// @vitest-environment jsdom
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { ConflictList, type ConflictListProps } from './ConflictList';
import type { ConflictEntry, QueuedCommand } from './commands/types';

/**
 * The conflicts screen's cards, one per kind of refusal (floor-tablet
 * `Conflicts` artboard): what each says, and which offer "…anyway".
 */

const ME = 's-ani';
const AT = Date.UTC(2026, 9, 19, 14, 24); // 18:24 in Yerevan

function command(
  id: string,
  body: QueuedCommand['body'],
  overrides: Partial<QueuedCommand> = {},
): QueuedCommand {
  return {
    id,
    kind: body.kind,
    scope: 't7',
    seq: 1,
    takenAtMs: AT,
    attempts: 1,
    precondition: { expectedFromStatus: 'free', rowVersion: 'v1' },
    takenOffline: true,
    subject: { tableId: 't7', tableLabel: '7', tabId: 'tab7', itemCount: 2 },
    body,
    by: { staffMemberId: ME, name: 'Ani Petrosyan' },
    ...overrides,
  };
}

const table = (kind: 'seatWalkIn' | 'freeTable' | 'hold') =>
  ({
    kind,
    command: { kind, branchId: 'b1', tableId: 't7', clientCommandId: 'x', partySize: 2 },
  }) as QueuedCommand['body'];

function entry(
  cmd: QueuedCommand,
  reason: ConflictEntry['reason'],
  rest: Partial<ConflictEntry> = {},
): ConflictEntry {
  return { command: cmd, detectedAtMs: AT + 60_000, reason, observed: null, ...rest };
}

const observed = (overrides: Partial<NonNullable<ConflictEntry['observed']>> = {}) => ({
  tableId: 't7',
  tableLabel: '7',
  attemptedFromStatus: 'free' as const,
  currentStatus: 'occupied' as const,
  currentSessionId: 's',
  failure: 'statusChanged' as const,
  ...overrides,
});

function renderList(props: Partial<ConflictListProps>) {
  const handlers = {
    onDiscard: vi.fn(),
    onApplyAnyway: vi.fn(),
    onClaim: vi.fn(),
    onDrop: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <I18nextProvider i18n={i18next}>
      <ConflictList
        conflicts={[]}
        held={[]}
        queue={[]}
        recent={[]}
        online
        actorId={ME}
        timeZoneId="Asia/Yerevan"
        backTo="floor"
        {...handlers}
        {...props}
      />
    </I18nextProvider>,
  );
  return handlers;
}

const card = (name: RegExp) => screen.getByRole('article', { name });

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => cleanup());

describe('a card per refusal', () => {
  it('seat at a table somebody took: says so, and offers no "anyway" the server would refuse', () => {
    renderList({
      conflicts: [
        entry(command('c1', table('seatWalkIn')), 'precondition', { observed: observed() }),
      ],
    });
    const seat = card(/^Table 7 is occupied and has an open tab$/u);
    expect(
      within(seat).getByText('Your “seat a walk-in” from 18:24 was not applied.'),
    ).toBeTruthy();
    expect(
      within(seat).getByText('Somebody else changed the table while your action waited.'),
    ).toBeTruthy();
    expect(
      within(seat)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Discard the action']);
    expect(
      within(seat).getByText(
        'It cannot be sent again: the table is occupied and has an open tab now.',
      ),
    ).toBeTruthy();
  });

  it('seat at a table that is free again but was used: offers "Seat them anyway" and says what it skips', async () => {
    const handlers = renderList({
      conflicts: [
        entry(command('c1', table('seatWalkIn')), 'precondition', {
          observed: observed({ currentStatus: 'free', failure: 'tableChangedAndChangedBack' }),
        }),
      ],
    });
    const seat = card(/^Table 7 is free again, but it has been used since$/u);
    expect(
      within(seat).getByText('“Seat them anyway” sends it again without checking the table.'),
    ).toBeTruthy();

    await userEvent.setup().click(within(seat).getByRole('button', { name: 'Seat them anyway' }));
    expect(handlers.onApplyAnyway).toHaveBeenCalledWith('c1');
    expect(card(/Sent without the check\. Look at the table on the floor\.$/u)).toBeTruthy();
    expect(screen.getByText('Table 7 · sent anyway').getAttribute('role')).toBe('status');
  });

  it('free a table: never "anyway", because it would free whoever sits there now', () => {
    renderList({
      conflicts: [
        entry(command('c1', table('freeTable')), 'precondition', {
          observed: observed({ failure: 'tableChangedAndChangedBack' }),
        }),
      ],
    });
    const free = card(/^Table 7 is occupied and has an open tab again/u);
    expect(within(free).queryByRole('button', { name: /anyway/u })).toBeNull();
    expect(
      within(free).getByText(
        'Not sent again from here: it would act on whoever is at the table now.',
      ),
    ).toBeTruthy();
  });

  it('an order refused for a sold-out dish, a guest taken off, or a closed tab: in words, never "anyway"', () => {
    const order = (id: string) =>
      command(id, {
        kind: 'placeOrder',
        command: { tabId: 'tab7', clientCommandId: id, lines: [] },
      });
    renderList({
      conflicts: [
        entry(order('o1'), 'refused', { refusal: { kind: 'soldOut', itemName: 'Gata' } }),
        entry(order('o2'), 'refused', {
          refusal: { kind: 'guestUnavailable', participantId: 'p1', guestState: 'removed' },
          command: {
            ...order('o2'),
            subject: { tableId: null, tableLabel: '8', tabId: 'tab8', itemCount: 1 },
          },
        }),
        entry(order('o3'), 'refused', {
          refusal: { kind: 'notAccepting', tabStatus: 'closed' },
          command: {
            ...order('o3'),
            subject: { tableId: null, tableLabel: '9', tabId: 'tab9', itemCount: 3 },
          },
        }),
      ],
    });
    expect(
      within(card(/^Table 7 · the order/u)).getByText('Gata has sold out. Nothing was sent.'),
    ).toBeTruthy();
    expect(
      within(card(/^Table 8 · the order/u)).getByText(
        'A guest was taken off the tab. Nothing was sent.',
      ),
    ).toBeTruthy();
    expect(
      within(card(/^Table 9 · the order/u)).getByText(
        'This tab is paid and closed, and takes no more orders. Nothing was sent.',
      ),
    ).toBeTruthy();
    for (const label of ['7', '8', '9']) {
      const order = card(new RegExp(`^Table ${label} · the order`, 'u'));
      expect(
        within(order)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Discard the action']);
      expect(within(order).getByText(/an order changes a bill/u)).toBeTruthy();
    }
  });

  it('a move somebody already made, a call already answered, a thing gone, a sign-in not allowed', () => {
    const ready = command('s1', {
      kind: 'setOrderStatus',
      command: { orderId: 'o1', status: 'ready', clientCommandId: 's1' },
    });
    const ack = (id: string, label: string) =>
      command(
        id,
        { kind: 'acknowledgeServiceRequest', command: { requestId: 'r', clientCommandId: id } },
        {
          subject: { tableId: null, tableLabel: label, tabId: 'tab' },
        },
      );
    renderList({
      conflicts: [
        entry(ready, 'conflict'),
        entry(ack('a1', '3'), 'refused'),
        entry(ack('a2', '5'), 'refused', { refusal: { kind: 'notFound' } }),
        entry(ack('a3', '6'), 'refused', { refusal: { kind: 'forbidden' } }),
      ],
    });
    expect(
      within(card(/^Table 7 · the order had moved on$/u)).getByText(
        'Somebody else had already moved this order on.',
      ),
    ).toBeTruthy();
    expect(
      within(card(/^Table 3 · the call was already answered$/u)).getByText(
        'Somebody else had already answered this call.',
      ),
    ).toBeTruthy();
    expect(
      within(card(/^Table 5 · it is no longer there$/u)).getByText('The call is no longer there.'),
    ).toBeTruthy();
    expect(card(/^Table 6 · not allowed under this sign-in$/u)).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /anyway/u })).toEqual([]);
  });

  it("names the person when it was somebody else's action", () => {
    renderList({
      conflicts: [
        entry(
          command('c1', table('hold'), {
            by: { staffMemberId: 's-narek', name: 'Narek Hakobyan' },
          }),
          'precondition',
          { observed: observed({ currentStatus: 'free', failure: 'tableChangedAndChangedBack' }) },
        ),
      ],
    });
    expect(screen.getByText('Narek’s “hold the table” from 18:24 was not applied.')).toBeTruthy();
  });
});

describe('the queue beside the cards', () => {
  it('lists what waits, what was refused and what went, with the offline note', () => {
    const waiting = command('w1', table('seatWalkIn'), {
      subject: { tableId: 't2', tableLabel: '2', tabId: null },
    });
    const sent = command(
      's1',
      {
        kind: 'placeOrder',
        command: { tabId: 'tab8', clientCommandId: 's1', lines: [] },
      },
      { subject: { tableId: null, tableLabel: '8', tabId: 'tab8', itemCount: 2 } },
    );
    renderList({
      online: false,
      queue: [waiting],
      conflicts: [
        entry(command('c1', table('freeTable')), 'precondition', { observed: observed() }),
      ],
      recent: [{ command: sent, atMs: AT }],
    });
    const side = screen.getByRole('complementary', { name: 'The queue' });
    expect(within(side).getByText('1 waiting · 1 refused · 1 sent')).toBeTruthy();
    expect(
      within(side)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Seat · table 2 · 2 guests18:24 · waiting',
      'Free · table 718:24 · refused · needs a decision',
      'Order · table 8 · 2 dishes18:24 · sent',
    ]);
    expect(within(side).getByText(/Seating, orders and freeing a table are kept/u)).toBeTruthy();
  });

  it('says nothing waits on you when nothing does, and goes back', async () => {
    const handlers = renderList({});
    expect(screen.getByText('Nothing is waiting on you')).toBeTruthy();
    expect(screen.getByText('Every action has been applied.')).toBeTruthy();
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Back to the floor' })[1]!);
    expect(handlers.onClose).toHaveBeenCalled();
  });
});

describe('the FT4 review fixes', () => {
  const heldSeat = command('h1', table('seatWalkIn'), {
    by: { staffMemberId: 's-narek', name: 'Narek Hakobyan' },
  });

  it('N1 and live QA 4: a list of held commands only says they wait for their person, not that anything changed', () => {
    renderList({ held: [heldSeat], queue: [heldSeat] });
    expect(
      screen.getByText(
        'These were taken under somebody else’s sign-in. Each goes by itself when its person signs in again, or when you decide here.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/changed in the meantime/u)).toBeNull();
  });

  it('S3: does not offer the kitchen to send a waiter’s seat under its name, and says why', () => {
    renderList({ held: [heldSeat], queue: [heldSeat], role: 'kitchen' });
    const card = screen.getByRole('article', { name: /^Table 7\. Waiting for Narek/u });
    expect(within(card).queryByRole('button', { name: 'Send under my name' })).toBeNull();
    expect(
      within(card).getByText('Your role cannot send this. Narek can, or a waiter or a manager.'),
    ).toBeTruthy();
  });

  it('S3: a claim says it is on its way, not that it was sent, and an order does not promise the name', async () => {
    const order = command(
      'h2',
      { kind: 'placeOrder', command: { tabId: 'tab7', clientCommandId: 'h2', lines: [] } },
      { by: { staffMemberId: 's-narek', name: 'Narek Hakobyan' } },
    );
    renderList({ held: [order], queue: [order], role: 'waiter' });
    expect(
      screen.getByText(
        'It goes under your name, unless its first try already reached the kitchen.',
      ),
    ).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send under my name' }));
    expect(screen.getByText('Under your name; on its way.')).toBeTruthy();
  });

  it('S5: is a modal that starts on its back button, closes on Escape, and keeps focus on the card it settled', async () => {
    const user = userEvent.setup();
    const handlers = renderList({
      conflicts: [
        entry(command('c1', table('seatWalkIn')), 'precondition', { observed: observed() }),
      ],
    });
    const dialog = screen.getByRole('dialog', { name: 'Needs a decision' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(
      screen.getAllByRole('button', { name: 'Back to the floor' })[0],
    );

    await user.click(screen.getByRole('button', { name: 'Discard the action' }));
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Table 7 is occupied/u);

    await user.keyboard('{Escape}');
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('N3: a settled card goes when the same command is back as a fresh refusal', async () => {
    const seat = command('c1', table('seatWalkIn'));
    const free = entry(seat, 'precondition', {
      observed: observed({ currentStatus: 'free', failure: 'tableChangedAndChangedBack' }),
    });
    const props = { conflicts: [free] };
    const { rerender } = renderListWithRerender(props);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Seat them anyway' }));
    rerender({ conflicts: [] });
    expect(screen.getByText(/Sent without the check/u)).toBeTruthy();
    rerender({ conflicts: [entry(seat, 'refused')] });
    expect(screen.queryByText(/Sent without the check/u)).toBeNull();
  });

  it('N8: a command with no name says "somebody", never an empty name', () => {
    const nameless = command('h3', table('hold'), { by: { staffMemberId: 's-x', name: ' ' } });
    renderList({ held: [nameless], queue: [nameless] });
    expect(screen.getByRole('article', { name: /^Table 7\. Waiting for somebody/u })).toBeTruthy();
  });
});

function renderListWithRerender(props: Partial<ConflictListProps>) {
  const base = {
    conflicts: [],
    held: [],
    queue: [],
    recent: [],
    online: true,
    actorId: ME,
    timeZoneId: 'Asia/Yerevan',
    backTo: 'floor' as const,
    onDiscard: vi.fn(),
    onApplyAnyway: vi.fn(),
    onClaim: vi.fn(),
    onDrop: vi.fn(),
    onClose: vi.fn(),
  };
  const view = (next: Partial<ConflictListProps>) => (
    <I18nextProvider i18n={i18next}>
      <ConflictList {...base} {...next} />
    </I18nextProvider>
  );
  const result = render(view(props));
  return { rerender: (next: Partial<ConflictListProps>) => result.rerender(view(next)) };
}
