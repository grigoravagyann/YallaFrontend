import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';

/**
 * The shared tab against the real routes.
 *
 * Scan, join, the roster, leave and every host action used to be answered by
 * the in-memory mock, which minted ids like `tab_1` and never obtained a
 * participant token — so every real ordering call carried a mock id and the
 * phone's own diner token, and got a route 404 or a 403. These fail against
 * that code at the first request, because none was made.
 */

const TAB = '7d0c0000-0000-4000-8000-000000000001';
const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const ME = '5a1e0000-0000-4000-8000-0000000000a1';
const GUEST = '5a1e0000-0000-4000-8000-0000000000b2';

function participantView(over: Record<string, unknown> = {}) {
  return {
    participantId: ME,
    displayName: 'Ani',
    role: 1,
    status: 2,
    canOrder: true,
    canOrderNow: true,
    canPay: true,
    canSeeTableTotal: true,
    joinedAtUtc: '2026-09-20T15:00:00Z',
    ...over,
  };
}

function lineView(over: Record<string, unknown> = {}) {
  return {
    lineId: 'l1',
    orderId: 'o1',
    menuItemId: 'm1',
    name: 'Khorovats',
    quantity: 1,
    unitPriceAmd: 4500,
    lineTotalAmd: 4500,
    isShared: false,
    isVoided: false,
    orderStatus: 2,
    sharedWithCount: 0,
    placedByParticipantId: ME,
    placedByDisplayName: 'Ani',
    ...over,
  };
}

function tabView(over: Record<string, unknown> = {}) {
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
    me: participantView(),
    participants: [{ participantId: ME, displayName: 'Ani', role: 1, status: 2 }],
    myLines: [lineView()],
    tableLines: [lineView()],
    tableTotalVisible: true,
    tableTotal: {
      subtotalAmd: 4500,
      serviceChargeAmd: 450,
      totalAmd: 4950,
      paidAmd: 0,
      remainingAmd: 4950,
    },
    myItemsSubtotalAmd: 4500,
    openedAtUtc: '2026-09-20T15:00:00Z',
    timeZoneId: 'Asia/Yerevan',
    serviceChargePercent: 10,
    maxSequence: 12,
    adjustments: [],
    ...over,
  };
}

function access(outcome: number, meStatus = 2, wasReplay = false) {
  return {
    outcome,
    wasReplay,
    tab: tabView({ me: participantView({ status: meStatus }) }),
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

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  const refreshTokens = vi.fn(() => Promise.reject(new Error('the diner refresh must not run')));
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('diner-refresh'),
    refreshTokens,
  });
  const gateway = createHttpGateway(backend.client({ auth }), {
    audience: 'diner',
    auth,
    deviceId: () => Promise.resolve('device-1'),
  });
  return { gateway, backend, refreshTokens };
}

/** A gateway already on the tab, holding its participant token. */
async function onTheTab(routes: Readonly<Record<string, FakeRoute>>) {
  const setup = gatewayOver({ 'POST /api/tabs/open': { body: access(1) }, ...routes });
  await setup.gateway.scanTableCode({ tableCode: 'a3f09c1e5b7d42e8', commandId: 'cmd-open' });
  return setup;
}

async function caught(promise: Promise<unknown>): Promise<Error & Record<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    return error as Error & Record<string, unknown>;
  }
  throw new Error('expected a rejection');
}

describe('scanning a table', () => {
  it('opens the tab with this device, and uses the participant token it gets back', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/tabs/open': { body: access(1) },
      [`GET /api/tabs/${TAB}`]: { body: tabView() },
    });

    const result = await gateway.scanTableCode({
      tableCode: 'a3f09c1e5b7d42e8',
      commandId: 'cmd-open',
    });

    expect(backend.requests[0]?.path).toBe('/api/tabs/open');
    expect(backend.requests[0]?.body).toEqual({
      qrToken: 'a3f09c1e5b7d42e8',
      deviceId: 'device-1',
      clientCommandId: 'cmd-open',
    });
    // Anonymous: the scan is how a token is obtained, not something one needs.
    expect(backend.requests[0]?.headers.get('authorization')).toBeNull();
    expect(result.kind).toBe('tabOpened');
    expect(result.tab.tabId).toBe(TAB);
    expect(result.tab.venueName).toBe('Lumen Coffee');

    await gateway.getDinerTab(TAB);
    // The tab's own token, never the phone's diner session.
    expect(backend.requests[1]?.headers.get('authorization')).toBe('Bearer participant-token');
  });

  it('reads pending and already-on from the outcome and my own status', async () => {
    const pending = gatewayOver({ 'POST /api/tabs/open': { body: access(3, 1) } });
    const rescan = gatewayOver({ 'POST /api/tabs/open': { body: access(3, 2) } });

    await expect(
      pending.gateway.scanTableCode({ tableCode: 'x', commandId: 'c1' }),
    ).resolves.toMatchObject({ kind: 'joinPending' });
    await expect(
      rescan.gateway.scanTableCode({ tableCode: 'x', commandId: 'c2' }),
    ).resolves.toMatchObject({ kind: 'alreadyOn' });
  });

  it('gives each refusal its own error', async () => {
    const unknown = gatewayOver({});
    const free = gatewayOver({
      'POST /api/tabs/open': problemReply(409, 'feature-not-enabled', { feature: 'Tabs' }),
    });
    const broken = gatewayOver({
      'POST /api/tabs/open': problemReply(
        409,
        'conflicting-state',
        undefined,
        'Table 7 is out of service. Ask a member of staff for another table.',
      ),
    });
    const settling = gatewayOver({
      'POST /api/tabs/open': problemReply(
        409,
        'conflicting-state',
        undefined,
        'This tab is being settled and no longer takes new people. Ask a member of staff.',
      ),
    });

    const scan = (g: typeof unknown) => g.gateway.scanTableCode({ tableCode: 'x', commandId: 'c' });
    expect((await caught(scan(unknown))).name).toBe('UnknownTableCodeError');
    expect((await caught(scan(free))).name).toBe('TabsNotEnabledError');
    const outOfService = await caught(scan(broken));
    expect(outOfService.name).toBe('TableOutOfServiceError');
    expect(outOfService['tableLabel']).toBe('7');
    expect((await caught(scan(settling))).name).toBe('TabClosedError');
  });
});

describe('joining with an invitation', () => {
  it('posts the invitation to /api/tabs/join, not to the table scan', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/tabs/join': { body: access(3, 1) },
    });

    const result = await gateway.joinTab({ joinToken: 'Zx9_Ab-12', displayName: 'Nare' });

    expect(backend.requests[0]?.path).toBe('/api/tabs/join');
    expect(backend.requests[0]?.body).toEqual({
      joinToken: 'Zx9_Ab-12',
      deviceId: 'device-1',
      displayName: 'Nare',
    });
    expect(result.kind).toBe('joinPending');
  });

  it('says an old invitation has expired', async () => {
    const { gateway } = gatewayOver({
      'POST /api/tabs/join': problemReply(401, 'unauthenticated'),
    });
    expect((await caught(gateway.joinTab({ joinToken: 'old' }))).name).toBe('InviteExpiredError');
  });
});

describe('on the tab', () => {
  it('leaves through the real route', async () => {
    const { gateway, backend } = await onTheTab({
      [`POST /api/tabs/${TAB}/leave`]: { body: participantView({ status: 3 }) },
    });

    await gateway.leaveTab({ tabId: TAB });

    const leave = backend.requests.find((r) => r.path === `/api/tabs/${TAB}/leave`);
    expect(leave?.method).toBe('POST');
    expect(leave?.headers.get('authorization')).toBe('Bearer participant-token');
  });

  it('says a host with nobody to hand the tab to cannot leave', async () => {
    const { gateway } = await onTheTab({
      [`POST /api/tabs/${TAB}/leave`]: problemReply(409, 'conflicting-state'),
    });
    expect((await caught(gateway.leaveTab({ tabId: TAB }))).name).toBe('HostCannotLeaveError');
  });

  it('reads a 401 on the tab as the tab being over for this phone, without touching the diner session', async () => {
    const { gateway, refreshTokens } = await onTheTab({
      [`GET /api/tabs/${TAB}`]: { status: 401 },
    });

    expect((await caught(gateway.getDinerTab(TAB))).name).toBe('TabAccessEndedError');
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it('mints the invitation the host shares', async () => {
    const { gateway } = await onTheTab({
      [`POST /api/tabs/${TAB}/join-tokens`]: {
        body: {
          tabId: TAB,
          token: 'Zx9_Ab-12',
          shareUrl: 'https://yalla.am/join/Zx9_Ab-12',
          expiresAtUtc: '2026-09-20T15:30:00Z',
        },
      },
    });

    await expect(gateway.createTabInvite({ tabId: TAB, commandId: 'c' })).resolves.toEqual({
      tabId: TAB,
      token: 'Zx9_Ab-12',
      url: 'https://yalla.am/join/Zx9_Ab-12',
      expiresAtUtc: '2026-09-20T15:30:00Z',
    });
  });

  it('reads a refused invitation as not being the host, not as a failure to retry', async () => {
    const { gateway } = await onTheTab({
      // TabService.CreateJoinTokenAsync: RequireHost(tab, actingParticipantId,
      // "Inviting others"), mapped to 403 `forbidden`.
      [`POST /api/tabs/${TAB}/join-tokens`]: problemReply(403, 'forbidden', {
        operation: 'Inviting others',
        requirement: 'the host of this tab',
      }),
    });

    expect((await caught(gateway.createTabInvite({ tabId: TAB, commandId: 'c' }))).name).toBe(
      'NotTabHostError',
    );
  });

  it('approves and sets permissions on the participant routes', async () => {
    const { gateway, backend } = await onTheTab({
      [`POST /api/tabs/${TAB}/participants/${GUEST}/approve`]: {
        body: participantView({ participantId: GUEST, role: 2, canPay: false }),
      },
      [`POST /api/tabs/${TAB}/participants/${GUEST}/permissions`]: {
        body: participantView({ participantId: GUEST, role: 2, canOrder: false, canPay: false }),
      },
    });

    const approved = await gateway.approveJoin({
      tabId: TAB,
      participantId: GUEST,
      commandId: 'c',
    });
    expect(approved).toMatchObject({ participantId: GUEST, status: 'approved' });

    const changed = await gateway.setParticipantPermissions({
      tabId: TAB,
      participantId: GUEST,
      permissions: { canOrder: false, canSeeTableTotal: true, canPay: false },
      commandId: 'c',
    });
    expect(backend.requests.at(-1)?.body).toEqual({
      canOrder: false,
      canSeeTableTotal: true,
      canPay: false,
    });
    expect(changed.permissions).toEqual({ canOrder: false, canSeeTableTotal: true, canPay: false });
  });

  it('carries voided lines, adjustments, the zone, the service percentage and the sequence', async () => {
    const voided = lineView({
      lineId: 'l2',
      name: 'Lemonade',
      isVoided: true,
      lineTotalAmd: 0,
      voidReason: 'Spilled',
      voidedAtUtc: '2026-09-20T15:20:00Z',
    });
    const { gateway } = await onTheTab({
      [`GET /api/tabs/${TAB}`]: {
        body: tabView({
          myLines: [lineView(), voided],
          tableLines: [lineView(), voided],
          adjustments: [
            {
              adjustmentId: 'a1',
              kind: 2,
              reductionAmd: 1000,
              amountAmd: 1000,
              reason: 'Birthday',
              isVoided: false,
              appliedAtUtc: '2026-09-20T15:25:00Z',
            },
          ],
        }),
      },
    });

    const view = await gateway.getDinerTab(TAB);

    expect(view?.timeZoneId).toBe('Asia/Yerevan');
    expect(view?.serviceChargePercent).toBe(10);
    expect(view?.maxSequence).toBe(12);
    expect(view?.branchName).toBe('Northern Avenue');
    expect(view?.myLines[1]).toMatchObject({
      name: 'Lemonade',
      isVoided: true,
      voidReason: 'Spilled',
      lineTotalDram: 0,
    });
    expect(view?.adjustments).toEqual([
      expect.objectContaining({ kind: 'comp', reductionDram: 1000, reason: 'Birthday' }),
    ]);
  });

  it("says the table's own call limit, with its window", async () => {
    const { gateway } = await onTheTab({
      [`POST /api/tabs/${TAB}/service-requests`]: problemReply(
        429,
        'service-request-rate-limited',
        { limit: 5, windowMinutes: 10 },
      ),
    });

    const error = await caught(gateway.callWaiter({ tabId: TAB, reason: 'water', commandId: 'c' }));
    expect(error.name).toBe('ServiceRequestRateLimitedError');
    expect(error['windowMinutes']).toBe(10);
  });
});

describe('the menu', () => {
  it('resolves server-relative photo urls against the api', async () => {
    const { gateway } = gatewayOver({
      [`GET /api/branches/${BRANCH}/menu`]: {
        body: {
          branchId: BRANCH,
          categories: [
            {
              id: 'c1',
              name: 'Grill',
              displayOrder: 1,
              items: [
                {
                  id: 'm1',
                  categoryId: 'c1',
                  name: 'Khorovats',
                  description: 'Pork on the bone',
                  priceAmd: 4500,
                  photo: {
                    photoId: 'p1',
                    thumbnailUrl: '/api/photos/p1/thumbnail',
                    cardUrl: '/api/photos/p1/card',
                    fullUrl: 'https://cdn.example/p1.jpg',
                  },
                  ingredients: 'Pork',
                  allergens: '',
                  portionSize: '300 g',
                  spiceLevel: 0,
                  prepMinutes: 20,
                  isAvailable: true,
                  isComplete: true,
                  displayOrder: 1,
                },
              ],
            },
          ],
        },
      },
    });

    const menu = await gateway.getBranchMenuDetail(BRANCH);
    const photo = menu?.categories[0]?.items[0]?.photo;

    expect(photo?.cardUrl).toBe('https://api.test.yalla.am/api/photos/p1/card');
    // An absolute url is left alone.
    expect(photo?.fullUrl).toBe('https://cdn.example/p1.jpg');
  });
});
