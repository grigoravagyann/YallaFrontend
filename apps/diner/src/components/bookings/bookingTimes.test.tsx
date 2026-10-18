import type { Booking, YallaGateway } from '@yalla/api';
import { TableRequestClosedError } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as I18nModule from '@yalla/i18n';
import { FreeBySheet } from './FreeBySheet';
import { TableRequestCard } from './TableRequestCard';

/**
 * Booking times, on the diner's two new pieces: the question asked before
 * sending a booking the next one cuts short, and the earlier guest's card —
 * somebody would like their table, will they have left by then — with its
 * Yes and No.
 *
 * Copy is checked by key and its values; the sentences are pinned in the
 * shared helpers' tests.
 */

const gateway = vi.hoisted(() => ({ answerTableRequest: vi.fn() }));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params && Object.keys(params).length > 0
        ? `${key} ${Object.entries(params)
            .map(([name, value]) => `${name}=${value}`)
            .join(' ')}`
        : key,
  }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('../../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

afterEach(() => {
  cleanup();
  gateway.answerTableRequest.mockReset();
});

const YEREVAN = 'Asia/Yerevan';

describe('the must-free-by question', () => {
  function sheet() {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    render(
      <FreeBySheet
        visible
        freeByUtc="2026-10-20T17:25:00.000Z"
        nextStartUtc="2026-10-20T17:30:00.000Z"
        timeZoneId={YEREVAN}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    return { onAccept, onDecline };
  }

  it('asks with the next booking and the time, before anything is sent', () => {
    sheet();
    expect(screen.getByText('book.freeBy.question next=21:30 time=21:25')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'book.freeBy.yes time=21:25' })).toBeTruthy();
  });

  it('sends on yes, and offers another table or time on no', () => {
    const { onAccept, onDecline } = sheet();
    fireEvent.click(screen.getByRole('button', { name: 'book.freeBy.yes time=21:25' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'book.freeBy.no' }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});

const HOUR = 3_600_000;

const EARLIER: Booking = {
  id: 'booking-1',
  code: 'ABC123',
  status: 'confirmed',
  venueName: 'Yalla Demo Cafe',
  branchId: 'branch-1',
  branchName: 'Yerevan Centre',
  timeZoneId: YEREVAN,
  tableId: 't1',
  tableLabel: '1',
  roomId: null,
  roomName: null,
  partySize: 2,
  slotUtc: '2026-10-20T14:00:00.000Z',
  endUtc: '2026-10-20T15:30:00.000Z',
  freeCancellationUntilUtc: '2026-10-20T12:00:00.000Z',
  cancelledAtUtc: null,
  cancelledAfterDeadline: false,
  note: null,
  awaitingApprovalBecause: null,
  approvalExpiresAtUtc: null,
  declinedBecause: null,
  manageToken: null,
  promisedFreeByUtc: null,
  incomingTableRequest: {
    requestId: 'request-1',
    requestedStartUtc: '2026-10-20T15:45:00.000Z',
    freeByUtc: '2026-10-20T15:40:00.000Z',
    expiresAtUtc: new Date(Date.now() + 2 * HOUR).toISOString(),
  },
};

function card(
  booking: Booking = EARLIER,
  autoAnswer?: { readonly requestId: string; readonly accept: boolean },
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GatewayProvider gateway={gateway as unknown as YallaGateway}>
        <TableRequestCard booking={booking} {...(autoAnswer ? { autoAnswer } : {})} />
      </GatewayProvider>
    </QueryClientProvider>,
  );
}

describe("the earlier guest's card", () => {
  it('asks whether they will have left, saying when the later guest comes and by when to answer', () => {
    card();
    expect(screen.getByText('booking.tableRequest.question time=19:45 freeBy=19:40')).toBeTruthy();
    expect(screen.getByText(/^booking\.tableRequest\.answerBy time=/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'booking.tableRequest.yes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'booking.tableRequest.no' })).toBeTruthy();
  });

  it('answers yes once, with one command id, and thanks them with the promise', async () => {
    gateway.answerTableRequest.mockResolvedValue({
      ...EARLIER,
      incomingTableRequest: null,
      promisedFreeByUtc: '2026-10-20T15:40:00.000Z',
    });
    card();
    fireEvent.click(screen.getByRole('button', { name: 'booking.tableRequest.yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'booking.tableRequest.yes' }));

    await screen.findByText('booking.tableRequest.answeredYes time=19:40');
    expect(gateway.answerTableRequest).toHaveBeenCalledTimes(1);
    expect(gateway.answerTableRequest).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'booking-1', requestId: 'request-1', accept: true }),
    );
  });

  it('answers no, and says the later guest is told', async () => {
    gateway.answerTableRequest.mockResolvedValue({ ...EARLIER, incomingTableRequest: null });
    card();
    fireEvent.click(screen.getByRole('button', { name: 'booking.tableRequest.no' }));
    await screen.findByText('booking.tableRequest.answeredNo');
    expect(gateway.answerTableRequest).toHaveBeenCalledWith(
      expect.objectContaining({ accept: false }),
    );
  });

  it('says a request that closed meanwhile has closed, rather than that the tap failed', async () => {
    gateway.answerTableRequest.mockRejectedValue(
      new TableRequestClosedError({ url: 'x', requestId: 'request-1' }),
    );
    card();
    fireEvent.click(screen.getByRole('button', { name: 'booking.tableRequest.yes' }));
    await screen.findByText('booking.tableRequest.closed');
  });

  it('keeps the buttons for another try after a failure', async () => {
    gateway.answerTableRequest.mockRejectedValueOnce(new Error('offline'));
    card();
    fireEvent.click(screen.getByRole('button', { name: 'booking.tableRequest.yes' }));
    await screen.findByText('booking.tableRequest.failed');
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', { name: 'booking.tableRequest.yes' }) as HTMLElement
        ).getAttribute('aria-disabled'),
      ).not.toBe('true'),
    );
  });

  it('uses a command id of its own for each answer, so No after a failed Yes is not refused', async () => {
    gateway.answerTableRequest.mockRejectedValueOnce(new Error('offline'));
    gateway.answerTableRequest.mockResolvedValueOnce({ ...EARLIER, incomingTableRequest: null });
    card();
    fireEvent.click(screen.getByRole('button', { name: 'booking.tableRequest.yes' }));
    await screen.findByText('booking.tableRequest.failed');
    fireEvent.click(screen.getByRole('button', { name: 'booking.tableRequest.no' }));
    await screen.findByText('booking.tableRequest.answeredNo');
    const [yes, no] = gateway.answerTableRequest.mock.calls.map(([command]) => command);
    expect(yes.commandId).not.toBe(no.commandId);
  });

  it('sends the answer a lock-screen button gave, once, and says so when it went through', async () => {
    gateway.answerTableRequest.mockResolvedValue({ ...EARLIER, incomingTableRequest: null });
    card(EARLIER, { requestId: 'request-1', accept: true });
    await screen.findByText('booking.tableRequest.answeredYes time=19:40');
    expect(gateway.answerTableRequest).toHaveBeenCalledTimes(1);
    expect(gateway.answerTableRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-1', accept: true }),
    );
  });

  it('never lets a failed lock-screen answer pass for one: the card asks again, saying so', async () => {
    gateway.answerTableRequest.mockRejectedValue(new Error('signed out on a locked phone'));
    card(EARLIER, { requestId: 'request-1', accept: false });
    await screen.findByText('booking.tableRequest.failed');
    expect(screen.getByRole('button', { name: 'booking.tableRequest.yes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'booking.tableRequest.no' })).toBeTruthy();
  });

  it('sends nothing for a button pressed on a request that is no longer the one asked', async () => {
    card(EARLIER, { requestId: 'an-older-request', accept: true });
    await screen.findByText('booking.tableRequest.question time=19:45 freeBy=19:40');
    expect(gateway.answerTableRequest).not.toHaveBeenCalled();
  });

  it('is nothing at all when nobody is asking', () => {
    card({ ...EARLIER, incomingTableRequest: null });
    expect(screen.queryByText(/booking\.tableRequest/u)).toBeNull();
  });
});
