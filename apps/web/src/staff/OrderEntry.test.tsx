// @vitest-environment jsdom
import type { Menu, StaffTab, TabStaffParticipant } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { OrderEntry, type OrderEntryProps } from './OrderEntry';

/**
 * Taking an order (floor-tablet `Order`): categories with counts, a search that
 * says when it found nothing, dishes with their photos, a sold-out dish that
 * cannot be added, and a draft where each line says who it is for — the table,
 * shared, or one named guest — before one send.
 */

const dram = (amount: number) => formatDram(amount, 'en').replace(/\s/gu, ' ');
const text = (element: Element) => (element.textContent ?? '').replace(/\s/gu, ' ');

const MENU: Menu = {
  branchId: 'b1',
  updatedAtUtc: '2026-10-19T08:00:00Z',
  sections: [
    {
      id: 'coffee',
      name: 'Coffee',
      items: [
        {
          id: 'latte',
          name: 'Latte',
          description: null,
          priceDram: 1_400,
          isAvailable: true,
          photo: {
            photoId: 'p1',
            thumbnailUrl: 'https://api.test/photos/p1/thumbnail',
            cardUrl: 'https://api.test/photos/p1/card',
            fullUrl: 'https://api.test/photos/p1/full',
            width: null,
            height: null,
          },
        },
        { id: 'espresso', name: 'Espresso', description: null, priceDram: 800, isAvailable: true },
        {
          id: 'cold-brew',
          name: 'Cold brew',
          description: null,
          priceDram: 1_500,
          isAvailable: false,
        },
      ],
    },
    {
      id: 'hot',
      name: 'Hot dishes',
      items: [
        { id: 'steak', name: 'Beef steak', description: null, priceDram: 9_800, isAvailable: true },
        { id: 'dolma', name: 'Dolma', description: null, priceDram: 4_200, isAvailable: true },
      ],
    },
  ],
};

function person(id: string, displayName: string | null, extra: Partial<TabStaffParticipant> = {}) {
  return {
    id,
    displayName,
    isHost: false,
    status: 'approved',
    canOrder: true,
    canOrderNow: true,
    canSeeTableTotal: true,
    photo: null,
    ...extra,
  } as TabStaffParticipant;
}

const TAB = {
  id: 'tab-1',
  status: 'open',
  openedAtUtc: '2026-10-19T13:54:00Z',
  participants: [
    person('narine', 'Narine', { isHost: true }),
    person('p2', null),
    person('davit', 'Davit', { status: 'pendingApproval', canOrderNow: false }),
  ],
} as unknown as StaffTab;

function show(overrides: Partial<OrderEntryProps> = {}) {
  const props: OrderEntryProps = {
    menu: MENU,
    menuFromCache: false,
    tab: TAB,
    tableLabel: '2',
    timeZoneId: 'Asia/Yerevan',
    online: true,
    loading: false,
    menuUnavailable: false,
    noTab: false,
    staffName: 'Narek',
    partySize: 2,
    sent: null,
    onSubmit: vi.fn(),
    onSentDismiss: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(
    <I18nextProvider i18n={i18next}>
      <OrderEntry {...props} />
    </I18nextProvider>,
  );
  const dialog = screen.getByRole('dialog', { name: 'Order · table 2' });
  const menu = within(dialog).getByRole('region', { name: 'Menu' });
  const draft = within(dialog).getByRole('complementary', { name: 'This order' });
  const tile = (name: string) =>
    within(menu).getByRole('button', { name: new RegExp(`^${name},`, 'u') });
  const rerender = (next: Partial<OrderEntryProps>) =>
    view.rerender(
      <I18nextProvider i18n={i18next}>
        <OrderEntry {...props} {...next} />
      </I18nextProvider>,
    );
  return { props, dialog, menu, draft, tile, rerender };
}

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
});

describe('the menu', () => {
  it('lists categories with how many dishes each has, the first one picked', () => {
    const { dialog, tile } = show();
    const categories = within(dialog).getByRole('navigation', { name: 'Categories' });
    const coffee = within(categories).getByRole('button', { name: 'Coffee, 3 dishes' });
    expect(coffee.getAttribute('aria-pressed')).toBe('true');
    expect(within(categories).getByRole('button', { name: 'Hot dishes, 2 dishes' })).toBeTruthy();
    expect(tile('Latte')).toBeTruthy();
    fireEvent.click(within(categories).getByRole('button', { name: 'Hot dishes, 2 dishes' }));
    expect(tile('Beef steak')).toBeTruthy();
  });

  it('shows a dish’s photo, and its first letter when there is none or it fails', () => {
    const { tile } = show();
    const photo = tile('Latte').querySelector('img');
    expect(photo?.getAttribute('src')).toBe('https://api.test/photos/p1/thumbnail');
    expect(photo?.getAttribute('alt')).toBe('');
    expect(tile('Espresso').querySelector('img')).toBeNull();
    expect(text(tile('Espresso'))).toMatch(/^E/u);
    fireEvent.error(photo!);
    expect(tile('Latte').querySelector('img')).toBeNull();
  });

  it('says when a search found nothing, and clears it in one tap', () => {
    const { menu, tile } = show();
    const search = within(menu).getByRole('searchbox', { name: 'Search the menu' });
    fireEvent.change(search, { target: { value: 'dol' } });
    // Across every category, not only the one picked.
    expect(tile('Dolma')).toBeTruthy();

    fireEvent.change(search, { target: { value: 'pizza' } });
    expect(within(menu).getByText('No dish found for “pizza”.')).toBeTruthy();
    fireEvent.click(within(menu).getByRole('button', { name: 'Clear the search' }));
    expect((search as HTMLInputElement).value).toBe('');
    expect(tile('Latte')).toBeTruthy();
  });

  it('never adds a sold-out dish, and says why', () => {
    const { dialog, draft, tile } = show();
    const out = tile('Cold brew');
    expect(out.getAttribute('aria-label')?.replace(/\s/gu, ' ')).toBe(
      `Cold brew, ${dram(1_500)}, sold out`,
    );
    expect(out.getAttribute('aria-disabled')).toBe('true');
    expect(within(out).getByText('Sold out')).toBeTruthy();
    fireEvent.click(out);
    expect(within(draft).getByText('Tap a dish to add it.')).toBeTruthy();
    expect(
      within(dialog)
        .getAllByRole('status')
        .map((status) => status.textContent),
    ).toContain('Cold brew has sold out');
  });

  it('says when the menu is this tablet’s own copy', () => {
    const { menu } = show({ menuFromCache: true });
    expect(within(menu).getByText('Menu from this tablet’s copy')).toBeTruthy();
  });
});

describe('the draft', () => {
  it('adds a dish once and counts further taps on it', () => {
    const { draft, tile } = show();
    fireEvent.click(tile('Latte'));
    fireEvent.click(tile('Latte'));
    expect(tile('Latte').getAttribute('aria-label')?.replace(/\s/gu, ' ')).toBe(
      `Latte, ${dram(1_400)}, in the order: 2`,
    );
    expect(within(draft).getAllByRole('listitem')).toHaveLength(1);
    expect(within(draft).getByText('2 dishes')).toBeTruthy();
    fireEvent.click(within(draft).getByRole('button', { name: 'Latte, one more' }));
    expect(text(draft)).toContain(dram(4_200));
    fireEvent.click(within(draft).getByRole('button', { name: 'Latte, one less' }));
    fireEvent.click(within(draft).getByRole('button', { name: 'Latte, one less' }));
    fireEvent.click(within(draft).getByRole('button', { name: 'Latte, one less' }));
    expect(within(draft).getByText('Tap a dish to add it.')).toBeTruthy();
    expect(within(draft).getByRole('button', { name: 'Send' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('puts each line on the table or on one approved guest, and sends them together', () => {
    const { props, draft, tile, menu } = show();
    fireEvent.click(tile('Latte'));
    fireEvent.click(
      within(menu.ownerDocument.body).getByRole('button', { name: 'Hot dishes, 2 dishes' }),
    );
    fireEvent.click(tile('Beef steak'));

    const [latte, steak] = within(draft).getAllByRole('listitem');
    // The table by default; only approved guests are offered, an unnamed one by number.
    const who = within(steak!).getByRole('group', { name: 'Who it is for' });
    expect(
      within(who)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Table · shared', 'Narine', 'Guest 2']);
    expect(
      within(who).getByRole('button', { name: 'Table · shared' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(within(who).getByRole('button', { name: 'Narine' }));

    fireEvent.click(within(steak!).getByRole('button', { name: 'Note' }));
    fireEvent.change(within(steak!).getByRole('textbox', { name: 'Note for the kitchen' }), {
      target: { value: 'Medium' },
    });
    fireEvent.click(within(steak!).getByRole('button', { name: 'Done' }));
    expect(within(steak!).getByRole('button', { name: 'Medium' })).toBeTruthy();
    expect(within(latte!).getByRole('button', { name: 'Table · shared' })).toBeTruthy();

    fireEvent.click(within(draft).getByRole('button', { name: 'Send 2 dishes' }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).toHaveBeenCalledWith([
      { menuItemId: 'latte', quantity: 1, isShared: true, participantId: null },
      {
        menuItemId: 'steak',
        quantity: 1,
        isShared: false,
        participantId: 'narine',
        note: 'Medium',
      },
    ]);
  });
});

describe('who a line can be put on (review S5, S6)', () => {
  it('offers every approved guest, including one the host stopped ordering from their phone', () => {
    const { draft, tile } = show({
      tab: {
        ...TAB,
        participants: [
          person('narine', 'Narine', { isHost: true }),
          person('kid', 'Lilit', { canOrder: false, canOrderNow: false }),
          person('davit', 'Davit', { status: 'pendingApproval', canOrderNow: false }),
        ],
      } as StaffTab,
    });
    fireEvent.click(tile('Latte'));
    const who = within(draft).getByRole('group', { name: 'Who it is for' });
    expect(
      within(who)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Table · shared', 'Narine', 'Lilit']);
  });

  it('offers nobody to name on a tab that no longer takes orders', () => {
    const { draft, tile } = show({ tab: { ...TAB, status: 'closing' } as StaffTab });
    fireEvent.click(tile('Latte'));
    expect(within(draft).queryByRole('group', { name: 'Who it is for' })).toBeNull();
  });

  it('puts a line back on the table, and says so, when its guest is no longer nameable', () => {
    const { draft, tile, rerender } = show();
    fireEvent.click(tile('Latte'));
    fireEvent.click(
      within(within(draft).getByRole('group', { name: 'Who it is for' })).getByRole('button', {
        name: 'Narine',
      }),
    );
    // The host takes Narine off while the order is being built.
    rerender({ tab: { ...TAB, participants: [person('p2', null)] } as StaffTab });
    const [line] = within(draft).getAllByRole('listitem');
    const pressed = within(line!).getAllByRole('button', { pressed: true });
    expect(pressed.map((button) => button.textContent)).toEqual(['Table · shared']);
    expect(within(line!).getByText('Narine is no longer on the tab.')).toBeTruthy();
  });

  it('after a refusal, gives the draft back with the refused guest taken off the line', () => {
    const { props, dialog, draft, tile, rerender } = show();
    fireEvent.click(tile('Latte'));
    fireEvent.click(
      within(within(draft).getByRole('group', { name: 'Who it is for' })).getByRole('button', {
        name: 'Narine',
      }),
    );
    fireEvent.click(within(draft).getByRole('button', { name: 'Send 1 dish' }));
    rerender({
      tab: { ...TAB, participants: [person('p2', null)] } as StaffTab,
      sent: {
        count: 1,
        state: 'refused',
        refusal: { kind: 'guestUnavailable' },
        atUtc: '2026-10-19T14:43:00Z',
      },
    });
    fireEvent.click(
      within(within(dialog).getByRole('dialog', { name: 'The order was not taken' })).getByRole(
        'button',
        { name: 'Back to the order' },
      ),
    );
    expect(props.onSentDismiss).toHaveBeenCalledWith({ restored: true });
    rerender({ tab: { ...TAB, participants: [person('p2', null)] } as StaffTab, sent: null });
    const [line] = within(draft).getAllByRole('listitem');
    expect(
      within(line!)
        .getAllByRole('button', { pressed: true })
        .map((button) => button.textContent),
    ).toEqual(['Table · shared']);
    expect(within(line!).getByText('Narine is no longer on the tab.')).toBeTruthy();
  });
});

describe('a refusal that names the guest or the tab (review S7)', () => {
  function refusedWith(refusal: Record<string, unknown>) {
    const view = show();
    fireEvent.click(view.tile('Latte'));
    fireEvent.click(
      within(within(view.draft).getByRole('group', { name: 'Who it is for' })).getByRole('button', {
        name: 'Narine',
      }),
    );
    fireEvent.click(within(view.draft).getByRole('button', { name: 'Send 1 dish' }));
    view.rerender({
      sent: {
        count: 1,
        state: 'refused',
        refusal: refusal as never,
        atUtc: '2026-10-19T14:43:00Z',
      },
    });
    return {
      ...view,
      card: within(view.dialog).getByRole('dialog', { name: 'The order was not taken' }),
    };
  }

  it.each([
    ['notOnTab', 'Narine is not on this tab. Nothing was sent.'],
    ['pending', 'Narine has not been let on yet. Nothing was sent.'],
    ['removed', 'Narine was taken off the tab. Nothing was sent.'],
  ])('names the guest and says why (%s)', (guestState, sentence) => {
    const { card } = refusedWith({ kind: 'guestUnavailable', participantId: 'narine', guestState });
    expect(within(card).getByText(sentence)).toBeTruthy();
  });

  it('gives the draft back with that guest taken off, even before the tab refreshes', () => {
    const { card, draft, rerender } = refusedWith({
      kind: 'guestUnavailable',
      participantId: 'narine',
      guestState: 'removed',
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Back to the order' }));
    // The tablet's copy of the tab still lists Narine as approved.
    rerender({ sent: null });
    const [line] = within(draft).getAllByRole('listitem');
    expect(
      within(line!)
        .getAllByRole('button', { pressed: true })
        .map((button) => button.textContent),
    ).toEqual(['Table · shared']);
    expect(within(line!).getByText('Narine is no longer on the tab.')).toBeTruthy();
  });

  it.each([
    ['closing', 'The bill has been asked for, so nothing new goes on. Nothing was sent.'],
    ['closed', 'This tab is paid and closed, and takes no more orders. Nothing was sent.'],
    ['abandoned', 'This tab was written off, and takes no more orders. Nothing was sent.'],
  ])('says why the tab takes no orders (%s)', (tabStatus, sentence) => {
    const { card } = refusedWith({ kind: 'notAccepting', tabStatus });
    expect(within(card).getByText(sentence)).toBeTruthy();
  });
});

describe('after a send', () => {
  it('says the kitchen has it once it landed', () => {
    const { dialog } = show({
      sent: { count: 3, state: 'sent', refusal: null, atUtc: '2026-10-19T14:43:00Z' },
    });
    const card = within(dialog).getByRole('dialog', { name: '3 dishes sent' });
    expect(within(card).getByText('The kitchen can see it. Table 2 · 18:43')).toBeTruthy();
  });

  it('says it is on its way while it is', () => {
    const { dialog } = show({
      sent: { count: 1, state: 'sending', refusal: null, atUtc: '2026-10-19T14:43:00Z' },
    });
    expect(within(dialog).getByRole('dialog', { name: 'Sending 1 dish…' })).toBeTruthy();
  });

  it('offline, says it is kept on the tablet and the kitchen cannot see it yet', () => {
    const { dialog } = show({
      online: false,
      sent: { count: 2, state: 'saved', refusal: null, atUtc: '2026-10-19T14:43:00Z' },
    });
    expect(within(dialog).getByText('Offline · the order will be kept')).toBeTruthy();
    const card = within(dialog).getByRole('dialog', { name: '2 dishes saved' });
    expect(
      within(card).getByText(
        'No connection. The order is on the tablet and reaches the kitchen when the connection returns. The kitchen cannot see it yet.',
      ),
    ).toBeTruthy();
  });

  it('when refused for a guest, says so and gives the draft back', () => {
    const { props, dialog, draft, tile, rerender } = show();
    fireEvent.click(tile('Latte'));
    fireEvent.click(within(draft).getByRole('button', { name: 'Send 1 dish' }));
    rerender({
      sent: {
        count: 1,
        state: 'refused',
        refusal: { kind: 'guestUnavailable' },
        atUtc: '2026-10-19T14:43:00Z',
      },
    });
    const card = within(dialog).getByRole('dialog', { name: 'The order was not taken' });
    expect(
      within(card).getByText(
        'A guest named on it is no longer on the tab, or has not been let on yet. Nothing was sent.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Back to the order' }));
    expect(props.onSentDismiss).toHaveBeenCalledWith({ restored: true });
    rerender({ sent: null });
    expect(within(draft).getAllByRole('listitem')).toHaveLength(1);
  });

  it('"Add more" starts a fresh draft; "Floor" closes', () => {
    const { props, dialog } = show({
      sent: { count: 1, state: 'sent', refusal: null, atUtc: '2026-10-19T14:43:00Z' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add more' }));
    expect(props.onSentDismiss).toHaveBeenCalledWith({ restored: false });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Floor' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('the bar', () => {
  it('names the table, the tab, the people and who is taking it, and goes back', () => {
    const { props, dialog } = show();
    expect(within(dialog).getByText('Tab open since 17:54 · 2 people · Narek')).toBeTruthy();
    expect(within(dialog).getByText('Connected')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to table 2' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
