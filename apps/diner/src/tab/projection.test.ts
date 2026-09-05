import type { DinerTabView, TabLine } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { ownItemsSubtotalDram, projectTab } from './projection';

/**
 * What a diner is shown, and what they are deliberately not shown.
 *
 * The case that matters is the guest whose host has hidden the table total. The
 * failure to guard against is not an exception — it is a screen that renders
 * `0 ֏` where there should be nothing at all, which reads as a free meal.
 */

const ME = 'p-me';
const THEM = 'p-them';

function line(id: string, overrides: Partial<TabLine> = {}): TabLine {
  return {
    id,
    orderId: 'o1',
    menuItemId: 'cappuccino',
    name: 'Cappuccino',
    quantity: 1,
    unitPriceDram: 1200,
    lineTotalDram: 1200,
    note: null,
    isShared: false,
    isTableAttributed: false,
    participantId: ME,
    orderedByName: 'AM',
    sharedWithCount: 1,
    status: 'active',
    voidReason: null,
    voidedByName: null,
    voidedAtUtc: null,
    placedAtUtc: '2026-09-06T10:00:00Z',
    orderStatus: 'new',
    ...overrides,
  };
}

function tab(overrides: Partial<DinerTabView> = {}): DinerTabView {
  return {
    tabId: 'tab-1',
    branchId: 'b1',
    tableLabel: '7',
    timeZoneId: 'Asia/Yerevan',
    status: 'open',
    settlementMode: 'everyonePaysOwnItems',
    settlementModeLocked: false,
    lines: [line('l1')],
    adjustments: [],
    money: {
      kind: 'table',
      bill: {
        subtotalDram: 1200,
        serviceChargeDram: 120,
        totalDram: 1320,
        paidDram: 0,
        remainingDram: 1320,
        absorbedFromRemovedDram: 0,
      },
      serviceChargePercent: 10,
      yourShare: {
        participantId: ME,
        displayName: 'Ani',
        isHost: true,
        ownItemsDram: 1200,
        sharedItemsDram: 0,
        absorbedFromRemovedDram: 0,
        personalDram: 1200,
        serviceChargeDram: 120,
        shareDram: 1320,
        paidDram: 0,
      },
    },
    lastSequence: 4,
    asOfUtc: '2026-09-06T10:01:00Z',
    ...overrides,
  };
}

// --- 3. the permission projection -----------------------------------------

describe('a participant who may see the table total', () => {
  it('gets the subtotal, the service charge as its own line, and the total', () => {
    const rendered = projectTab(tab(), ME);

    expect(rendered.showsTableTotal).toBe(true);
    expect(rendered.money.kind).toBe('table');
    if (rendered.money.kind !== 'table') return;

    expect(rendered.money.subtotalDram).toBe(1200);
    // Its own line, present from the very first item, with the branch's
    // percentage beside it — never revealed at checkout, never folded in.
    expect(rendered.money.serviceChargeDram).toBe(120);
    expect(rendered.money.serviceChargePercent).toBe(10);
    expect(rendered.money.totalDram).toBe(1320);
    expect(rendered.money.yourShareDram).toBe(1320);
  });
});

describe('a participant whose host has hidden the total', () => {
  const hidden = tab({
    money: { kind: 'ownItemsOnly', yourItemsSubtotalDram: 1200, serviceChargePercent: 10 },
  });

  it('renders their own lines and their own subtotal', () => {
    const rendered = projectTab(hidden, ME);

    expect(rendered.lines).toHaveLength(1);
    expect(rendered.lines[0]?.isMine).toBe(true);
    expect(rendered.money.kind).toBe('ownItemsOnly');
    if (rendered.money.kind !== 'ownItemsOnly') return;
    expect(rendered.money.yourItemsSubtotalDram).toBe(1200);
  });

  it('has no table aggregate at all — not a zero, not a dash', () => {
    const rendered = projectTab(hidden, ME);

    expect(rendered.showsTableTotal).toBe(false);

    // The assertion is the *absence*. A `totalDram` that could be `0` is one
    // careless render away from a bill that says the table owes nothing, so the
    // aggregate is not a nullable field — it is not on this branch of the union
    // at all, and a screen cannot reach it without narrowing.
    const money = rendered.money as Record<string, unknown>;
    expect('totalDram' in money).toBe(false);
    expect('subtotalDram' in money).toBe(false);
    expect('serviceChargeDram' in money).toBe(false);
    expect('remainingDram' in money).toBe(false);
    expect('yourShareDram' in money).toBe(false);
    expect(money['totalDram']).toBeUndefined();

    // The branch's percentage is still stated: a fact about the venue, not an
    // aggregate, so a guest can be told a service charge applies without being
    // told what the table owes.
    if (rendered.money.kind !== 'ownItemsOnly') return;
    expect(rendered.money.serviceChargePercent).toBe(10);
  });

  it('shows no adjustments, which only mean something beside a total', () => {
    expect(projectTab(hidden, ME).adjustments).toEqual([]);
  });
});

// --- 4. a voided line ------------------------------------------------------

describe('a voided line', () => {
  const withVoid = tab({
    lines: [
      line('l1'),
      line('l2', {
        name: 'Gata',
        unitPriceDram: 850,
        lineTotalDram: 850,
        status: 'voided',
        voidReason: 'kitchenError',
        voidedByName: 'Aram',
      }),
    ],
    money: { kind: 'ownItemsOnly', yourItemsSubtotalDram: 1200, serviceChargePercent: 10 },
  });

  it('stays on the bill, struck through and labelled with its reason', () => {
    const rendered = projectTab(withVoid, ME);

    // Nothing disappears silently from a bill somebody is watching.
    expect(rendered.lines).toHaveLength(2);
    const voided = rendered.lines[1]!;
    expect(voided.isVoided).toBe(true);
    expect(voided.voidReason).toBe('kitchenError');
    expect(voided.voidedByName).toBe('Aram');
  });

  it('is excluded from the participant own subtotal', () => {
    const rendered = projectTab(withVoid, ME);
    const subtotal = ownItemsSubtotalDram(rendered.lines, ME, withVoid.lines);

    // A struck-through row that still adds to a subtotal is the kind of thing a
    // guest spots and nobody at the table can explain.
    expect(subtotal).toBe(1200);
    if (rendered.money.kind !== 'ownItemsOnly') return;
    expect(subtotal).toBe(rendered.money.yourItemsSubtotalDram);
  });
});

// --- 6. the shared badge ---------------------------------------------------

describe('a shared line badge', () => {
  it('reads the split count from the line snapshot, not the current party', () => {
    // The bottle was shared three ways. Two more people have joined since, and
    // the badge must still say three — the amount beside it was computed from
    // three, and a badge that says five beside a third of the price is a bill
    // nobody can check.
    const rendered = projectTab(
      tab({
        lines: [
          line('l1', {
            name: 'Tarragon lemonade',
            isShared: true,
            sharedWithCount: 3,
            lineTotalDram: 3900,
            participantId: THEM,
            orderedByName: 'DK',
          }),
        ],
      }),
      ME,
    );

    const shared = rendered.lines[0]!;
    expect(shared.isShared).toBe(true);
    expect(shared.sharedWithCount).toBe(3);
    expect(shared.isMine).toBe(false);
    // And whose it is, so nobody has to ask.
    expect(shared.orderedByName).toBe('DK');
  });

  it('treats a table-attributed line as shared', () => {
    // A waiter keyed in a spoken order and could not say who asked for it. It
    // still splits, so it reads as shared rather than as nobody's.
    const rendered = projectTab(
      tab({
        lines: [
          line('l1', {
            isShared: false,
            isTableAttributed: true,
            participantId: null,
            orderedByName: null,
            sharedWithCount: 4,
          }),
        ],
      }),
      ME,
    );

    expect(rendered.lines[0]?.isShared).toBe(true);
    expect(rendered.lines[0]?.sharedWithCount).toBe(4);
  });
});
