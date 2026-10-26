import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, offSchema, type FakeRoute } from './fakeBackend.testkit';

/**
 * Home and Settings over HTTP (Main and Settings artboards), on the shapes the
 * backend serves (`docs/platform-admin.md` §5, read live on 2026-10-18):
 * `GET /api/platform/overview`, `/outbox`, `/activity`, and `/me` with its
 * rename and password change.
 */

function gatewayOver(routes: Record<string, FakeRoute>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth,
    identity: createMemoryIdentityStore(),
  });
  return { gateway, backend, auth };
}

const days = (counts: number[]) =>
  counts.map((count, index) => ({
    date: `2026-10-${String(index + 1).padStart(2, '0')}`,
    count,
  }));

const OVERVIEW = {
  generatedAtUtc: '2026-10-18T10:32:00Z',
  venues: {
    total: 8,
    paid: 4,
    mixed: 1,
    free: 3,
    active: 6,
    suspended: 1,
    inactive: 1,
    deleted: 1,
    branches: 10,
    paidBranches: 6,
  },
  bookings: {
    last7Days: 312,
    previous7Days: 278,
    changePercent: 12.2,
    labelTimeZoneId: 'Asia/Yerevan',
    perDay: days(Array.from({ length: 30 }, (_, index) => 30 + index)),
  },
  pendingApprovals: { total: 7, venues: [{ venueId: 'v-1', name: 'Cascade Cafe', count: 3 }] },
  openTabs: { total: 41, venues: [{ venueId: 'v-1', name: 'Cascade Cafe', count: 15 }] },
  notReady: {
    total: 1,
    branches: [
      {
        venueId: 'v-2',
        venueName: 'Riverside Restaurant',
        branchId: 'b-2',
        branchName: 'Main',
        issues: [{ code: 'incomplete-dishes', count: 3 }, { code: 'no-photo' }],
      },
    ],
  },
  recentVenues: [
    {
      venueId: 'v-2',
      name: 'Riverside Restaurant',
      slug: 'riverside-restaurant',
      type: 2,
      status: 1,
      tierMix: 3,
      branchCount: 1,
      paidBranchCount: 1,
      createdAtUtc: '2026-10-16T11:30:00Z',
    },
  ],
  outbox: {
    pending: 0,
    due: 0,
    failed: 0,
    deadLettered: 2,
    sentLastDay: 118,
    deadLetteredLastDay: 2,
  },
};

describe('Home over HTTP', () => {
  it('reads the overview in one call and maps it onto the console contract', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/platform/overview': { body: OVERVIEW },
    });
    const overview = await gateway.getPlatformOverview();
    expect(backend.requests[0]?.path).toBe('/api/platform/overview');
    expect(overview.venues).toEqual(OVERVIEW.venues);
    expect(overview.bookings).toMatchObject({
      last7Days: 312,
      previous7Days: 278,
      changePercent: 12.2,
      labelTimeZoneId: 'Asia/Yerevan',
    });
    expect(overview.bookings.perDay).toHaveLength(30);
    expect(overview.pendingApprovals.venues[0]).toEqual({
      venueId: 'v-1',
      name: 'Cascade Cafe',
      count: 3,
    });
    expect(overview.notReady.branches[0]?.issues).toEqual([
      { kind: 'incompleteDishes', count: 3, branchName: null },
      { kind: 'noPhoto', count: null, branchName: null },
    ]);
    expect(overview.recentVenues[0]).toEqual({
      id: 'v-2',
      name: 'Riverside Restaurant',
      slug: 'riverside-restaurant',
      type: 'restaurant',
      status: 'active',
      tierMix: 'paid',
      branchCount: 1,
      paidBranchCount: 1,
      createdAtUtc: '2026-10-16T11:30:00Z',
    });
    expect(overview.outbox.deadLetteredLastDay).toBe(2);
  });

  it('reads no change, rather than an infinite one, when last week had no bookings', async () => {
    const { changePercent: _left, ...bookings } = OVERVIEW.bookings;
    const { gateway } = gatewayOver({
      'GET /api/platform/overview': {
        body: { ...OVERVIEW, bookings: { ...bookings, previous7Days: 0 } },
      },
    });
    expect((await gateway.getPlatformOverview()).bookings.changePercent).toBeNull();
  });

  it("reads the outbox's dead letters for Home's details, and asks for a few", async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/platform/outbox': {
        body: {
          pending: 0,
          due: 0,
          failed: 0,
          deadLettered: 1,
          sentLastDay: 40,
          deadLetteredLastDay: 1,
          deadLetters: [
            {
              id: 'm-1',
              type: 'reservation.reminder',
              idempotencyKey: 'reservation:r-1:reminder',
              lastError: 'Telegram did not answer.',
              attemptCount: 3,
              scheduledForUtc: '2026-10-18T09:00:00Z',
              deadLetteredAtUtc: '2026-10-18T09:05:00Z',
            },
          ],
        },
      },
    });
    const health = await gateway.getOutboxHealth();
    expect(backend.requests[0]?.query.get('deadLetterLimit')).toBe('20');
    expect(health.deadLetters).toEqual([
      {
        id: 'm-1',
        type: 'reservation.reminder',
        lastError: 'Telegram did not answer.',
        attemptCount: 3,
        scheduledForUtc: '2026-10-18T09:00:00Z',
        deadLetteredAtUtc: '2026-10-18T09:05:00Z',
      },
    ]);
  });

  it('reads the activity feed with who, what, which venue, and the tier or role it names', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/platform/activity': {
        body: {
          items: [
            {
              id: 'a-1',
              atUtc: '2026-10-18T08:10:00Z',
              action: 'branch.tier-change',
              actor: { staffMemberId: 's-1', role: 5, displayName: 'Grigor Avagyan' },
              target: { type: 'Branch', id: 'b-1', displayName: 'Kaskad' },
              venue: { venueId: 'v-1', name: 'Luna Cafe' },
              detail: { venueId: 'v-1', from: 1, to: 2 },
            },
            {
              id: 'a-2',
              atUtc: '2026-10-17T11:02:00Z',
              action: 'staff.create',
              actor: { staffMemberId: 's-2', role: 1, displayName: 'Aram Hakobyan' },
              target: { type: 'StaffMember', id: 's-3', displayName: 'Mariam Avetisyan' },
              venue: { venueId: 'v-2', name: 'Cascade Cafe' },
              detail: { role: 2, branchId: 'b-2', canSignIn: true },
            },
            {
              id: 'a-3',
              atUtc: '2026-10-16T10:00:00Z',
              action: 'admin.rename',
              actor: { staffMemberId: 's-1', role: 5, displayName: 'Grigor' },
              target: { type: 'StaffMember', id: 's-1', displayName: 'Grigor' },
              detail: { before: 'Grigor', after: 'Grigor Avagyan' },
            },
          ],
        },
      },
    });
    const feed = await gateway.listPlatformActivity({ limit: 5, venueId: 'v-1' });
    expect(backend.requests[0]?.query.get('limit')).toBe('5');
    expect(backend.requests[0]?.query.get('venueId')).toBe('v-1');
    expect(feed[0]).toEqual({
      id: 'a-1',
      atUtc: '2026-10-18T08:10:00Z',
      action: 'branch.tier-change',
      actor: { id: 's-1', role: 'platformAdmin', name: 'Grigor Avagyan' },
      target: { type: 'Branch', id: 'b-1', name: 'Kaskad' },
      venue: { id: 'v-1', name: 'Luna Cafe' },
      tierTo: 'paid',
      staffRole: null,
    });
    expect(feed[1]).toMatchObject({
      actor: { role: 'owner', name: 'Aram Hakobyan' },
      staffRole: 'manager',
      tierTo: null,
    });
    // The admin's own account concerns no venue.
    expect(feed[2]?.venue).toBeNull();
  });
});

describe('Settings over HTTP', () => {
  const PROFILE = {
    staffMemberId: 's-1',
    fullName: 'Grigor Avagyan',
    email: 'grigor@yalla.am',
  };

  it('reads the admin and renames them with the name alone', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/platform/me': { body: PROFILE },
      'PATCH /api/platform/me': { body: { ...PROFILE, fullName: 'Grigor A.' } },
    });
    expect(await gateway.getPlatformProfile()).toEqual(PROFILE);
    const renamed = await gateway.updatePlatformProfile({ fullName: 'Grigor A.' });
    expect(renamed.fullName).toBe('Grigor A.');
    expect(backend.requests[1]?.method).toBe('PATCH');
    expect(backend.requests[1]?.body).toEqual({ fullName: 'Grigor A.' });
  });

  it('adopts the fresh pair a password change answers with, so this tab stays signed in', async () => {
    const { gateway, auth } = gatewayOver({
      'POST /api/platform/me/password': {
        body: {
          accessToken: 'access-after',
          refreshToken: 'refresh-after',
          expiresInSeconds: 900,
        },
      },
    });
    const answer = await gateway.changePlatformPassword({
      currentPassword: 'old-password-0000',
      newPassword: 'new-password-0000',
    });
    expect(answer).toEqual({ sessionRenewed: true });
    expect(auth.peekAccessToken()).toBe('access-after');
  });

  it('changes the password with both fields, and takes a 204', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/platform/me/password': offSchema(
        { status: 204 },
        'the gateway still tolerates a bodiless answer; swagger declares only 200 with a fresh pair — reported as a dead branch, not changed',
      ),
    });
    // No pair: nothing renewed, and nothing claimed about other devices.
    await expect(
      gateway.changePlatformPassword({
        currentPassword: 'old-password-0000',
        newPassword: 'new-password-0000',
      }),
    ).resolves.toEqual({ sessionRenewed: false });
    expect(backend.requests[0]?.body).toEqual({
      currentPassword: 'old-password-0000',
      newPassword: 'new-password-0000',
    });
  });

  it('answers a wrong current password as a form error naming the field, not a sign-out', async () => {
    const { gateway } = gatewayOver({
      'POST /api/platform/me/password': {
        status: 422,
        body: {
          type: 'about:blank',
          title: 'Validation failed',
          status: 422,
          detail: 'The current password is wrong.',
          code: 'validation-failed',
          traceId: 't-1',
          context: {
            fields: [
              {
                field: 'currentPassword',
                message: 'The current password is wrong.',
                bound: 'conflict',
              },
              { field: 'newPassword', message: 'Too short.', bound: 'min', min: 12 },
            ],
          },
        },
      },
    });
    const error = await gateway
      .changePlatformPassword({ currentPassword: 'nope', newPassword: 'short' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).violations).toEqual([
      { field: 'currentPassword', message: 'The current password is wrong.', bound: 'conflict' },
      { field: 'newPassword', message: 'Too short.', bound: 'min', min: 12 },
    ]);
  });
});
