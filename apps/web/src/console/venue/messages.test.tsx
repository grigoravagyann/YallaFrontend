// @vitest-environment jsdom
import {
  ValidationError,
  createConsoleMockGateway,
  type ConsoleGateway,
  type MessageSettingsInput,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/toast';
import { ReservationPolicyScreen } from './policy/ReservationPolicyScreen';
import { createConsoleHarness, initConsoleTestI18n } from './reports/testHarness';

/**
 * Messages with guests in the venue console (2026-10-23, the Policy
 * artboard): a card on the Reservation policy page — guests may write, waiters
 * may write from the tablet, the ready replies (edit, delete, add, at most
 * eight), the reminder (1–15 minutes), what is never allowed, and Save. Its
 * own endpoint, saved on its own and by the page's bar; a 422 marks every
 * field it names.
 */

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(async () => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  await initConsoleTestI18n();
});

afterEach(cleanup);

const NORTH = 'b-lumen-north';

function gateway(): ConsoleGateway {
  return createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
}

function renderPolicy(console: ConsoleGateway) {
  const harness = createConsoleHarness({ gateway: console });
  const context = {
    branchId: NORTH,
    branchName: 'Northern Avenue',
    timeZoneId: 'Asia/Yerevan',
    branchCount: 3,
    canRollUpVenue: true,
    canRelocate: true,
  };
  render(
    harness.wrap(
      <ToastProvider>
        <Routes>
          <Route path="/venue" element={<Outlet context={context} />}>
            <Route path="policy" element={<ReservationPolicyScreen />} />
          </Route>
        </Routes>
      </ToastProvider>,
      '/venue/policy',
    ),
  );
}

async function messagesCard(): Promise<HTMLElement> {
  const card = await screen.findByRole(
    'region',
    { name: 'Messages with guests' },
    { timeout: 5000 },
  );
  await within(card).findByRole('switch', { name: 'Guests can write to us' });
  return card;
}

const replies = (card: HTMLElement) =>
  within(card)
    .getAllByRole('textbox', { name: /^Reply \d$/u })
    .map((field) => (field as HTMLInputElement).value);

describe('the messages card', () => {
  it('shows the defaults: guests and waiters write, the four replies, three minutes', async () => {
    renderPolicy(gateway());
    const card = await messagesCard();

    expect(
      within(card)
        .getByRole('switch', { name: 'Guests can write to us' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    const writers = within(card).getByRole('group', { name: 'Who can write from the tablet' });
    expect(
      (within(writers).getByRole('checkbox', { name: 'Waiters' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(replies(card)).toEqual([
      'OK, we’ll wait',
      'Your table is ready',
      'We’re running a little late',
      'Your pre-order is ready',
    ]);
    expect(
      (within(card).getByRole('textbox', { name: 'Remind the tablet' }) as HTMLInputElement).value,
    ).toBe('3');
    expect(within(card).getByText('What is not allowed')).toBeTruthy();
    expect(
      within(screen.getByRole('navigation', { name: 'Policy groups' })).getByRole('link', {
        name: 'Messages with guests',
      }),
    ).toBeTruthy();
  });

  it('saves all four, with the replies as edited, and keeps the defaults as none until changed', async () => {
    const user = userEvent.setup();
    const console = gateway();
    const save = vi.spyOn(console, 'saveMessageSettings');
    renderPolicy(console);
    const card = await messagesCard();

    // Only the switch changed: the replies stay the app's (null).
    await user.click(within(card).getByRole('switch', { name: 'Guests can write to us' }));
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toEqual({
      branchId: NORTH,
      settings: {
        guestsCanWrite: false,
        waitersCanWrite: true,
        templates: null,
        remindAfterMinutes: 3,
      } satisfies MessageSettingsInput,
    });

    // Waiters off, a reply deleted, one edited, one added, the reminder at 5.
    await user.click(within(card).getByRole('checkbox', { name: 'Waiters' }));
    await user.click(
      within(card).getByRole('button', { name: 'Delete “Your pre-order is ready”' }),
    );
    const second = within(card).getByRole('textbox', { name: 'Reply 2' });
    await user.clear(second);
    await user.type(second, '  Table ready at the window  ');
    await user.click(within(card).getByRole('button', { name: '+ Add a reply' }));
    await user.type(within(card).getByRole('textbox', { name: 'Reply 4' }), 'Parking is free');
    const more = within(card).getByRole('button', { name: 'Increase: Remind the tablet' });
    await user.click(more);
    await user.click(more);
    await user.click(within(card).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0].settings).toEqual({
      guestsCanWrite: false,
      waitersCanWrite: false,
      templates: [
        'OK, we’ll wait',
        'Table ready at the window',
        'We’re running a little late',
        'Parking is free',
      ],
      remindAfterMinutes: 5,
    });
    expect(await screen.findByText('Message settings saved.')).toBeTruthy();
  });

  it('allows eight replies at most, and an empty one is not saved', async () => {
    const user = userEvent.setup();
    const console = gateway();
    const save = vi.spyOn(console, 'saveMessageSettings');
    renderPolicy(console);
    const card = await messagesCard();

    const add = within(card).getByRole('button', { name: '+ Add a reply' });
    for (let index = 0; index < 4; index += 1) await user.click(add);
    expect(replies(card)).toHaveLength(8);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(within(card).getByText('At most 8 replies.')).toBeTruthy();

    // The four new ones are empty: Save says so and sends nothing.
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    expect(within(card).getAllByText('1 to 120 characters.')).toHaveLength(4);
    expect(save).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(card).getByRole('textbox', { name: 'Reply 5' }));
  });

  it('keeps the reminder between 1 and 15 minutes', async () => {
    const user = userEvent.setup();
    renderPolicy(gateway());
    const card = await messagesCard();
    const field = within(card).getByRole('textbox', { name: 'Remind the tablet' });
    await user.clear(field);
    await user.type(field, '20');
    expect(within(card).getByText('Must be between 1 and 15')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    await user.clear(field);
    await user.type(field, '1');
    expect(
      (
        within(card).getByRole('button', {
          name: 'Decrease: Remind the tablet',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('marks every field a 422 names', async () => {
    const user = userEvent.setup();
    const console = gateway();
    vi.spyOn(console, 'saveMessageSettings').mockRejectedValue(
      new ValidationError({
        url: '/api/branches/b-lumen-north/message-settings',
        status: 422,
        problem: {
          type: '',
          title: 'Invalid',
          status: 422,
          detail: 'Two fields are invalid.',
          code: 'validation-failed',
          traceId: 't',
          context: {
            fields: [
              { field: 'templates[1]', message: 'Not allowed.' },
              { field: 'remindAfterMinutes', message: 'Not allowed.' },
            ],
          },
        },
      }),
    );
    renderPolicy(console);
    const card = await messagesCard();

    await user.click(within(card).getByRole('checkbox', { name: 'Waiters' }));
    await user.click(within(card).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('The message settings were not saved.')).toBeTruthy();
    expect(
      within(card).getByRole('textbox', { name: 'Reply 2' }).getAttribute('aria-invalid'),
    ).toBe('true');
    expect(
      within(card).getByRole('textbox', { name: 'Remind the tablet' }).getAttribute('aria-invalid'),
    ).toBe('true');
    expect(
      within(card).getAllByText('The server did not accept this value. Check it and save again.'),
    ).toHaveLength(2);
  });
});
