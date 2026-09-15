import type { DinerProfileView } from '@yalla/api';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../stores/session';
import { useJoinByCode } from './useJoinByCode';

/**
 * The name the host sees goes with the scan, the invitation and the booking
 * code: the account's name, else the one remembered on this phone, else none.
 */

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const mutations = vi.hoisted(() => ({ scan: vi.fn(), join: vi.fn(), booking: vi.fn() }));

vi.mock('expo-router', () => ({ useRouter: () => router }));
vi.mock('../data/queries', () => ({
  useScanTableCode: () => ({ mutateAsync: mutations.scan, isPending: false }),
  useJoinTab: () => ({ mutateAsync: mutations.join, isPending: false }),
  useOpenTabByBooking: () => ({ mutateAsync: mutations.booking, isPending: false }),
}));

const OPENED = { kind: 'tabOpened', tab: { tabId: 'tab-1' } };

function profileNamed(displayName: string | null): DinerProfileView {
  return {
    dinerUserId: 'diner-a',
    username: null,
    email: null,
    phoneE164: '+37491000123',
    phoneVerified: true,
    displayName,
    localeCode: 'en',
    hasPassword: false,
    photo: null,
  };
}

beforeEach(() => {
  for (const mutation of Object.values(mutations)) {
    mutation.mockReset();
    mutation.mockResolvedValue(OPENED);
  }
  router.replace.mockClear();
});

afterEach(() => {
  cleanup();
  useSession.setState({ signedIn: false, profile: null, phoneE164: null, guestName: null });
});

describe('useJoinByCode sends a display name', () => {
  it("sends the account's name on a table scan", async () => {
    useSession.setState({
      signedIn: true,
      profile: profileNamed('Anahit Sargsyan'),
      guestName: 'Ani',
    });
    const { result } = renderHook(() => useJoinByCode());

    await act(() => result.current.enter({ kind: 'table', code: 'T1' }));

    expect(mutations.scan).toHaveBeenCalledWith(
      expect.objectContaining({ tableCode: 'T1', displayName: 'Anahit Sargsyan' }),
    );
  });

  it('sends the name remembered on the phone on an invitation', async () => {
    useSession.setState({ signedIn: false, profile: null, guestName: ' Tigran ' });
    const { result } = renderHook(() => useJoinByCode());

    await act(() => result.current.enter({ kind: 'invite', token: 'tok' }));

    expect(mutations.join).toHaveBeenCalledWith({ joinToken: 'tok', displayName: 'Tigran' });
  });

  it('sends the name on a booking code', async () => {
    useSession.setState({ signedIn: true, profile: profileNamed(null), guestName: 'Anahit' });
    const { result } = renderHook(() => useJoinByCode());

    await act(() => result.current.enter({ kind: 'booking', code: 'ABC123' }));

    expect(mutations.booking).toHaveBeenCalledWith(
      expect.objectContaining({ bookingCode: 'ABC123', displayName: 'Anahit' }),
    );
  });

  it('leaves the field off when the phone knows no name', async () => {
    const { result } = renderHook(() => useJoinByCode());

    await act(() => result.current.enter({ kind: 'table', code: 'T1' }));

    expect(mutations.scan).toHaveBeenCalledTimes(1);
    expect(mutations.scan.mock.calls[0]![0]).not.toHaveProperty('displayName');
  });
});
