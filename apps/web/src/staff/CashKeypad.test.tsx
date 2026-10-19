// @vitest-environment jsdom
import { formatDram } from '@yalla/format';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { CashKeypad, type CashKeypadProps, type CashOutcome } from './CashKeypad';

/**
 * Taking cash (floor-tablet `Cash`): the amount handed over and the tip are two
 * fields; more than is owed is change, never a payment over the balance; less
 * is a part payment that leaves the tab open. Whole dram from keys, never a
 * parsed decimal.
 */

const dram = (amount: number) => formatDram(amount, 'en').replace(/\s/gu, ' ');
const text = (element: Element) => (element.textContent ?? '').replace(/\s/gu, ' ');
/** An accessible name, with the formatter's no-break spaces read as spaces. */
const named = (expected: string) => (name: string) => name.replace(/\s/gu, ' ') === expected;

const totals = {
  subtotalDram: 42_600,
  serviceChargeDram: 4_260,
  totalDram: 46_860,
  paidDram: 0,
  remainingDram: 46_860,
};

function show(overrides: Partial<CashKeypadProps> = {}) {
  const onRecord = vi.fn<CashKeypadProps['onRecord']>(async (): Promise<CashOutcome> => ({
    kind: 'recorded',
    tabClosed: false,
  }));
  const props: CashKeypadProps = {
    tableLabel: '4',
    totals,
    request: null,
    staffName: 'Narek',
    timeZoneId: 'Asia/Yerevan',
    online: true,
    onRecord,
    onBack: vi.fn(),
    onFloor: vi.fn(),
    onFreeTable: vi.fn(),
    ...overrides,
  };
  const view = render(
    <I18nextProvider i18n={i18next}>
      <CashKeypad {...props} />
    </I18nextProvider>,
  );
  const rerender = (next: Partial<CashKeypadProps>) =>
    view.rerender(
      <I18nextProvider i18n={i18next}>
        <CashKeypad {...props} {...next} />
      </I18nextProvider>,
    );
  const keypad = screen.getByRole('dialog', { name: 'Take cash' });
  const press = (...keys: string[]) => {
    for (const key of keys) fireEvent.click(within(keypad).getByRole('button', { name: key }));
  };
  const amount = () => within(keypad).getByRole('button', { name: /^Amount/u });
  const tip = () => within(keypad).getByRole('button', { name: /^Tip/u });
  const record = () => within(keypad).getByRole('button', { name: /^(Record|Enter|Offline)/u });
  return { props, keypad, press, amount, tip, record, onRecord, rerender };
}

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
});

describe('the amount owed', () => {
  it('leads, with what it is made of', () => {
    const { keypad, amount } = show();
    expect(within(keypad).getByText(dram(46_860), { selector: '.cash-owed b' })).toBeTruthy();
    expect(
      within(keypad).getByText(`Bill ${dram(42_600)} · service ${dram(4_260)} · paid ${dram(0)}`),
    ).toBeTruthy();
    // Opens on the balance.
    expect(text(amount())).toContain('46,860');
  });
});

describe('more than is owed', () => {
  it('is change: the balance goes on the tab and the rest goes back', async () => {
    const { keypad, press, record, onRecord } = show();
    press('Clear', '5', '0', '0', '0', '0');

    expect(
      text(
        within(within(keypad).getByRole('region', { name: 'Still to pay' })).getByRole('status'),
      ),
    ).toContain(`More than is owed. Change: ${dram(3_140)}.`);
    expect(text(record())).toBe(`Record ${dram(46_860)}`);

    fireEvent.click(record());
    expect(onRecord).toHaveBeenCalledWith(
      expect.objectContaining({ amountDram: 46_860, tipDram: 0 }),
    );

    const done = await screen.findByRole('dialog', { name: named(`${dram(46_860)} recorded`) });
    expect(within(done).getByText(dram(3_140))).toBeTruthy();
    expect(within(done).getByText('change to give back')).toBeTruthy();
  });
});

describe('less than is owed', () => {
  it('is a part payment that says what is left, and the tab stays open', async () => {
    const { keypad, press, record, onRecord } = show();
    press('Clear', '2', '0', '0', '0', '0');

    expect(
      text(
        within(within(keypad).getByRole('region', { name: 'Still to pay' })).getByRole('status'),
      ),
    ).toContain(`Part payment. ${dram(26_860)} will be left after this. The tab stays open.`);
    fireEvent.click(record());
    expect(onRecord).toHaveBeenCalledWith(
      expect.objectContaining({ amountDram: 20_000, tipDram: 0 }),
    );

    const done = await screen.findByRole('dialog', { name: named(`${dram(20_000)} recorded`) });
    expect(within(done).getByText(`The tab stays open, ${dram(26_860)} left.`)).toBeTruthy();
    fireEvent.click(within(done).getByRole('button', { name: 'Back to the tab' }));
  });

  it('closes the tab when it is all of it, and offers to free the table', async () => {
    const onRecord = vi.fn(async (): Promise<CashOutcome> => ({
      kind: 'recorded',
      tabClosed: true,
    }));
    const { record, props } = show({ onRecord });
    fireEvent.click(record());
    const done = await screen.findByRole('dialog', { name: 'Paid in full' });
    expect(
      within(done).getByText('The tab is closed. The table stays occupied until you free it.'),
    ).toBeTruthy();
    fireEvent.click(within(done).getByRole('button', { name: 'Free the table' }));
    expect(props.onFreeTable).toHaveBeenCalled();
  });
});

describe('the tip', () => {
  it('is its own field, outside the balance, and "No tip" empties it', () => {
    const { keypad, press, tip, record, onRecord } = show();
    fireEvent.click(tip());
    expect(within(keypad).getByRole('group', { name: 'Keypad for the tip' })).toBeTruthy();
    press('2', '0', '0', '0');
    expect(text(tip())).toContain('2,000');
    expect(text(record())).toBe(`Record ${dram(46_860)} + tip`);
    expect(within(keypad).getByText(`${dram(2_000)} · on top of the bill`)).toBeTruthy();

    fireEvent.click(within(keypad).getByRole('button', { name: 'No tip' }));
    expect(text(tip())).toContain('0');
    fireEvent.click(tip());
    press('5', '0', '0');
    fireEvent.click(record());
    expect(onRecord).toHaveBeenCalledWith(
      expect.objectContaining({ amountDram: 46_860, tipDram: 500 }),
    );
  });
});

describe('the keys', () => {
  it('take whole dram, at most eight digits, with no leading zeros', () => {
    const { press, amount } = show();
    press('Clear', '0', '0', '7');
    expect(text(amount())).toMatch(/֏\s*7$/u);
    press('1', '2', '3', '4', '5', '6', '7', '8');
    // Eight digits and no more.
    expect(text(amount())).toContain('71,234,567');
    press('Delete');
    expect(text(amount())).toContain('7,123,456');
  });

  it('offer the whole, two round-ups and half', () => {
    const { keypad, amount } = show();
    const quick = within(keypad).getByRole('group', { name: 'Quick amounts' });
    expect(
      within(quick)
        .getAllByRole('button')
        .map((button) => text(button)),
    ).toEqual(['All of it', '50,000', '60,000', 'Half', 'No tip']);
    fireEvent.click(within(quick).getByRole('button', { name: 'Half' }));
    expect(text(amount())).toContain('23,430');
    fireEvent.click(within(quick).getByRole('button', { name: '50,000' }));
    expect(text(amount())).toContain('50,000');
    fireEvent.click(within(quick).getByRole('button', { name: 'All of it' }));
    expect(text(amount())).toContain('46,860');
  });

  it('round up an odd half so two halves cover the bill', () => {
    const { keypad, amount } = show({ totals: { ...totals, remainingDram: 1_001 } });
    fireEvent.click(within(keypad).getByRole('button', { name: 'Half' }));
    expect(text(amount())).toContain('501');
  });
});

describe('a bill request from the app', () => {
  it('fills the amount and the tip in and says from where, until the waiter changes them', () => {
    const { keypad, amount, tip, press } = show({
      request: {
        name: 'Gor',
        bill: { scope: 'whole', amountDram: 46_860, tipPercent: 10, tipDram: 4_260 },
      },
    });
    expect(text(amount())).toContain('46,860');
    expect(text(tip())).toContain('4,260');
    expect(within(keypad).getByText(/filled in from what the table asked for/iu)).toBeTruthy();
    expect(
      within(keypad).getByText(
        `Gor · Wants to pay the whole bill: ${dram(46_860)} · tip 10% · ${dram(4_260)}`,
      ),
    ).toBeTruthy();
    press('Delete');
    expect(within(keypad).queryByText(/filled in from what the table asked for/iu)).toBeNull();
  });

  it('opens a whole-bill request on what the tab owes now, with the tip asked for (review nit 8)', () => {
    // Asked before another round was ordered: the whole bill is bigger now.
    const { amount, tip } = show({
      request: {
        name: 'Gor',
        bill: { scope: 'whole', amountDram: 40_000, tipPercent: 10, tipDram: 3_600 },
      },
    });
    expect(text(amount())).toContain('46,860');
    expect(text(tip())).toContain('3,600');
  });

  it('caps a share priced before somebody else paid at what is left', () => {
    const { amount } = show({
      totals: { ...totals, paidDram: 40_000, remainingDram: 6_860 },
      request: {
        name: 'Ani',
        bill: { scope: 'mine', amountDram: 9_400, tipPercent: 0, tipDram: 0 },
      },
    });
    expect(text(amount())).toContain('6,860');
  });
});

describe('without a connection', () => {
  it('says so and records nothing', () => {
    const { keypad, record, onRecord } = show({ online: false });
    expect(within(keypad).getByText(/Cash cannot be recorded offline/u)).toBeTruthy();
    expect(text(record())).toBe('Offline · not recorded');
    expect(record()).toHaveProperty('disabled', true);
    fireEvent.click(record());
    expect(onRecord).not.toHaveBeenCalled();
  });
});

describe('a send that fails', () => {
  it('keeps the keypad with what was typed and says nothing was taken', async () => {
    const onRecord = vi.fn(async (): Promise<CashOutcome> => ({ kind: 'failed' }));
    const { keypad, record, amount } = show({ onRecord });
    fireEvent.click(record());
    expect(
      await within(keypad).findByText('We could not record that payment. Nothing was taken.'),
    ).toBeTruthy();
    expect(text(amount())).toContain('46,860');
    await waitFor(() => expect(record()).toHaveProperty('disabled', false));
  });
});

describe('the first key after a filled-in amount (live QA 1)', () => {
  it('replaces the balance it opened on, then appends', () => {
    const { press, amount } = show();
    press('5', '0', '0', '0', '0');
    expect(text(amount())).toContain('50,000');
    expect(text(amount())).not.toContain('46,860');
  });

  it('replaces a quick amount, and a prefilled tip', () => {
    const { keypad, press, amount, tip } = show({
      request: {
        name: 'Gor',
        bill: { scope: 'whole', amountDram: 46_860, tipPercent: 10, tipDram: 4_260 },
      },
    });
    fireEvent.click(within(keypad).getByRole('button', { name: 'Half' }));
    press('1', '5');
    expect(text(amount())).toMatch(/֏\s*15$/u);
    fireEvent.click(tip());
    press('3', '0', '0', '0');
    expect(text(tip())).toContain('3,000');
    expect(text(tip())).not.toContain('4,260');
  });

  it('lets ⌫ edit what was filled in rather than replace it', () => {
    const { press, amount } = show();
    press('Delete');
    expect(text(amount())).toContain('4,686');
    press('1');
    expect(text(amount())).toContain('46,861');
  });
});

describe('once a payment is recorded (review S2, live QA 2)', () => {
  it('moves focus to the card and leaves nothing behind it to record again', async () => {
    const { press, record, onRecord } = show();
    press('2', '0', '0', '0', '0');
    fireEvent.click(record());
    const done = await screen.findByRole('dialog', { name: named(`${dram(20_000)} recorded`) });
    // Focus moves in the card's effect, after it is on screen.
    await waitFor(() => expect(done.contains(document.activeElement)).toBe(true));
    expect(record()).toHaveProperty('disabled', true);
    fireEvent.click(record());
    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  it('keeps the form as it was recorded when the balance under it changes', async () => {
    const { keypad, press, record, rerender } = show();
    press('2', '0', '0', '0', '0');
    fireEvent.click(record());
    await screen.findByRole('dialog', { name: named(`${dram(20_000)} recorded`) });
    // The tab refetches after the payment: 26,860 left now.
    rerender({ totals: { ...totals, paidDram: 20_000, remainingDram: 26_860 } });
    expect(
      text(
        within(within(keypad).getByRole('region', { name: 'Still to pay' })).getByRole('status'),
      ),
    ).toContain(`Part payment. ${dram(26_860)} will be left after this.`);
    expect(text(keypad)).not.toMatch(/More than is owed/u);
    expect(within(keypad).getByText(dram(46_860), { selector: '.cash-owed b' })).toBeTruthy();
  });
});

describe('a send whose answer never came (review S1)', () => {
  it('says to check the tab, not that nothing was taken, and retries with the same id', async () => {
    const outcomes: CashOutcome[] = [{ kind: 'unknown' }, { kind: 'recorded', tabClosed: false }];
    const onRecord = vi.fn(async (): Promise<CashOutcome> => outcomes.shift()!);
    const { keypad, record, press } = show({ onRecord });
    press('2', '0', '0', '0', '0');
    fireEvent.click(record());
    expect(
      await within(keypad).findByText(
        'We could not tell whether that payment was recorded. Check the tab before you take it again.',
      ),
    ).toBeTruthy();
    expect(within(keypad).queryByText(/Nothing was taken/u)).toBeNull();
    await waitFor(() => expect(record()).toHaveProperty('disabled', false));
    fireEvent.click(record());
    await screen.findByRole('dialog', { name: named(`${dram(20_000)} recorded`) });
    const [first, second] = onRecord.mock.calls.map((call) => (call as unknown[])[0]) as {
      clientCommandId: string;
    }[];
    expect(first!.clientCommandId).toBeTruthy();
    expect(second!.clientCommandId).toBe(first!.clientCommandId);
  });

  it('takes a new id once the amount or the tip changes', async () => {
    const onRecord = vi.fn(async (): Promise<CashOutcome> => ({ kind: 'unknown' }));
    const { record, press } = show({ onRecord });
    press('2', '0', '0', '0', '0');
    fireEvent.click(record());
    await waitFor(() => expect(record()).toHaveProperty('disabled', false));
    press('0');
    fireEvent.click(record());
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(2));
    const ids = onRecord.mock.calls.map(
      (call) => ((call as unknown[])[0] as { clientCommandId: string }).clientCommandId,
    );
    expect(ids[1]).not.toBe(ids[0]);
  });
});
