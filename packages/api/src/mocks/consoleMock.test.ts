import { beforeEach, describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import { SlugTakenError, VenueHasOpenTabsError } from '../contracts/errors';
import { createConsoleMockGateway } from './consoleMock';

let n = 0;
const cmd = () => `cmd_${(n += 1)}`;

describe('console mock — scope comes from the role, never from a url', () => {
  it('a platform admin is scoped to every venue', async () => {
    const user = await createConsoleMockGateway({ role: 'platformAdmin' }).getCurrentUser();
    expect(user.scope.venueId).toBeNull();
    expect(user.scope.branchIds).toEqual([]);
  });

  it('an owner is scoped to their venue and all of its branches', async () => {
    const user = await createConsoleMockGateway({ role: 'owner' }).getCurrentUser();
    expect(user.scope.venueId).not.toBeNull();
    expect(user.scope.branchIds.length).toBeGreaterThan(1);
  });

  it('a manager, a waiter and a kitchen account each get exactly one branch', async () => {
    for (const role of ['manager', 'waiter', 'kitchen'] as const) {
      const user = await createConsoleMockGateway({ role }).getCurrentUser();
      expect(user.scope.branchIds).toHaveLength(1);
    }
  });
});

describe('console mock — venues list', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway();
  });

  it('pages rather than returning everything', async () => {
    const page = await gateway.listVenues({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
    expect(page.page).toBe(1);
  });

  it('searches by name', async () => {
    const page = await gateway.listVenues({ search: 'lumen' });
    expect(page.items.map((v) => v.name)).toEqual(['Lumen Coffee']);
  });

  it('lists suspended venues rather than hiding them from the team', async () => {
    const page = await gateway.listVenues({ pageSize: 50 });
    expect(page.items.some((v) => v.status === 'suspended')).toBe(true);
  });

  it('carries the counts the list column shows', async () => {
    const page = await gateway.listVenues({ search: 'lumen' });
    const venue = page.items[0];
    expect(venue?.branchCount).toBe(3);
    expect(venue?.tableCount).toBeGreaterThan(0);
    expect(venue?.subscriptionTier).toBeTruthy();
  });
});

describe('console mock — destructive actions', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway();
  });

  it('suspending is reversible and never removes the row', async () => {
    const suspended = await gateway.suspendVenue({ venueId: 'v-greenbean', commandId: cmd() });
    expect(suspended.status).toBe('suspended');
    expect(suspended.suspendedAtUtc).not.toBeNull();

    const resumed = await gateway.resumeVenue({ venueId: 'v-greenbean', commandId: cmd() });
    expect(resumed.status).toBe('active');
    expect(resumed.suspendedAtUtc).toBeNull();
  });

  it('refuses to delete a venue with an open tab, and says which table', async () => {
    const caught = await gateway
      .deleteVenue({ venueId: 'v-lumen', commandId: cmd() })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(VenueHasOpenTabsError);
    // The payload is the point: "cannot delete" alone is not actionable.
    const blocked = caught as VenueHasOpenTabsError;
    expect(blocked.openTabs.length).toBeGreaterThan(0);
    expect(blocked.openTabs[0]?.branchName).toBeTruthy();
    expect(blocked.openTabs[0]?.tableLabel).toBeTruthy();
  });

  it('deletes a venue with nothing in service, as a soft delete', async () => {
    const deleted = await gateway.deleteVenue({ venueId: 'v-greenbean', commandId: cmd() });
    expect(deleted.status).toBe('deleted');

    const listed = await gateway.listVenues({ pageSize: 50 });
    expect(listed.items.some((v) => v.id === 'v-greenbean')).toBe(false);

    const stillThere = await gateway.listVenues({ pageSize: 50, includeDeleted: true });
    expect(stillThere.items.some((v) => v.id === 'v-greenbean')).toBe(true);
  });
});

describe('console mock — creating a venue', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    n = 0;
    gateway = createConsoleMockGateway();
  });

  it('creates the venue and its first branch in one command', async () => {
    const created = await gateway.createVenue({
      commandId: cmd(),
      name: 'Kond Bakery',
      slug: 'kond-bakery',
      type: 'cafe',
      firstBranch: {
        name: 'Kond',
        slug: 'kond',
        timeZoneId: 'Asia/Yerevan',
        address: '3 Paronyan Street, Yerevan',
        latitude: 40.1826,
        longitude: 44.5035,
      },
    });

    // A venue with no branch has no floor, no menu and no tables — it cannot be
    // onboarded, so it is never created in that state.
    expect(created.branches).toHaveLength(1);
    expect(created.branches[0]?.name).toBe('Kond');
    expect(created.branches[0]?.tableCount).toBe(0);
    expect(created.status).toBe('active');
  });

  it('rejects a slug already in use, naming the field at fault', async () => {
    const caught = await gateway
      .createVenue({
        commandId: cmd(),
        name: 'Lumen Coffee Two',
        slug: 'lumen-coffee',
        type: 'cafe',
        firstBranch: {
          name: 'Somewhere',
          slug: 'somewhere',
          timeZoneId: 'Asia/Yerevan',
          address: '1 Somewhere Street, Yerevan',
          latitude: 40.1792,
          longitude: 44.4991,
        },
      })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(SlugTakenError);
    expect((caught as SlugTakenError).slug).toBe('lumen-coffee');
  });
});

describe('console mock — a sign-in for a manager or owner', () => {
  const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

  it('refuses an email on create without a password, as the server does', async () => {
    /*
     * The real backend answers 400 to this body. The mock used to accept it,
     * which is exactly how a screen forwarding the address on the create call
     * would have passed every test and failed every real hire.
     */
    const { ValidationError } = await import('../errors');
    const caught = await failing(
      createConsoleMockGateway({ role: 'owner' }).createStaff({
        venueId: 'v-lumen',
        staff: {
          fullName: 'Marine Sahakyan',
          phone: '+37477123456',
          role: 'manager',
          pin: '2941',
          branchId: null,
          email: 'marine@lumen.am',
        },
      }),
    );
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as InstanceType<typeof ValidationError>).status).toBe(400);
  });

  it('stores the address lowercased, leaves the password flag alone and returns one link', async () => {
    const gateway = createConsoleMockGateway({ role: 'owner' });
    const link = await gateway.issueStaffSignIn({
      venueId: 'v-lumen',
      staffMemberId: 'b-lumen-north-manager',
      email: '  Nare@Lumen.am ',
    });

    expect(link.email).toBe('nare@lumen.am');
    // The fragment, where the real template puts it and the reset page reads it.
    expect(link.resetLink).toMatch(/^mock:\/\/yalla\/console\/reset-password#token=[a-z0-9]{32}$/u);
    expect(link.replacedExistingSignIn).toBe(false);

    const after = (await gateway.listStaff('v-lumen')).find(
      (member) => member.id === 'b-lumen-north-manager',
    )!;
    expect(after.email).toBe('nare@lumen.am');
    // Awaiting password: the address is theirs now, the password only when
    // they open the link.
    expect(after.hasPasswordSignIn).toBe(false);
  });

  it('reports a replaced sign-in for somebody who already has a password', async () => {
    const gateway = createConsoleMockGateway({ role: 'platformAdmin' });
    const link = await gateway.issueStaffSignIn({
      venueId: 'v-lumen',
      staffMemberId: 'v-lumen-owner',
      email: 'aram@lumen.am',
    });
    expect(link.replacedExistingSignIn).toBe(true);
    const owner = (await gateway.listStaff('v-lumen')).find((m) => m.id === 'v-lumen-owner')!;
    expect(owner.email).toBe('aram@lumen.am');
    expect(owner.hasPasswordSignIn).toBe(true);
  });

  it('refuses yourself and a peer, and lets a platform admin reach an owner', async () => {
    const { StaffPermissionError } = await import('../contracts/errors');
    const owner = createConsoleMockGateway({ role: 'owner' });

    // Self: the seeded owner is who the owner role acts as.
    const self = await failing(
      owner.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'v-lumen-owner',
        email: 'me@lumen.am',
      }),
    );
    expect(self).toBeInstanceOf(StaffPermissionError);
    expect((self as Error).message).toContain('your own');

    // A peer: a manager acting on another manager.
    const manager = createConsoleMockGateway({ role: 'manager' });
    const peer = await failing(
      manager.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-cascade-manager',
        email: 'tigran@lumen.am',
      }),
    );
    expect(peer).toBeInstanceOf(StaffPermissionError);

    const admin = createConsoleMockGateway({ role: 'platformAdmin' });
    await expect(
      admin.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'v-lumen-owner',
        email: 'aram@lumen.am',
      }),
    ).resolves.toBeTruthy();
  });

  it('refuses a PIN-only role, a deactivated person and a taken address with the server sentence', async () => {
    const { ConcurrencyConflictError } = await import('../errors');
    const gateway = createConsoleMockGateway({ role: 'owner' });

    const waiter = await failing(
      gateway.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-north-waiter-1',
        email: 'ani@lumen.am',
      }),
    );
    expect(waiter).toBeInstanceOf(ConcurrencyConflictError);
    expect((waiter as Error).message).toContain('tapping a PIN');

    await gateway.updateStaff({
      venueId: 'v-lumen',
      staffMemberId: 'b-lumen-cascade-manager',
      patch: { isActive: false },
    });
    const inactive = await failing(
      gateway.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-cascade-manager',
        email: 'tigran@lumen.am',
      }),
    );
    expect(inactive).toBeInstanceOf(ConcurrencyConflictError);
    expect((inactive as Error).message).toContain('Reactivate them first');

    // The seeded owner's address, given to a manager.
    const ownerEmail = (await gateway.listStaff('v-lumen')).find((m) => m.role === 'owner')!.email!;
    const taken = await failing(
      gateway.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-north-manager',
        email: ownerEmail,
      }),
    );
    expect(taken).toBeInstanceOf(ConcurrencyConflictError);
    expect((taken as Error).message).toContain('already has an account');
  });

  it('answers a bad address with a 422 naming the field, and an unknown person with 404', async () => {
    const { NotFoundError, ValidationError } = await import('../errors');
    const gateway = createConsoleMockGateway({ role: 'owner' });

    const bad = await failing(
      gateway.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-north-manager',
        email: 'not-an-address',
      }),
    );
    expect(bad).toBeInstanceOf(ValidationError);
    expect((bad as InstanceType<typeof ValidationError>).status).toBe(422);
    expect((bad as InstanceType<typeof ValidationError>).field).toBe('email');

    const missing = await failing(
      gateway.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'nobody',
        email: 'x@lumen.am',
      }),
    );
    expect(missing).toBeInstanceOf(NotFoundError);
  });

  it('never hands the same link back twice', async () => {
    const gateway = createConsoleMockGateway({ role: 'owner' });
    const input = { venueId: 'v-lumen', staffMemberId: 'b-lumen-north-manager', email: 'n@l.am' };
    const first = await gateway.issueStaffSignIn(input);
    const second = await gateway.issueStaffSignIn(input);
    expect(second.resetLink).not.toBe(first.resetLink);
  });
});
