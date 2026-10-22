// @vitest-environment jsdom
import {
  ADMITTED,
  type ServiceRequest,
  type StaffTab,
  type TabLine,
  type UserRole,
} from '@yalla/api';
import { formatDram } from '@yalla/format';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { TabPanel, type TabPanelProps } from './TabPanel';

/**
 * The tab (floor-tablet `Tab`), and who may do what on it (HANDOFF §3, decided
 * by the user): a waiter and above takes cash, voids a line with a reason and
 * answers the bill request; a manager and above alone comps, takes % or an
 * amount off the whole tab, and marks it unpaid. A waiter sees one muted line
 * where those three would be.
 */

const dram = (amount: number) => formatDram(amount, 'en').replace(/\s/gu, ' ');
const text = (element: Element) => (element.textContent ?? '').replace(/\s/gu, ' ');
/** An accessible name, with the formatter's no-break spaces read as spaces. */
const named = (expected: string) => (name: string) => name.replace(/\s/gu, ' ') === expected;

function line(overrides: Partial<TabLine>): TabLine {
  return {
    id: 'l1',
    orderId: 'o1',
    menuItemId: 'm1',
    name: 'Steak',
    quantity: 1,
    unitPriceDram: 9_800,
    lineTotalDram: 9_800,
    note: null,
    isShared: false,
    isTableAttributed: false,
    participantId: null,
    orderedByName: null,
    onBehalfOfParticipantId: null,
    sharedWithCount: 0,
    status: 'active',
    voidReason: null,
    voidedByName: null,
    placedAtUtc: '2026-10-19T14:00:00Z',
    orderStatus: 'served',
    ...overrides,
  };
}

const LINES: readonly TabLine[] = [
  line({
    id: 'steak',
    name: 'Steak',
    quantity: 2,
    lineTotalDram: 19_600,
    onBehalfOfParticipantId: 'gor',
    note: 'Medium',
  }),
  line({
    id: 'khor',
    name: 'Khorovats',
    unitPriceDram: 6_400,
    lineTotalDram: 6_400,
    isShared: true,
    sharedWithCount: 2,
  }),
  line({
    id: 'latte',
    name: 'Latte',
    quantity: 2,
    unitPriceDram: 1_400,
    lineTotalDram: 2_800,
    orderStatus: 'inKitchen',
    onBehalfOfParticipantId: 'ani',
  }),
  line({
    id: 'cake',
    name: 'Cake',
    unitPriceDram: 2_200,
    lineTotalDram: 2_200,
    orderStatus: 'ready',
    isTableAttributed: true,
  }),
  line({
    id: 'negroni',
    name: 'Negroni',
    unitPriceDram: 3_400,
    lineTotalDram: 0,
    status: 'voided',
    voidReason: 'Wrong item',
  }),
];

// The lines come to 31 000; the server's subtotal has 1 000 taken off.
const TAB: StaffTab = {
  id: 'tab-1',
  branchId: 'b1',
  tableId: 't4',
  tableLabel: '4',
  status: 'open',
  admission: ADMITTED,
  settlementMode: 'everyonePaysOwnItems',
  settlementModeLocked: false,
  openedAtUtc: '2026-10-19T12:28:00Z',
  closedAtUtc: null,
  hostParticipantId: 'gor',
  participants: [
    {
      id: 'gor',
      displayName: 'Gor',
      isHost: true,
      status: 'approved',
      canOrder: true,
      canOrderNow: true,
      canSeeTableTotal: true,
      photo: null,
    },
    {
      id: 'ani',
      displayName: 'Ani',
      isHost: false,
      status: 'approved',
      canOrder: true,
      canOrderNow: true,
      canSeeTableTotal: true,
      photo: null,
    },
  ],
  totals: {
    subtotalDram: 30_000,
    serviceChargeDram: 3_000,
    totalDram: 33_000,
    paidDram: 0,
    remainingDram: 33_000,
  },
  tipsDram: 0,
  serviceChargePercent: 10,
  lines: LINES,
  linesKnown: true,
  // A discount another manager gave the whole tab earlier, and one reversed.
  adjustments: [
    {
      id: 'a-1',
      kind: 'discount',
      lineId: null,
      percent: null,
      amountDram: 1_000,
      reductionDram: 1_000,
      reason: 'Regular guest',
      isVoided: false,
      byName: null,
      atUtc: '2026-10-19T13:00:00Z',
    },
    {
      id: 'a-0',
      kind: 'discount',
      lineId: null,
      percent: 5,
      amountDram: null,
      reductionDram: 1_550,
      reason: 'Wrong table',
      isVoided: true,
      byName: null,
      atUtc: '2026-10-19T12:50:00Z',
    },
  ],
  adjustmentsKnown: true,
};

function show(role: UserRole, overrides: Partial<TabPanelProps> = {}) {
  const props: TabPanelProps = {
    tab: TAB,
    tableLabel: '4',
    timeZoneId: 'Asia/Yerevan',
    role,
    staffName: 'Narek',
    partySize: 5,
    online: true,
    loading: false,
    offlineUnknown: false,
    cashRefusal: null,
    billRequests: [],
    onVoid: vi.fn(),
    onAdjust: vi.fn(),
    onCash: vi.fn(async () => ({ kind: 'recorded' as const, tabClosed: false })),
    onAskForBill: vi.fn(),
    onAbandon: vi.fn(),
    onOrder: vi.fn(),
    onFreeTable: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <I18nextProvider i18n={i18next}>
      <TabPanel {...props} />
    </I18nextProvider>,
  );
  const panel = screen.getByRole('dialog', { name: 'Tab · table 4' });
  const lineMenu = (name: string) => {
    fireEvent.click(within(panel).getByRole('button', { name: `${name}, actions` }));
    return screen.getByRole('dialog', { name: new RegExp(name, 'u') });
  };
  return { props, panel, lineMenu };
}

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
});

describe('the lines', () => {
  it('say where each is, who it is for and the note', () => {
    const { panel } = show('waiter');
    const row = (name: string) => within(panel).getByText(name).closest('li')!;
    expect(text(row('Steak'))).toContain('Served');
    expect(text(row('Steak'))).toContain('Gor');
    expect(text(row('Steak'))).toContain('“Medium”');
    expect(text(row('Khorovats'))).toContain('Table · shared');
    expect(text(row('Latte'))).toContain('In the kitchen');
    expect(text(row('Latte'))).toContain('Ani');
    expect(text(row('Cake'))).toContain('Ready');
    expect(text(row('Cake'))).toContain('On the table');
    expect(text(row('Negroni'))).toContain('Voided');
    // A voided line has nothing left to do to it.
    expect(within(row('Negroni')).queryByRole('button')).toBeNull();
    expect(within(panel).getByText('4 lines · 6 dishes')).toBeTruthy();
  });

  it('add up with the discount, the 10 % service and what is left', () => {
    const { panel } = show('waiter');
    const totals = panel.querySelector('.tab-totals')!;
    const row = (label: string) =>
      text(
        within(totals as HTMLElement)
          .getByText(label)
          .closest('div')!,
      );
    expect(row('Dishes')).toContain(dram(31_000));
    expect(row('Discounts and comps')).toContain(`−${dram(1_000)}`);
    expect(row('Service 10%')).toContain(dram(3_000));
    expect(row('Total')).toContain(dram(33_000));
    expect(row('Paid')).toContain(dram(0));
    expect(row('Still to pay')).toContain(dram(33_000));
  });
});

describe('when each line was ordered', () => {
  /** A row's meta, piece by piece: the pill, who and when, the note, any comp. */
  const meta = (panel: HTMLElement, name: string) =>
    [...within(panel).getByText(name).closest('li')!.querySelector('.tab-line-meta')!.children].map(
      text,
    );
  const withLines = (lines: readonly TabLine[]) => ({ tab: { ...TAB, lines } });

  it("says it after who, as its order's time on the branch's clock", () => {
    const { panel } = show(
      'waiter',
      withLines([
        // 14:00 and 15:08 UTC are 18:00 and 19:08 in Yerevan.
        LINES[0]!,
        line({
          id: 'tea',
          name: 'Tea',
          participantId: 'ani',
          orderedByName: 'Ani',
          placedAtUtc: '2026-10-19T15:08:00Z',
        }),
      ]),
    );
    expect(meta(panel, 'Steak')).toEqual(['Served', 'Gor · 18:00', '“Medium”']);
    expect(meta(panel, 'Tea')).toEqual(['Served', 'Ani · 19:08']);
    expect(within(panel).getByText('Tea').closest('li')!.querySelector('time')).toMatchObject({
      dateTime: '2026-10-19T15:08:00Z',
    });
  });

  it('reads the zone it is given, not the device’s', () => {
    const { panel } = show('waiter', { ...withLines([LINES[0]!]), timeZoneId: 'Europe/Moscow' });
    expect(meta(panel, 'Steak')).toContain('Gor · 17:00');
  });

  it('stands alone on a line that names nobody', () => {
    const { panel } = show('waiter', withLines([line({ id: 'water', name: 'Water' })]));
    expect(meta(panel, 'Water')).toEqual(['Served', '18:00']);
  });

  it('says nothing when the line carries no time', () => {
    const { panel } = show(
      'waiter',
      withLines([
        line({
          id: 'tea',
          name: 'Tea',
          participantId: 'ani',
          orderedByName: 'Ani',
          placedAtUtc: null,
        }),
        line({ id: 'water', name: 'Water', placedAtUtc: null }),
      ]),
    );
    expect(meta(panel, 'Tea')).toEqual(['Served', 'Ani']);
    expect(meta(panel, 'Water')).toEqual(['Served']);
    expect(panel.querySelector('.tab-lines time')).toBeNull();
  });
});

describe('the one snapshot of the tab (review S4)', () => {
  const withLines = (lines: readonly TabLine[], extra: Partial<StaffTab> = {}) => ({
    tab: { ...TAB, lines: [...LINES, ...lines], ...extra },
  });

  it('says why a line was voided', () => {
    const { panel } = show('waiter');
    const row = within(panel).getByText('Negroni').closest('li')!;
    expect(text(row)).toContain('Voided · Wrong item');
  });

  it('names who ordered a line from their phone', () => {
    const { panel } = show(
      'waiter',
      withLines([
        line({
          id: 'tea',
          name: 'Tea',
          unitPriceDram: 900,
          lineTotalDram: 900,
          participantId: 'ani',
          orderedByName: 'Ani',
        }),
      ]),
    );
    expect(text(within(panel).getByText('Tea').closest('li')!)).toContain('Ani');
  });

  it('marks a line comped on another device, with the reason', () => {
    const { panel } = show(
      'manager',
      withLines([], {
        adjustments: [
          ...TAB.adjustments,
          {
            id: 'a-2',
            kind: 'comp',
            lineId: 'cake',
            percent: 100,
            amountDram: null,
            reductionDram: 2_200,
            reason: 'Birthday',
            isVoided: false,
            byName: null,
            atUtc: '2026-10-19T13:20:00Z',
          },
        ],
      }),
    );
    expect(text(within(panel).getByText('Cake').closest('li')!)).toContain(
      'On the house · Birthday',
    );
    const totals = panel.querySelector('.tab-totals') as HTMLElement;
    expect(text(within(totals).getByText('Discounts and comps').closest('div')!)).toContain(
      `−${dram(3_200)}`,
    );
  });

  it('takes the discount row from the adjustments, not from lines less the subtotal', () => {
    // A subtotal that has moved on (a refetch landed first) changes nothing here.
    const { panel } = show(
      'waiter',
      withLines([], { totals: { ...TAB.totals, subtotalDram: 20_000 } }),
    );
    const totals = panel.querySelector('.tab-totals') as HTMLElement;
    expect(text(within(totals).getByText('Discounts and comps').closest('div')!)).toContain(
      `−${dram(1_000)}`,
    );
  });

  it('says the service percentage the tab carries', () => {
    const { panel } = show('waiter', withLines([], { serviceChargePercent: 12 }));
    expect(within(panel).getByText('Service 12%')).toBeTruthy();
  });
});

describe('a void after the tab was paid against (review nit 4)', () => {
  it('is not offered, and says why', () => {
    const { lineMenu } = show('waiter', {
      tab: { ...TAB, totals: { ...TAB.totals, paidDram: 5_000, remainingDram: 28_000 } },
    });
    const menu = lineMenu('Steak');
    expect(within(menu).getByRole('button', { name: 'Void the line' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(
      within(menu).getByText('This tab has been paid against, so a line cannot be voided now.'),
    ).toBeTruthy();
  });
});

describe('a waiter', () => {
  it('voids a line, takes cash and asks for the bill, and sees who handles the rest', () => {
    const { panel, lineMenu } = show('waiter');
    expect(
      within(panel).getByRole('button', { name: named(`Take cash · ${dram(33_000)}`) }),
    ).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Ask for the bill' })).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Discount on the whole bill' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Mark as unpaid' })).toBeNull();
    expect(within(panel).getByText('Discounts and unpaid bills: the manager')).toBeTruthy();

    const menu = lineMenu('Steak');
    expect(within(menu).getByRole('button', { name: 'Void the line' })).toBeTruthy();
    expect(within(menu).queryByRole('button', { name: 'On the house' })).toBeNull();
  });
});

describe('a tab with nothing owed', () => {
  it('offers no cash to take', () => {
    const { panel } = show('waiter', {
      tab: { ...TAB, totals: { ...TAB.totals, paidDram: 33_000, remainingDram: 0 } },
    });
    expect(within(panel).getByRole('button', { name: 'Take cash' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('a manager', () => {
  it.each(['manager', 'generalManager', 'owner'] as const)(
    'as %s gets comp, the whole-bill discount and mark unpaid, and no muted line',
    (role) => {
      const { panel, lineMenu } = show(role);
      expect(
        within(panel).getByRole('button', { name: 'Discount on the whole bill' }),
      ).toBeTruthy();
      expect(within(panel).getByRole('button', { name: 'Mark as unpaid' })).toBeTruthy();
      expect(within(panel).queryByText('Discounts and unpaid bills: the manager')).toBeNull();
      const menu = lineMenu('Steak');
      expect(within(menu).getByRole('button', { name: 'Void the line' })).toBeTruthy();
      expect(within(menu).getByRole('button', { name: 'On the house' })).toBeTruthy();
    },
  );
});

describe('voiding a line', () => {
  it('needs a reason: nothing is picked for the waiter, and none means no void', () => {
    const { props, lineMenu } = show('waiter');
    const menu = lineMenu('Steak');
    fireEvent.click(within(menu).getByRole('button', { name: 'Void the line' }));
    const reasons = within(menu).getAllByRole('button', { pressed: false });
    expect(reasons.length).toBeGreaterThanOrEqual(5);
    expect(within(menu).queryAllByRole('button', { pressed: true })).toHaveLength(0);

    fireEvent.click(within(menu).getAllByRole('button', { name: 'Void the line' }).at(-1)!);
    expect(within(menu).getByRole('alert').textContent).toBe('Pick a reason');
    expect(props.onVoid).not.toHaveBeenCalled();

    fireEvent.click(within(menu).getByRole('button', { name: 'Wrong item' }));
    fireEvent.click(within(menu).getAllByRole('button', { name: 'Void the line' }).at(-1)!);
    expect(props.onVoid).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'steak' }),
      'wrongItem',
      undefined,
    );
  });

  it('needs the words when the reason is "Other"', () => {
    const { props, lineMenu } = show('waiter');
    const menu = lineMenu('Latte');
    fireEvent.click(within(menu).getByRole('button', { name: 'Void the line' }));
    fireEvent.click(within(menu).getByRole('button', { name: 'Other' }));
    fireEvent.click(within(menu).getAllByRole('button', { name: 'Void the line' }).at(-1)!);
    expect(within(menu).getByRole('alert').textContent).toBe('Pick a reason');
    fireEvent.change(within(menu).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Cold' },
    });
    fireEvent.click(within(menu).getAllByRole('button', { name: 'Void the line' }).at(-1)!);
    expect(props.onVoid).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'latte' }),
      'other',
      'Cold',
    );
  });
});

describe('a comp or a discount', () => {
  it('comps a line only with a reason', () => {
    const { props, lineMenu } = show('manager');
    const menu = lineMenu('Steak');
    fireEvent.click(within(menu).getByRole('button', { name: 'On the house' }));
    const dialog = screen.getByRole('dialog', { name: 'On the house · Steak' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Give it' }));
    expect(within(dialog).getByRole('alert').textContent).toBe('Pick a reason');
    expect(props.onAdjust).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Waited too long' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Give it' }));
    expect(props.onAdjust).toHaveBeenCalledWith({
      lineId: 'steak',
      kind: 'comp',
      percent: 100,
      amountDram: null,
      reason: 'Waited too long',
    });
  });

  it('takes a percentage off the whole bill, with a reason', () => {
    const { props, panel } = show('manager');
    fireEvent.click(within(panel).getByRole('button', { name: 'Discount on the whole bill' }));
    const dialog = screen.getByRole('dialog', { name: 'Discount on the whole bill' });
    fireEvent.click(within(dialog).getByRole('button', { name: '15 %' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply 15 % off' }));
    expect(within(dialog).getByRole('alert').textContent).toBe('Pick a reason');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Birthday' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply 15 % off' }));
    expect(props.onAdjust).toHaveBeenCalledWith({
      lineId: null,
      kind: 'discount',
      percent: 15,
      amountDram: null,
      reason: 'Birthday',
    });
  });

  it('takes an amount off the whole bill, in whole dram', () => {
    const { props, panel } = show('manager');
    fireEvent.click(within(panel).getByRole('button', { name: 'Discount on the whole bill' }));
    const dialog = screen.getByRole('dialog', { name: 'Discount on the whole bill' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Amount' }));
    const field = within(dialog).getByRole('textbox', { name: 'Amount off, dram' });
    fireEvent.change(field, { target: { value: '2 000.5' } });
    // Digits only: a separator or a decimal never becomes part of the number.
    expect((field as HTMLInputElement).value).toBe('20005');
    fireEvent.change(field, { target: { value: '2000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Regular guest' }));
    fireEvent.click(
      within(dialog).getByRole('button', { name: named(`Apply ${dram(2_000)} off`) }),
    );
    expect(props.onAdjust).toHaveBeenCalledWith({
      lineId: null,
      kind: 'discount',
      percent: null,
      amountDram: 2_000,
      reason: 'Regular guest',
    });
  });
});

describe('marking a tab unpaid', () => {
  it('waits for the word typed exactly, with the amount in the warning', () => {
    const { props, panel } = show('manager');
    fireEvent.click(within(panel).getByRole('button', { name: 'Mark as unpaid' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Mark as unpaid?' });
    expect(text(dialog)).toContain(`${dram(33_000)} will be recorded as a loss`);
    const confirm = within(dialog).getByRole('button', { name: 'Record the loss' });
    expect(confirm).toHaveProperty('disabled', true);
    const field = within(dialog).getByRole('textbox', { name: 'Type LOSS to confirm' });
    fireEvent.change(field, { target: { value: 'LOS' } });
    expect(confirm).toHaveProperty('disabled', true);
    fireEvent.change(field, { target: { value: 'LOSS' } });
    expect(confirm).toHaveProperty('disabled', false);
    fireEvent.click(confirm);
    expect(props.onAbandon).toHaveBeenCalled();
  });
});

describe('a bill request from the app', () => {
  const request: ServiceRequest = {
    id: 'sr-1',
    tabId: 'tab-1',
    tableLabel: '4',
    reason: 'bill',
    note: null,
    requestedAtUtc: new Date(Date.now() - 6 * 60_000).toISOString(),
    waitingMinutes: 6,
    acknowledgedAtUtc: null,
    requestedByParticipantId: 'ani',
    bill: { scope: 'mine', amountDram: 9_400, tipPercent: 0, tipDram: 0 },
  };

  it('fills in the cash button with the share picked', () => {
    const { panel } = show('waiter', { billRequests: [request] });
    expect(within(panel).getByText('6 min ago')).toBeTruthy();
    expect(within(panel).getByRole('radio', { name: 'Ani' })).toHaveProperty('checked', true);
    expect(
      within(panel).getByRole('button', { name: named(`Take cash · ${dram(9_400)}`) }),
    ).toBeTruthy();
    fireEvent.click(within(panel).getByRole('radio', { name: 'None of these' }));
    expect(
      within(panel).getByRole('button', { name: named(`Take cash · ${dram(33_000)}`) }),
    ).toBeTruthy();
  });
});
