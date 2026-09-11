import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import { SlugTakenError, VenueHasOpenTabsError } from '../contracts/errors';
import { createConsoleMockGateway } from './consoleMock';

let n = 0;
const cmd = () => `cmd_${(n += 1)}`;

/** Lumen's three branches, all active, in name order. */
const LUMEN_BRANCHES_BY_NAME = ['b-lumen-cascade', 'b-lumen-north', 'b-lumen-saryan'];

describe('console mock — scope comes from the role, never from a url', () => {
  it('a platform admin is scoped to every venue', async () => {
    const user = await createConsoleMockGateway({ role: 'platformAdmin' }).getCurrentUser();
    expect(user.scope.venueId).toBeNull();
    expect(user.scope.branchIds).toEqual([]);
  });

  it('an owner is scoped to their venue and carries no branch claim', async () => {
    // A real owner token has `venueId` and no `branchId` (live probe,
    // 2026-09-10). Their branches come from `getManagedVenue`, never from here.
    const user = await createConsoleMockGateway({ role: 'owner' }).getCurrentUser();
    expect(user.scope.venueId).not.toBeNull();
    expect(user.scope.branchIds).toEqual([]);
  });

  it('a manager, a waiter and a kitchen account each carry their home branch', async () => {
    for (const role of ['manager', 'waiter', 'kitchen'] as const) {
      const user = await createConsoleMockGateway({ role }).getCurrentUser();
      expect(user.scope.branchIds).toHaveLength(1);
    }
  });

  it('a manager created with no branch carries the venue and no branch claim', async () => {
    const user = await createConsoleMockGateway({
      role: 'manager',
      managerBranch: 'none',
    }).getCurrentUser();
    expect(user.scope.venueId).toBe('v-lumen');
    expect(user.scope.branchIds).toEqual([]);
  });
});

describe('console mock — the venue reads refuse what the server refuses', () => {
  const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

  it('answers the platform venue read to the platform admin only', async () => {
    // `GET /api/platform/venues/{id}` is PlatformAdminOnly: 403 to every
    // venue user, which is the read the console used to learn its branches from.
    const { ForbiddenError } = await import('../errors');
    await expect(
      createConsoleMockGateway({ role: 'platformAdmin' }).getVenue('v-lumen'),
    ).resolves.toMatchObject({ id: 'v-lumen' });
    for (const role of ['owner', 'manager', 'waiter', 'kitchen'] as const) {
      const caught = await failing(createConsoleMockGateway({ role }).getVenue('v-lumen'));
      expect(caught, role).toBeInstanceOf(ForbiddenError);
    }
  });

  it('gives an owner every branch of their venue, by name', async () => {
    // The server's order is active first, then by name; the fixture has no
    // inactive branch, so what can be proved here is the second half.
    const venue = await createConsoleMockGateway({ role: 'owner' }).getManagedVenue('v-lumen');
    expect(venue.id).toBe('v-lumen');
    expect(venue.name).toBe('Lumen Coffee');
    expect(venue.branches.map((branch) => branch.id)).toEqual(LUMEN_BRANCHES_BY_NAME);
    expect(venue.branches.every((branch) => branch.isActive)).toBe(true);
    expect(venue.branches[0]?.timeZoneId).toBe('Asia/Yerevan');
  });

  it('gives a manager with a home branch that branch only', async () => {
    const venue = await createConsoleMockGateway({ role: 'manager' }).getManagedVenue('v-lumen');
    expect(venue.branches.map((branch) => branch.id)).toEqual(['b-lumen-north']);
  });

  it('gives a manager with no branch every branch, like an owner', async () => {
    const venue = await createConsoleMockGateway({
      role: 'manager',
      managerBranch: 'none',
    }).getManagedVenue('v-lumen');
    expect(venue.branches.map((branch) => branch.id)).toEqual(LUMEN_BRANCHES_BY_NAME);
  });

  it('gives the platform admin every branch, and 404 for a venue that does not exist', async () => {
    const { NotFoundError } = await import('../errors');
    const admin = createConsoleMockGateway({ role: 'platformAdmin' });
    const venue = await admin.getManagedVenue('v-lumen');
    expect(venue.branches.map((branch) => branch.id)).toEqual(LUMEN_BRANCHES_BY_NAME);
    expect(await failing(admin.getManagedVenue('v-nowhere'))).toBeInstanceOf(NotFoundError);
  });

  it('refuses a waiter, a kitchen account and another venue with 403', async () => {
    const { ForbiddenError } = await import('../errors');
    for (const role of ['waiter', 'kitchen'] as const) {
      const caught = await failing(createConsoleMockGateway({ role }).getManagedVenue('v-lumen'));
      expect(caught, role).toBeInstanceOf(ForbiddenError);
    }
    // VenueScoped: a venue user asking about a venue that is not theirs, real
    // or not, is told 403 either way — there is nothing to learn from a 404.
    const owner = createConsoleMockGateway({ role: 'owner' });
    expect(await failing(owner.getManagedVenue('v-tumanyan'))).toBeInstanceOf(ForbiddenError);
    expect(await failing(owner.getManagedVenue('v-nowhere'))).toBeInstanceOf(ForbiddenError);
  });

  it('refuses a branch read outside the signed-in venue, and answers one inside it', async () => {
    // The server's rule (`BranchScoped`, `StaffBranchGuard`): the branch must
    // belong to the token's venue. A manager with a home branch is not confined
    // to it on the server, so a sibling branch answers.
    const { ForbiddenError } = await import('../errors');
    const manager = createConsoleMockGateway({ role: 'manager' });
    await expect(manager.getFloorPlan('b-lumen-cascade')).resolves.toBeTruthy();
    await expect(manager.getAdminMenu('b-lumen-cascade')).resolves.toBeTruthy();

    const reads = [
      manager.getFloorPlan('b-tumanyan-main'),
      manager.getAdminMenu('b-tumanyan-main'),
      manager.getOpeningHours('b-tumanyan-main'),
      manager.getReservationPolicy('b-tumanyan-main'),
      manager.listDevices('b-tumanyan-main'),
      manager.listStaff('v-tumanyan'),
      // The reports too: `ReportQuery` names a branch, and the server's guard
      // is the same one.
      manager.getOccupancyReport({
        branchId: 'b-tumanyan-main',
        from: '2026-09-01',
        to: '2026-09-07',
      }),
      manager.getRevenueReport({
        branchId: 'b-tumanyan-main',
        from: '2026-09-01',
        to: '2026-09-07',
      }),
    ];
    for (const read of reads) {
      expect(await failing(read)).toBeInstanceOf(ForbiddenError);
    }

    // The platform admin belongs to no venue and reaches every branch.
    const admin = createConsoleMockGateway({ role: 'platformAdmin' });
    await expect(admin.getFloorPlan('b-tumanyan-main')).resolves.toBeTruthy();
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

describe('console mock — the sign-in route refuses what the server refuses', () => {
  const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

  it('refuses an address that belongs to somebody in another venue', async () => {
    /*
     * The server's uniqueness is a filtered unique index over the whole
     * StaffMembers table, not one list per venue. A mock that only looked at
     * the target's own venue accepted the very address the server answers 409
     * to, and every screen test with a cross-venue duplicate passed on it.
     */
    const { ConcurrencyConflictError } = await import('../errors');
    const gateway = createConsoleMockGateway({ role: 'platformAdmin' });
    const lumenOwner = (await gateway.listStaff('v-lumen')).find((m) => m.role === 'owner')!.email!;

    const taken = await failing(
      gateway.issueStaffSignIn({
        venueId: 'v-tumanyan',
        staffMemberId: 'b-tumanyan-main-manager',
        email: lumenOwner,
      }),
    );
    expect(taken).toBeInstanceOf(ConcurrencyConflictError);
    expect((taken as Error).message).toContain('already has an account');

    // The same index catches a credentialed create, whatever the case typed.
    const created = await failing(
      gateway.createStaff({
        venueId: 'v-tumanyan',
        staff: {
          fullName: 'Hasmik Sargsyan',
          phone: '+37477999999',
          role: 'manager',
          pin: '7315',
          branchId: 'b-tumanyan-main',
          email: lumenOwner.toUpperCase(),
          password: 'correct horse battery',
        },
      }),
    );
    expect(created).toBeInstanceOf(ConcurrencyConflictError);
  });

  it('refuses an address over 320 characters with a 422 naming the field', async () => {
    // `[StringLength(FieldLengths.Email)]` on the request, and 320 is that constant.
    const { ValidationError } = await import('../errors');
    const gateway = createConsoleMockGateway({ role: 'owner' });
    const bad = await failing(
      gateway.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-north-manager',
        email: `${'a'.repeat(321)}@lumen.am`,
      }),
    );
    expect(bad).toBeInstanceOf(ValidationError);
    expect((bad as InstanceType<typeof ValidationError>).status).toBe(422);
    expect((bad as InstanceType<typeof ValidationError>).field).toBe('email');
  });

  it('refuses a password without an email on create, and an empty address, as it refuses the reverse', async () => {
    /*
     * The server's rule is symmetric: either both or neither. Password alone
     * used to slip through and produce a person with `hasPasswordSignIn` and
     * no address, a state `HasPasswordCredentials` can never report; and `''`
     * is `is not null` on the server but falsy here.
     */
    const { ValidationError } = await import('../errors');
    const gateway = createConsoleMockGateway({ role: 'owner' });
    const person = {
      fullName: 'Marine Sahakyan',
      phone: '+37477123456',
      role: 'manager' as const,
      pin: '2941',
      branchId: null,
    };

    const passwordOnly = await failing(
      gateway.createStaff({ venueId: 'v-lumen', staff: { ...person, password: 'correct horse' } }),
    );
    expect(passwordOnly).toBeInstanceOf(ValidationError);
    expect((passwordOnly as InstanceType<typeof ValidationError>).status).toBe(400);

    const emptyAddress = await failing(
      gateway.createStaff({ venueId: 'v-lumen', staff: { ...person, email: '' } }),
    );
    expect(emptyAddress).toBeInstanceOf(ValidationError);
    expect((emptyAddress as InstanceType<typeof ValidationError>).status).toBe(400);
  });

  it('refuses credentials for a waiter on create with the PIN sentence', async () => {
    const { ConcurrencyConflictError } = await import('../errors');
    const gateway = createConsoleMockGateway({ role: 'owner' });
    const waiter = await failing(
      gateway.createStaff({
        venueId: 'v-lumen',
        staff: {
          fullName: 'Ani Hakobyan',
          phone: '+37477123456',
          role: 'waiter',
          pin: '2941',
          branchId: 'b-lumen-north',
          email: 'ani@lumen.am',
          password: 'correct horse battery',
        },
      }),
    );
    expect(waiter).toBeInstanceOf(ConcurrencyConflictError);
    expect((waiter as Error).message).toContain('tapping a PIN');
  });

  it('answers a bad address with 422 before looking the person up or at their role', async () => {
    /*
     * DataAnnotations run in the endpoint filter, before the handler: a bad
     * address is a 422 whatever the target is, and the backend's own test
     * pins that. The mock used to answer 404 for an unknown id and 409 for a
     * waiter first.
     */
    const { ValidationError } = await import('../errors');
    const gateway = createConsoleMockGateway({ role: 'owner' });

    const nobody = await failing(
      gateway.issueStaffSignIn({ venueId: 'v-lumen', staffMemberId: 'nobody', email: 'nope' }),
    );
    expect(nobody).toBeInstanceOf(ValidationError);
    expect((nobody as InstanceType<typeof ValidationError>).status).toBe(422);

    const waiter = await failing(
      gateway.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-north-waiter-1',
        email: 'nope',
      }),
    );
    expect(waiter).toBeInstanceOf(ValidationError);
    expect((waiter as InstanceType<typeof ValidationError>).status).toBe(422);
  });

  it('lowercases the address the way the server does, not the way the host locale does', async () => {
    /*
     * The server uses ToLowerInvariant. In a Turkish-locale process
     * `'I'.toLocaleLowerCase()` is dotless ı, so a mock that used the locale
     * stored an address the server never would. Emulated rather than assumed,
     * because the test runner's own locale is not Turkish.
     */
    const turkish = vi.spyOn(String.prototype, 'toLocaleLowerCase').mockImplementation(function (
      this: string,
    ) {
      return this.replaceAll('I', 'ı').toLowerCase();
    });
    try {
      const gateway = createConsoleMockGateway({ role: 'owner' });
      const link = await gateway.issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-north-manager',
        email: 'Irina@Lumen.am',
      });
      expect(link.email).toBe('irina@lumen.am');
    } finally {
      turkish.mockRestore();
    }
  });

  it('names roles in its 403 sentences the way the server does', async () => {
    // `StaffPermissionException` renders the `StaffRole` enum: PascalCase.
    const { StaffPermissionError } = await import('../contracts/errors');

    const self = await failing(
      createConsoleMockGateway({ role: 'owner' }).issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'v-lumen-owner',
        email: 'me@lumen.am',
      }),
    );
    expect(self).toBeInstanceOf(StaffPermissionError);
    expect((self as Error).message).toBe(
      'Issuing your own sign-in requires the PlatformAdmin role; the caller is a Owner.',
    );

    const peer = await failing(
      createConsoleMockGateway({ role: 'manager' }).issueStaffSignIn({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-cascade-manager',
        email: 'tigran@lumen.am',
      }),
    );
    expect((peer as Error).message).toBe(
      'Issuing a sign-in for a Manager requires the PlatformAdmin role; the caller is a Manager.',
    );
  });
});

/**
 * Deciding a pending booking: the mock refuses what the server refuses.
 *
 * `ReservationService.RequireManagerForBranchAsync`: a manager or owner with
 * a home branch may decide only at that branch; one with no branch anywhere
 * in their venue; a platform admin anywhere at all. And the domain's rule:
 * only a pending booking can be confirmed or rejected, and the 409 names the
 * code and the state it is in.
 */
describe('console mock — deciding a pending booking', () => {
  const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

  it('lists pending bookings for a branch, and none for one with nothing waiting', async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    const pending = await owner.listPendingReservations('b-lumen-north');
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((booking) => booking.status === 'pendingApproval')).toBe(true);
    expect(await owner.listPendingReservations('b-lumen-saryan')).toEqual([]);
  });

  it('lets an owner approve, and the booking leaves the pending list confirmed', async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    const [first] = await owner.listPendingReservations('b-lumen-north');

    const decided = await owner.approveReservation({ reservationId: first!.id });
    expect(decided.status).toBe('confirmed');

    const after = await owner.listPendingReservations('b-lumen-north');
    expect(after.map((booking) => booking.id)).not.toContain(first!.id);
  });

  it('rejects with the reason recorded, and the booking becomes cancelled by the venue', async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    const [first] = await owner.listPendingReservations('b-lumen-north');

    const decided = await owner.rejectReservation({
      reservationId: first!.id,
      reason: 'Private event that evening',
    });
    expect(decided.status).toBe('cancelledByVenue');
    expect((await owner.listPendingReservations('b-lumen-north')).map((b) => b.id)).not.toContain(
      first!.id,
    );
  });

  it('refuses a manager with a home branch at a sibling branch, with the server sentence', async () => {
    const { ForbiddenError } = await import('../errors');
    const manager = createConsoleMockGateway({ role: 'manager' });
    const [elsewhere] = await manager.listPendingReservations('b-lumen-cascade');

    const caught = await failing(manager.approveReservation({ reservationId: elsewhere!.id }));
    expect(caught).toBeInstanceOf(ForbiddenError);
    expect((caught as Error).message).toBe(
      'Approve a booking requires the Manager role; the caller is a Manager.',
    );

    const rejected = await failing(manager.rejectReservation({ reservationId: elsewhere!.id }));
    expect(rejected).toBeInstanceOf(ForbiddenError);
    expect((rejected as Error).message).toBe(
      'Reject a booking requires the Manager role; the caller is a Manager.',
    );

    // Their own branch answers.
    const [home] = await manager.listPendingReservations('b-lumen-north');
    await expect(manager.approveReservation({ reservationId: home!.id })).resolves.toBeTruthy();
  });

  it('lets a manager with no branch decide anywhere in the venue, and nowhere outside it', async () => {
    const { ForbiddenError, NotFoundError } = await import('../errors');
    const floating = createConsoleMockGateway({ role: 'manager', managerBranch: 'none' });
    const [cascade] = await floating.listPendingReservations('b-lumen-cascade');
    await expect(floating.approveReservation({ reservationId: cascade!.id })).resolves.toBeTruthy();

    expect(await failing(floating.listPendingReservations('b-tumanyan-main'))).toBeInstanceOf(
      ForbiddenError,
    );
    // A booking id nobody can see is 404, as on the server: the read happens
    // before the branch check.
    expect(
      await failing(floating.approveReservation({ reservationId: 'r-nowhere' })),
    ).toBeInstanceOf(NotFoundError);
  });

  it('refuses a waiter outright', async () => {
    const { ForbiddenError } = await import('../errors');
    const waiter = createConsoleMockGateway({ role: 'waiter' });
    expect(
      await failing(waiter.approveReservation({ reservationId: 'r-lumen-north-1' })),
    ).toBeInstanceOf(ForbiddenError);
  });

  it('refuses to decide a booking twice, naming the code and the state', async () => {
    const { ConcurrencyConflictError } = await import('../errors');
    const owner = createConsoleMockGateway({ role: 'owner' });
    const [first] = await owner.listPendingReservations('b-lumen-north');
    await owner.approveReservation({ reservationId: first!.id });

    const again = await failing(owner.approveReservation({ reservationId: first!.id }));
    expect(again).toBeInstanceOf(ConcurrencyConflictError);
    expect((again as Error).message).toBe(
      `Only a pending reservation can be confirmed; ${first!.code} is Confirmed.`,
    );

    const reject = await failing(owner.rejectReservation({ reservationId: first!.id }));
    expect(reject).toBeInstanceOf(ConcurrencyConflictError);
    expect((reject as Error).message).toBe(
      `Only a pending reservation can be rejected; ${first!.code} is Confirmed.`,
    );
  });
});
