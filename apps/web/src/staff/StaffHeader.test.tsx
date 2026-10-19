// @vitest-environment jsdom
import { I18nextProvider, i18next } from '@yalla/i18n';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { StaffHeader, type StaffHeaderProps } from './StaffHeader';

/**
 * The one top bar every staff screen wears (floor-tablet HANDOFF §2): where the
 * tablet is, the two views with the kitchen's waiting count, the connection,
 * the conflicts when there are any, and who is signed in.
 */

vi.mock('./auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: { signOut: async () => undefined },
}));

function header(overrides: Partial<StaffHeaderProps> = {}) {
  const props: StaffHeaderProps = {
    title: 'Floor',
    place: 'Lumen · Lumen North',
    timeZoneId: 'Asia/Yerevan',
    who: 'Sona Vardanyan',
    state: 'connected',
    updatedAt: Date.now(),
    pending: 0,
    conflicts: 0,
    online: true,
    onOpenConflicts: () => {},
    onRefresh: () => {},
    view: 'floor',
    kitchenWaiting: 0,
    floorWaiting: 0,
    onSelectView: () => {},
    onSwitchPerson: () => {},
    ...overrides,
  };
  render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <StaffHeader {...props} />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the staff top bar', () => {
  it('says where the tablet is, and names the screen for a screen reader', () => {
    header();
    expect(screen.getByText('Lumen · Lumen North')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Floor' })).toBeTruthy();
  });

  it('offers the floor and the kitchen, the current one marked, the kitchen with its waiting count', async () => {
    const onSelectView = vi.fn();
    header({ kitchenWaiting: 4, onSelectView });

    const views = screen.getByRole('navigation', { name: 'Screens' });
    const floor = within(views).getByRole('button', { name: 'Floor' });
    const kitchen = within(views).getByRole('button', {
      name: 'Kitchen, 4 orders waiting in the kitchen',
    });
    expect(floor.getAttribute('aria-current')).toBe('page');
    expect(kitchen.getAttribute('aria-current')).toBeNull();
    // The count is on the tab in figures, not only in its name.
    expect(within(kitchen).getByText('4')).toBeTruthy();

    await userEvent.setup().click(kitchen);
    expect(onSelectView).toHaveBeenCalledWith('kitchen');
  });

  it('shows no count on the kitchen tab when nothing is waiting', () => {
    header({ kitchenWaiting: 0 });
    expect(screen.getByRole('button', { name: 'Kitchen' })).toBeTruthy();
  });

  it('offers only the kitchen to an account the floor is refused to, as a label, not a button', () => {
    header({ view: 'kitchen', title: 'Kitchen', onSelectView: undefined, kitchenWaiting: 2 });
    const views = screen.getByRole('navigation', { name: 'Screens' });
    // Nothing to switch to, so nothing to press: a button that does nothing
    // is a trap for a keyboard and a screen reader.
    expect(within(views).queryAllByRole('button')).toHaveLength(0);
    const current = within(views).getByText('Kitchen');
    expect(current.closest('[aria-current="page"]')).toBeTruthy();
  });

  it('counts what is waiting on the floor on its tab while the kitchen shows', () => {
    header({ view: 'kitchen', title: 'Kitchen', floorWaiting: 3 });
    const floor = screen.getByRole('button', { name: 'Floor, 3 waiting on the floor' });
    expect(within(floor).getByText('3')).toBeTruthy();
  });

  it('shows no count on the floor tab while the floor itself shows', () => {
    header({ view: 'floor', floorWaiting: 3 });
    expect(screen.getByRole('button', { name: 'Floor' })).toBeTruthy();
  });

  it('turns the clock over on the minute, not up to a poll later', () => {
    vi.useFakeTimers();
    // 16:51:50 in Yerevan.
    vi.setSystemTime(new Date('2026-10-19T12:51:50Z'));
    header({ updatedAt: Date.parse('2026-10-19T12:51:40Z') });
    expect(screen.getByText(/, 16:51$/u)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10_500);
    });
    expect(screen.getByText(/, 16:52$/u)).toBeTruthy();
  });

  it('shows the conflicts chip only while there are conflicts, and opens them', async () => {
    header({ conflicts: 0 });
    expect(screen.queryByRole('button', { name: /decision/u })).toBeNull();
    cleanup();

    const onOpenConflicts = vi.fn();
    header({ conflicts: 2, onOpenConflicts });
    await userEvent.setup().click(screen.getByRole('button', { name: '2 need a decision' }));
    expect(onOpenConflicts).toHaveBeenCalledTimes(1);
  });

  it('hands the tablet over from the person button', async () => {
    const onSwitchPerson = vi.fn();
    header({ onSwitchPerson });
    const person = screen.getByRole('button', { name: /^Sona Vardanyan · /u });
    // Initials and the first name, as on the artboard.
    expect(within(person).getByText('SV')).toBeTruthy();
    expect(within(person).getByText('Sona')).toBeTruthy();
    await userEvent.setup().click(person);
    expect(onSwitchPerson).toHaveBeenCalledTimes(1);
  });
});

describe('the connection chip', () => {
  it('is live with the time of the last answer, and refreshes when tapped', async () => {
    const onRefresh = vi.fn();
    header({ onRefresh });
    const chip = screen.getByRole('button', { name: /^Live · \d\d:\d\d\. Refresh the floor$/u });
    expect(chip.textContent).toMatch(/^Live · \d\d:\d\d$/u);
    await userEvent.setup().click(chip);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('counts what is waiting to sync while live', () => {
    header({ pending: 2 });
    expect(screen.getByText('Live · 2 actions waiting to sync')).toBeTruthy();
  });

  it('keeps the count of what is waiting while the polls fail', () => {
    header({ state: 'reconnecting', online: true, pending: 3 });
    expect(screen.getByText('Reconnecting… · 3 actions waiting')).toBeTruthy();
    cleanup();
    header({ state: 'connecting', online: true, pending: 1 });
    expect(screen.getByText('Connecting… · 1 action waiting')).toBeTruthy();
  });

  it('says offline, with the count that is waiting on this tablet', () => {
    header({ online: false, state: 'reconnecting', pending: 3 });
    expect(screen.getByText('Offline · 3 actions waiting')).toBeTruthy();
    cleanup();
    header({ online: false, state: 'reconnecting', pending: 0 });
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('says reconnecting while polls fail, and how old the data is once it is minutes old', () => {
    header({ state: 'reconnecting', updatedAt: Date.now() });
    expect(screen.getByText('Reconnecting…')).toBeTruthy();
    cleanup();
    header({ state: 'reconnecting', updatedAt: Date.now() - 4 * 60_000 - 5_000 });
    expect(screen.getByText('The data is 4 min old')).toBeTruthy();
  });
});
