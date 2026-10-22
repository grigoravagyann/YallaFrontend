// @vitest-environment jsdom
import {
  AskOnMyWayAskedRecentlyError,
  GuestAlreadyAnsweredError,
  createQueryClient,
  createStaffMockGateway,
  type FloorTable,
  type StaffGateway,
  type StaffTableDetail,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { OnMyWayAsk, askState, type AskSubject } from './OnMyWayAsk';
import { TableActionPanel } from './TableActionPanel';

/**
 * "Ask: are you coming?" on the floor tablet (2026-10-22, the Ask artboard):
 * the status box in its six states, the ask — enabled, or disabled with the
 * server's reason — Call when nobody answers, and the table panel's own block
 * for a booking with no pre-order card.
 */

const minutes = (offset: number) => new Date(Date.now() + offset * 60_000).toISOString();

function subject(overrides: Partial<AskSubject> = {}): AskSubject {
  return {
    reservationId: 'r-1',
    status: 'confirmed',
    startUtc: minutes(60),
    guestName: 'Ani M.',
    guestPhone: '+37491000008',
    autoAskAtUtc: minutes(30),
    ...overrides,
  };
}

function wrap(gateway: StaffGateway, children: ReactNode) {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  return (
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={gateway}>{children}</GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

function gateway(): StaffGateway {
  return createStaffMockGateway({ latencyMs: 0, branchId: 'b1' });
}

function show(overrides: Partial<AskSubject> = {}, options: { online?: boolean } = {}) {
  const staff = gateway();
  const ask = vi.spyOn(staff, 'askOnMyWay').mockResolvedValue({
    reservationId: 'r-1',
    staffAskedOnMyWayAtUtc: new Date().toISOString(),
    nextAskAllowedAtUtc: minutes(15),
    notified: true,
  });
  const view = render(
    wrap(
      staff,
      <OnMyWayAsk
        branchId="b1"
        subject={subject(overrides)}
        timeZoneId="Asia/Yerevan"
        online={options.online ?? true}
        variant="panel"
      />,
    ),
  );
  return { ask, staff, container: view.container };
}

const askButton = () => screen.queryByRole('button', { name: 'Ask: are you coming?' });
const status = () => screen.getByRole('status', { name: /./u });

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('where the question stands', () => {
  const now = new Date('2026-10-22T15:00:00Z');
  const at = (offset: number) => new Date(now.getTime() + offset * 60_000).toISOString();
  const base = subject({ startUtc: at(60), autoAskAtUtc: at(30) });

  it('is not asked before the automatic question, nor by anybody', () => {
    expect(askState(base, now)).toEqual({ kind: 'idle', autoAtUtc: at(30) });
  });

  it("is asked and waiting for fifteen minutes after the venue's ask or the automatic one", () => {
    expect(askState({ ...base, staffAskedOnMyWayAtUtc: at(-5) }, now)).toEqual({
      kind: 'asked',
      atUtc: at(-5),
      auto: false,
    });
    expect(askState({ ...base, autoAskAtUtc: at(-3) }, now)).toEqual({
      kind: 'asked',
      atUtc: at(-3),
      auto: true,
    });
  });

  it('is unanswered once fifteen minutes pass with no answer', () => {
    expect(askState({ ...base, staffAskedOnMyWayAtUtc: at(-20) }, now)).toEqual({
      kind: 'silent',
      minutes: 20,
      atUtc: at(-20),
    });
  });

  it("is the guest's latest answer: coming, or late by so much", () => {
    expect(askState({ ...base, guestConfirmedOnWayAtUtc: at(-2) }, now)).toEqual({
      kind: 'coming',
      atUtc: at(-2),
    });
    expect(
      askState({ ...base, guestRunningLateMinutes: 15, guestRunningLateAtUtc: at(-1) }, now),
    ).toEqual({ kind: 'late', minutes: 15, expectedUtc: at(75) });
    // "On my way" after "late" is on time after all.
    expect(
      askState(
        {
          ...base,
          guestRunningLateMinutes: 15,
          guestRunningLateAtUtc: at(-4),
          guestConfirmedOnWayAtUtc: at(-1),
        },
        now,
      ).kind,
    ).toBe('coming');
  });

  it('is done once the pre-order is in the kitchen', () => {
    expect(askState({ ...base, preOrderSentAtUtc: at(-1) }, now)).toEqual({
      kind: 'sent',
      atUtc: at(-1),
    });
  });
});

describe('the block', () => {
  it('asks now, without waiting for the automatic question, with the number to hand', async () => {
    const user = userEvent.setup();
    const { ask } = show();
    expect(within(status()).getByText('Not asked yet')).toBeTruthy();
    expect(
      within(status()).getByText(/^You can ask now, without waiting for \d\d:\d\d\.$/u),
    ).toBeTruthy();
    expect(
      screen.getByText(/You can ask from 2 hours before the booking, once every 15 minutes\.$/u),
    ).toBeTruthy();
    const phone = screen.getByRole('link', { name: 'Call Ani M., +374 91 00 00 08' });
    expect(phone.textContent).toBe('+374 91 00 00 08');

    await user.click(askButton()!);
    await waitFor(() => expect(ask).toHaveBeenCalledWith('r-1'));
    expect(await screen.findByText('Asked. The guest has been sent the question.')).toBeTruthy();
  });

  it('says to call when nobody can be pushed', async () => {
    const user = userEvent.setup();
    const { ask } = show();
    ask.mockResolvedValue({
      reservationId: 'r-1',
      staffAskedOnMyWayAtUtc: new Date().toISOString(),
      nextAskAllowedAtUtc: minutes(15),
      notified: false,
    });
    await user.click(askButton()!);
    expect(await screen.findByText('The guest has no app to notify. Call instead.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Call Ani M., +374 91 00 00 08' }).textContent).toBe(
      'Call · +374 91 00 00 08',
    );
  });

  it('is disabled with the reason more than two hours before the start', () => {
    show({ startUtc: minutes(150), autoAskAtUtc: minutes(120) });
    expect((askButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/^You can ask from \d\d:\d\d\.$/u)).toBeTruthy();
    expect(within(status()).getByText(/^We’ll ask automatically at \d\d:\d\d\.$/u)).toBeTruthy();
  });

  it('says it was asked and waits, and when it may ask again', () => {
    show({ staffAskedOnMyWayAtUtc: minutes(-5) });
    expect(within(status()).getByText(/^Asked at \d\d:\d\d · waiting$/u)).toBeTruthy();
    expect(
      within(status()).getByText('The answer will show here and on the Now rail.'),
    ).toBeTruthy();
    expect((askButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/^You can ask again at \d\d:\d\d\.$/u)).toBeTruthy();
    // Waiting for the answer: nobody is told to call yet.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says the automatic question went out', () => {
    show({ autoAskAtUtc: minutes(-3) });
    expect(
      within(status()).getByText(/^Asked automatically at \d\d:\d\d · waiting$/u),
    ).toBeTruthy();
    expect((askButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers Call and asking again when nobody has answered for fifteen minutes', () => {
    show({ staffAskedOnMyWayAtUtc: minutes(-20) });
    const box = status();
    expect(within(box).getByText('20 min, no answer')).toBeTruthy();
    expect(within(box).getByText('You can call or ask again.')).toBeTruthy();
    expect(box.getAttribute('data-tone')).toBe('warn');
    expect((askButton() as HTMLButtonElement).disabled).toBe(false);
    const call = screen.getByRole('link', { name: 'Call Ani M., +374 91 00 00 08' });
    expect(call.textContent).toBe('Call · +374 91 00 00 08');
    expect(call.getAttribute('href')).toBe('tel:+37491000008');
  });

  it("says the guest's answer, with nothing left to ask", () => {
    show({ guestConfirmedOnWayAtUtc: minutes(-2) });
    expect(within(status()).getByText(/^Coming · said at \d\d:\d\d$/u)).toBeTruthy();
    expect(within(status()).getByText('No need to call.')).toBeTruthy();
    expect(status().getAttribute('data-tone')).toBe('good');
    expect(askButton()).toBeNull();
  });

  it('says how late, and when to expect them', () => {
    show({ guestRunningLateMinutes: 15, guestRunningLateAtUtc: minutes(-1) });
    expect(within(status()).getByText(/^Running late 15 min · \d\d:\d\d$/u)).toBeTruthy();
    expect(within(status()).getByText(/^Expected around \d\d:\d\d\.$/u)).toBeTruthy();
    expect(askButton()).toBeNull();
  });

  it('says a refusal: the guest answered meanwhile, or somebody asked a moment ago', async () => {
    const user = userEvent.setup();
    const { ask } = show();
    ask.mockRejectedValueOnce(new GuestAlreadyAnsweredError({ url: 'x', reservationId: 'r-1' }));
    await user.click(askButton()!);
    expect((await screen.findByRole('alert')).textContent).toBe('The guest has already answered.');

    ask.mockRejectedValueOnce(
      new AskOnMyWayAskedRecentlyError({
        url: 'x',
        reservationId: 'r-1',
        nextAllowedAtUtc: minutes(12),
      }),
    );
    await user.click(askButton()!);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /^Asked a moment ago\. You can ask again at \d\d:\d\d\.$/u,
      ),
    );
  });

  it('is online only', () => {
    show({}, { online: false });
    expect((askButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Asking needs a connection.')).toBeTruthy();
  });

  it('is not there for a booking that is not confirmed', () => {
    const { container } = show({ status: 'pendingApproval' });
    expect(container.textContent).toBe('');
  });
});

describe("the table panel's block, for a booking with no pre-order", () => {
  const table: FloorTable = {
    id: 't6',
    label: '6',
    seats: 4,
    floorAreaId: 'a1',
    floorAreaName: 'Terrace',
    floorAreaDisplayOrder: 0,
    pin: null,
    isBookable: true,
    state: 'reservedSoon',
    nextReservationStartUtc: null,
  };
  const detail = (overrides: Partial<StaffTableDetail> = {}): StaffTableDetail => ({
    tableId: 't6',
    label: '6',
    seats: 4,
    physicalStatus: 'free',
    currentSessionId: null,
    seatedAtUtc: null,
    partySize: null,
    nextReservationId: 'r-6',
    nextReservationStartUtc: minutes(60),
    nextReservationPartySize: 4,
    freeUntilUtc: minutes(45),
    openTabId: null,
    rowVersion: 'v1',
    ...overrides,
  });

  function panel(next: StaffTableDetail, awaiting = false) {
    const staff = gateway();
    const ask = vi.spyOn(staff, 'askOnMyWay').mockResolvedValue({
      reservationId: 'r-6',
      staffAskedOnMyWayAtUtc: new Date().toISOString(),
      nextAskAllowedAtUtc: minutes(15),
      notified: true,
    });
    render(
      wrap(
        staff,
        <TableActionPanel
          table={{ ...table, nextReservationStartUtc: next.nextReservationStartUtc }}
          detail={next}
          timeZoneId="Asia/Yerevan"
          projectedStatus={null}
          tab={null}
          pending={false}
          online
          affectedReservations={[]}
          releasing={false}
          startingTab={false}
          branchId="b1"
          nextBookingAwaiting={awaiting}
          onAct={vi.fn()}
          onRelease={vi.fn()}
          onOpenTab={vi.fn()}
          onStartTab={vi.fn()}
          onOrder={vi.fn()}
          onCash={vi.fn()}
          onClose={vi.fn()}
        />,
      ),
    );
    return { ask };
  }

  it('asks about the next booking from two hours before it', async () => {
    const user = userEvent.setup();
    const { ask } = panel(detail());
    const block = screen.getByRole('region', {
      name: /^Booking at \d\d:\d\d: is the guest coming\?$/u,
    });
    expect(within(block).getByText('Not asked yet')).toBeTruthy();
    await user.click(within(block).getByRole('button', { name: 'Ask: are you coming?' }));
    await waitFor(() => expect(ask).toHaveBeenCalledWith('r-6'));
  });

  it('says what the floor read knows: asked, or late, with the flag beside the booking', () => {
    panel(
      detail({ nextReservationGuestRunningLateMinutes: 10, nextReservationStartUtc: minutes(-3) }),
    );
    const block = screen.getByRole('region', {
      name: /^Booking at \d\d:\d\d: is the guest coming\?$/u,
    });
    expect(within(block).getByText(/^Running late 10 min · \d\d:\d\d$/u)).toBeTruthy();
    expect(screen.getByText('Running late 10 min', { selector: '.badge' })).toBeTruthy();
  });

  it('is not there too early, or for a booking still waiting for the floor’s yes', () => {
    panel(detail({ nextReservationStartUtc: minutes(150) }));
    expect(screen.queryByRole('region', { name: /is the guest coming/u })).toBeNull();
    cleanup();
    panel(detail(), true);
    expect(screen.queryByRole('region', { name: /is the guest coming/u })).toBeNull();
  });

  it('is not there once the booking has started and nobody said late', () => {
    panel(detail({ nextReservationStartUtc: minutes(-5) }));
    expect(screen.queryByRole('region', { name: /is the guest coming/u })).toBeNull();
  });
});
