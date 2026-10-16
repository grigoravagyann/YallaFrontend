import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { TabAccessEndedError } from '../contracts/errors';
import { fakeBackend, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway, type TabTokenStorage } from './httpGateway';

/**
 * The participant token a tab issued this device outlives the gateway that
 * obtained it. It used to live only in the gateway's memory, so a reload or a
 * deep link to an open tab met "the tab has closed, or you were taken off it"
 * while the server still had the diner on the tab — and a re-scan of the same
 * table was the only way back.
 */

const TAB = '7d0c0000-0000-4000-8000-000000000001';
const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const ME = '5a1e0000-0000-4000-8000-0000000000a1';

function tabView() {
  return {
    tabId: TAB,
    branchId: BRANCH,
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    tableLabel: '7',
    status: 1,
    settlementMode: 3,
    settlementModeLocked: false,
    hostParticipantId: ME,
    hideTotalFromGuests: false,
    me: {
      participantId: ME,
      displayName: 'Ani',
      role: 1,
      status: 2,
      canOrder: true,
      canOrderNow: true,
      canPay: true,
      canSeeTableTotal: true,
      joinedAtUtc: '2026-09-20T15:00:00Z',
    },
    participants: [{ participantId: ME, displayName: 'Ani', role: 1, status: 2 }],
    myLines: [],
    tableLines: [],
    tableTotalVisible: true,
    tableTotal: { subtotalAmd: 0, serviceChargeAmd: 0, totalAmd: 0, paidAmd: 0, remainingAmd: 0 },
    myItemsSubtotalAmd: 0,
    openedAtUtc: '2026-09-20T15:00:00Z',
    timeZoneId: 'Asia/Yerevan',
    serviceChargePercent: 10,
    maxSequence: 12,
    adjustments: [],
  };
}

function access() {
  return {
    outcome: 1,
    wasReplay: false,
    tab: tabView(),
    token: {
      accessToken: 'participant-token',
      branchId: BRANCH,
      canOrder: true,
      displayName: 'Ani',
      expiresAtUtc: '2026-09-21T03:00:00Z',
      participantId: ME,
      tabId: TAB,
    },
  };
}

/** A store that survives "the app", as the keychain or localStorage does. */
function memoryTabTokens(initial: Record<string, string> = {}): TabTokenStorage & {
  readonly current: () => Record<string, string>;
} {
  let value = { ...initial };
  return {
    read: () => Promise.resolve({ ...value }),
    write: (tokens) => {
      value = { ...tokens };
      return Promise.resolve();
    },
    current: () => value,
  };
}

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>, tabTokens: TabTokenStorage) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('diner-refresh'),
    refreshTokens: vi.fn(() => Promise.reject(new Error('the diner refresh must not run'))),
  });
  const gateway = createHttpGateway(backend.client({ auth }), {
    audience: 'diner',
    auth,
    deviceId: () => Promise.resolve('device-1'),
    tabTokens,
  });
  return { gateway, backend };
}

describe('the participant token between launches', () => {
  it('is written to the store when a tab admits this device', async () => {
    const store = memoryTabTokens();
    const { gateway } = gatewayOver({ 'POST /api/tabs/open': { body: access() } }, store);

    await gateway.scanTableCode({ tableCode: 'a3f09c1e5b7d42e8', commandId: 'cmd-open' });

    expect(store.current()).toEqual({ [TAB]: 'participant-token' });
  });

  it('is read back by a fresh gateway, which reads the tab with it', async () => {
    const store = memoryTabTokens({ [TAB]: 'participant-token' });
    const { gateway, backend } = gatewayOver(
      { [`GET /api/tabs/${TAB}`]: { body: tabView() } },
      store,
    );

    const view = await gateway.getDinerTab(TAB);

    expect(view?.tabId).toBe(TAB);
    expect(backend.requests[0]?.headers.get('authorization')).toBe('Bearer participant-token');
  });

  it('is dropped from the store once the server says the tab is over for this device', async () => {
    const store = memoryTabTokens({ [TAB]: 'participant-token' });
    const { gateway } = gatewayOver({ [`GET /api/tabs/${TAB}`]: { status: 401 } }, store);

    await expect(gateway.getDinerTab(TAB)).rejects.toBeInstanceOf(TabAccessEndedError);

    expect(store.current()).toEqual({});
  });

  it('says a tab this device holds no token for is not one it is on, rather than a closed one', async () => {
    const store = memoryTabTokens();
    const { gateway, backend } = gatewayOver({}, store);

    const error = await gateway.getDinerTab(TAB).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TabAccessEndedError);
    expect((error as TabAccessEndedError).notOnDevice).toBe(true);
    expect(backend.requests).toHaveLength(0);
  });
});
