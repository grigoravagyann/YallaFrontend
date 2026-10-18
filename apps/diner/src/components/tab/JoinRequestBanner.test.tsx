import type { TabParticipantChange } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RosterPerson } from '../../tab/roster';
import { useToast } from '../motion/Toast';
import { JoinRequestBanner } from './JoinRequestBanner';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * The host's join banner on the bill: it appears for somebody waiting, taps
 * the phone once per newcomer, answers through the People screen's own host
 * actions, and moves on the moment the server says yes.
 */

const gateway = vi.hoisted(() => ({ approveJoin: vi.fn(), rejectJoin: vi.fn() }));
const tap = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../../lib/haptics', () => ({ haptics: { tap, select: vi.fn(), success: vi.fn() } }));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && Object.keys(params).length > 0 ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));

function person(participantId: string, displayName: string, status = 'pendingApproval') {
  return {
    participantId,
    displayName,
    role: 'guest',
    status,
    photo: null,
    isYou: false,
  } as RosterPerson;
}

const HOST = { ...person('p-host', 'Aram', 'approved'), role: 'host', isYou: true } as RosterPerson;
const ANNA = person('p-anna', 'Anna');
const GOR = person('p-gor', 'Gor');
const SONA = person('p-sona', 'Sona');
/** The server's name for somebody who gave none. */
const GUEST_3 = person('p-guest-3', 'Guest 3');

/** The single request's answers, called aloud with the person's name. */
const APPROVE_ANNA = 'tab.joinRequest.approveNamed {"name":"Anna"}';
const NOT_ANNA = 'tab.joinRequest.rejectNamed {"name":"Anna"}';

function change(participantId: string, status: TabParticipantChange['status']) {
  return {
    participantId,
    displayName: '',
    role: 'guest',
    status,
    permissions: { canOrder: true, canSeeTableTotal: true, canPay: false },
  } satisfies TabParticipantChange;
}

function renderBanner(people: readonly RosterPerson[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const ui = (roster: readonly RosterPerson[]) => (
    <QueryClientProvider client={client}>
      <JoinRequestBanner tabId="tab-1" people={roster} />
    </QueryClientProvider>
  );
  const view = render(ui(people));
  return {
    ...view,
    invalidate,
    show: (roster: readonly RosterPerson[]) => view.rerender(ui(roster)),
  };
}

beforeEach(() => {
  gateway.approveJoin.mockReset();
  gateway.rejectJoin.mockReset();
  tap.mockReset();
  push.mockReset();
  useToast.setState({ text: null });
});

afterEach(cleanup);

describe('JoinRequestBanner', () => {
  it('shows nothing while nobody is waiting', () => {
    const { container } = renderBanner([HOST]);
    expect(container.textContent).toBe('');
  });

  it('names the one person waiting, with the two answers', () => {
    renderBanner([HOST, ANNA]);

    expect(screen.getByRole('status').textContent).toContain('tab.joinRequest.one {"name":"Anna"}');
    // Seen as "Approve" and "Not with us"; heard as whose request they answer.
    expect(screen.getByRole('button', { name: APPROVE_ANNA }).textContent).toBe('people.approve');
    expect(screen.getByRole('button', { name: NOT_ANNA }).textContent).toBe('people.reject');
  });

  it('calls the server placeholder "Guest 3" a guest, and the buttons by their own labels', () => {
    renderBanner([HOST, GUEST_3]);

    expect(screen.getByRole('status').textContent).toContain('tab.joinRequest.oneUnnamed');
    expect(screen.getByRole('status').textContent).not.toContain('Guest 3');
    expect(screen.getByRole('button', { name: 'people.approve' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'people.reject' })).toBeTruthy();
  });

  it('taps once for a newcomer, not for whoever was already there, and not on every poll', () => {
    const { show } = renderBanner([HOST, ANNA]);
    // Waiting when the screen opened: not news.
    expect(tap).not.toHaveBeenCalled();

    show([HOST, ANNA, GOR]);
    expect(tap).toHaveBeenCalledTimes(1);

    // The next poll brings back the same people as new objects.
    show([HOST, { ...ANNA }, { ...GOR }]);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('taps when somebody asks while the host is looking at an empty banner', () => {
    const { show } = renderBanner([HOST]);
    show([HOST, ANNA]);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('approves through the host action, says so, and leaves the banner at once', async () => {
    gateway.approveJoin.mockResolvedValue(change('p-anna', 'approved'));
    const { container, invalidate } = renderBanner([HOST, ANNA]);

    fireEvent.click(screen.getByRole('button', { name: APPROVE_ANNA }));

    await waitFor(() => expect(container.textContent).toBe(''));
    expect(gateway.approveJoin).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 'tab-1', participantId: 'p-anna' }),
    );
    // The roster is read again; the banner did not wait for it.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dinerTab', 'tab-1'] });
    expect(useToast.getState().text).toBe('tab.joinRequest.approved {"name":"Anna"}');
  });

  it('turns somebody away through the host action', async () => {
    gateway.rejectJoin.mockResolvedValue(change('p-anna', 'removed'));
    const { container } = renderBanner([HOST, ANNA]);

    fireEvent.click(screen.getByRole('button', { name: NOT_ANNA }));

    await waitFor(() => expect(container.textContent).toBe(''));
    expect(useToast.getState().text).toBe('tab.joinRequest.rejected');
  });

  it('keeps the person waiting when the answer did not go through', async () => {
    gateway.approveJoin.mockRejectedValue(new Error('offline'));
    renderBanner([HOST, ANNA]);

    fireEvent.click(screen.getByRole('button', { name: APPROVE_ANNA }));

    await waitFor(() => expect(useToast.getState().text).toBe('people.failed'));
    expect(screen.getByRole('status').textContent).toContain('Anna');
  });

  it('counts several, approves them all one by one, and opens People for "See who"', async () => {
    gateway.approveJoin.mockImplementation(({ participantId }: { participantId: string }) =>
      Promise.resolve(change(participantId, 'approved')),
    );
    const { container } = renderBanner([HOST, ANNA, GOR]);

    expect(screen.getByRole('status').textContent).toContain('tab.joinRequest.several {"count":2}');

    fireEvent.click(screen.getByRole('button', { name: 'tab.joinRequest.seeWho' }));
    expect(push).toHaveBeenCalledWith({
      pathname: '/tab/[tabId]/people',
      params: { tabId: 'tab-1' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'tab.joinRequest.approveAll' }));

    await waitFor(() => expect(container.textContent).toBe(''));
    expect(gateway.approveJoin.mock.calls.map(([input]) => input.participantId)).toEqual([
      'p-anna',
      'p-gor',
    ]);
    // Each its own command, so a retry never answers somebody twice.
    const [first, second] = gateway.approveJoin.mock.calls.map(([input]) => input.commandId);
    expect(first).not.toBe(second);
    expect(useToast.getState().text).toBe('tab.joinRequest.approvedAll {"count":2}');
  });

  it('approves everyone it can when one fails, and says the rest are still waiting', async () => {
    gateway.approveJoin.mockImplementation(({ participantId }: { participantId: string }) =>
      participantId === 'p-gor'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(change(participantId, 'approved')),
    );
    renderBanner([HOST, ANNA, GOR, SONA]);

    fireEvent.click(screen.getByRole('button', { name: 'tab.joinRequest.approveAll' }));

    // Gor's failure did not stop Sona's approval.
    await waitFor(() =>
      expect(useToast.getState().text).toBe(
        'tab.joinRequest.notAll {"done":"tab.joinRequest.approvedAll {\\"count\\":2}"}',
      ),
    );
    expect(gateway.approveJoin.mock.calls.map(([input]) => input.participantId)).toEqual([
      'p-anna',
      'p-gor',
      'p-sona',
    ]);
    // Gor is the one left waiting, on the banner still.
    expect(screen.getByRole('status').textContent).toContain('tab.joinRequest.one {"name":"Gor"}');
  });

  it('shows somebody again who comes back to ask after the read caught up', async () => {
    gateway.rejectJoin.mockResolvedValue(change('p-anna', 'removed'));
    const { container, show } = renderBanner([HOST, ANNA]);

    fireEvent.click(screen.getByRole('button', { name: NOT_ANNA }));
    await waitFor(() => expect(container.textContent).toBe(''));

    show([HOST, person('p-anna', 'Anna', 'removed')]);
    show([HOST, ANNA]);

    expect(screen.getByRole('status').textContent).toContain('Anna');
  });
});
