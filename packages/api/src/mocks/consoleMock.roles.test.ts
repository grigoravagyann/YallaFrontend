import { describe, expect, it } from 'vitest';
import { StaffPermissionError } from '../contracts/errors';
import { ForbiddenError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * The general manager and the branch manager, as the mock must answer them —
 * exactly what the server answers: `ManagedVenueQuery`, `BranchScoped` and
 * `IStaffBranchGuard` for scope, `StaffManagementService.RequireReach` for
 * which people a branch manager may touch, and `StaffMember`'s invariants for
 * the branch each role is bound to.
 */

/** Lumen's three branches, all active, in name order. */
const LUMEN_BRANCHES_BY_NAME = ['b-lumen-cascade', 'b-lumen-north', 'b-lumen-saryan'];
const NEEDS_BRANCH = 'A branch manager works at one branch. Choose it.';
const NO_BRANCH = 'A general manager runs every branch, so leave the branch empty.';

const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

const person = (over: Record<string, unknown> = {}) => ({
  fullName: 'Marine Sahakyan',
  phone: '+37477555555',
  pin: '4821',
  role: 'waiter' as const,
  branchId: 'b-lumen-north' as string | null,
  ...over,
});

describe('console mock — a general manager runs every branch', () => {
  it('signs in as the stored general manager, with the venue and no branch claim', async () => {
    const user = await createConsoleMockGateway({ role: 'generalManager' }).getCurrentUser();
    expect(user.role).toBe('generalManager');
    expect(user.id).toBe('v-lumen-general-manager');
    expect(user.scope).toEqual({ venueId: 'v-lumen', branchIds: [] });
  });

  it('is given every branch by the managed-venue read, like an owner', async () => {
    const venue = await createConsoleMockGateway({ role: 'generalManager' }).getManagedVenue(
      'v-lumen',
    );
    expect(venue.branches.map((branch) => branch.id)).toEqual(LUMEN_BRANCHES_BY_NAME);
  });

  it('reads and decides at any branch of the venue, and at none outside it', async () => {
    const gm = createConsoleMockGateway({ role: 'generalManager' });
    await expect(gm.getFloorPlan('b-lumen-cascade')).resolves.toBeTruthy();
    await expect(gm.listDevices('b-lumen-saryan')).resolves.toBeTruthy();
    const [pending] = await gm.listPendingReservations('b-lumen-cascade');
    await expect(gm.approveReservation({ reservationId: pending!.id })).resolves.toBeTruthy();

    expect(await failing(gm.getFloorPlan('b-tumanyan-main'))).toBeInstanceOf(ForbiddenError);
  });

  it('may roll the reports up across the venue, which a branch manager may not', async () => {
    const range = { from: '2026-09-01', to: '2026-09-07', rollUpVenue: true };
    await expect(
      createConsoleMockGateway({ role: 'generalManager' }).getRevenueReport({
        branchId: 'b-lumen-north',
        ...range,
      }),
    ).resolves.toBeTruthy();

    const refused = await failing(
      createConsoleMockGateway({ role: 'manager' }).getRevenueReport({
        branchId: 'b-lumen-north',
        ...range,
      }),
    );
    expect(refused).toBeInstanceOf(ForbiddenError);
    expect((refused as Error).message).toBe(
      "Reporting across a venue's branches requires the GeneralManager role; the caller is a Manager.",
    );
  });
});

describe('console mock — a branch manager runs their own branch', () => {
  it('is given their own branch and refused every other one', async () => {
    const bm = createConsoleMockGateway({ role: 'manager' });
    const venue = await bm.getManagedVenue('v-lumen');
    expect(venue.branches.map((branch) => branch.id)).toEqual(['b-lumen-north']);
    expect(await failing(bm.getFloorPlan('b-lumen-cascade'))).toBeInstanceOf(ForbiddenError);
    expect(await failing(bm.listPendingReservations('b-lumen-saryan'))).toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("lists their own branch's people and nobody else's", async () => {
    // `ListAsync` narrows a branch manager to `BranchId == acting.BranchId`:
    // the same reach they have to change them. Venue-wide rows are not theirs.
    const people = await createConsoleMockGateway({ role: 'manager' }).listStaff('v-lumen');
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((member) => member.branchId === 'b-lumen-north')).toBe(true);
  });

  it('adds people at their own branch only', async () => {
    const bm = createConsoleMockGateway({ role: 'manager' });
    await expect(bm.createStaff({ venueId: 'v-lumen', staff: person() })).resolves.toMatchObject({
      branchId: 'b-lumen-north',
    });

    for (const branchId of ['b-lumen-cascade', null]) {
      const refused = await failing(
        bm.createStaff({ venueId: 'v-lumen', staff: person({ branchId, pin: '7310' }) }),
      );
      expect(refused, String(branchId)).toBeInstanceOf(StaffPermissionError);
      expect((refused as Error).message).toBe(
        'Creating a Waiter at another branch requires the GeneralManager role; the caller is a Manager.',
      );
    }
  });

  it("edits and re-PINs their own branch's people and refuses a sibling branch's", async () => {
    const bm = createConsoleMockGateway({ role: 'manager' });
    await expect(
      bm.updateStaff({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-north-kitchen',
        patch: { phone: '+37477000001' },
      }),
    ).resolves.toBeTruthy();

    const edit = await failing(
      bm.updateStaff({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-cascade-kitchen',
        patch: { phone: '+37477000001' },
      }),
    );
    expect(edit).toBeInstanceOf(StaffPermissionError);
    expect((edit as Error).message).toBe(
      'Editing a Kitchen at another branch requires the GeneralManager role; the caller is a Manager.',
    );

    const pin = await failing(
      bm.setStaffPin({ venueId: 'v-lumen', staffMemberId: 'b-lumen-cascade-kitchen', pin: '9182' }),
    );
    expect(pin).toBeInstanceOf(StaffPermissionError);
    expect((pin as Error).message).toBe(
      "Resetting a Kitchen's PIN at another branch requires the GeneralManager role; the caller is a Manager.",
    );

    // Moving one of their own people away is refused too: the new branch is
    // somewhere they do not reach.
    const move = await failing(
      bm.updateStaff({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-north-kitchen',
        patch: { setBranch: true, branchId: 'b-lumen-cascade' },
      }),
    );
    expect(move).toBeInstanceOf(StaffPermissionError);
    expect((move as Error).message).toBe(
      'Moving a Kitchen to another branch requires the GeneralManager role; the caller is a Manager.',
    );
  });
});

describe('console mock — who a general manager adds', () => {
  it('adds branch managers and floor staff at any branch, never an owner or a peer', async () => {
    const gm = createConsoleMockGateway({ role: 'generalManager' });
    await expect(
      gm.createStaff({
        venueId: 'v-lumen',
        staff: person({ role: 'manager', branchId: 'b-lumen-cascade' }),
      }),
    ).resolves.toMatchObject({ role: 'manager', branchId: 'b-lumen-cascade' });
    await expect(
      gm.createStaff({
        venueId: 'v-lumen',
        staff: person({ role: 'kitchen', branchId: 'b-lumen-saryan', pin: '1907' }),
      }),
    ).resolves.toMatchObject({ role: 'kitchen' });

    for (const role of ['owner', 'generalManager'] as const) {
      const refused = await failing(
        gm.createStaff({ venueId: 'v-lumen', staff: person({ role, branchId: null }) }),
      );
      expect(refused, role).toBeInstanceOf(StaffPermissionError);
    }
  });
});

describe('console mock — the branch a role is bound to', () => {
  const expectBranchRefusal = (error: unknown, sentence: string, bound: string) => {
    expect(error).toBeInstanceOf(ValidationError);
    const refusal = error as ValidationError;
    expect(refusal.status).toBe(422);
    expect(refusal.code).toBe('validation-failed');
    expect(refusal.field).toBe('branchId');
    expect(refusal.message).toBe(sentence);
    expect(refusal.violations).toEqual([{ field: 'branchId', message: sentence, bound }]);
  };

  it('refuses a branch manager with no branch, and a general manager with one', async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    expectBranchRefusal(
      await failing(
        owner.createStaff({
          venueId: 'v-lumen',
          staff: person({ role: 'manager', branchId: null }),
        }),
      ),
      NEEDS_BRANCH,
      'required',
    );
    expectBranchRefusal(
      await failing(
        owner.createStaff({
          venueId: 'v-lumen',
          staff: person({ role: 'generalManager', branchId: 'b-lumen-north' }),
        }),
      ),
      NO_BRANCH,
      'conflict',
    );
    // Nothing was written for either refusal.
    const people = await owner.listStaff('v-lumen');
    expect(people.some((member) => member.fullName === 'Marine Sahakyan')).toBe(false);
  });

  it('checks the role and the branch as a pair on an edit', async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    // Promoting a branch manager to general manager clears the branch in the
    // same request; without it the pair is a row that must not exist.
    expectBranchRefusal(
      await failing(
        owner.updateStaff({
          venueId: 'v-lumen',
          staffMemberId: 'b-lumen-cascade-manager',
          patch: { role: 'generalManager' },
        }),
      ),
      NO_BRANCH,
      'conflict',
    );
    const promoted = await owner.updateStaff({
      venueId: 'v-lumen',
      staffMemberId: 'b-lumen-cascade-manager',
      patch: { role: 'generalManager', setBranch: true, branchId: null },
    });
    expect(promoted).toMatchObject({ role: 'generalManager', branchId: null });

    expectBranchRefusal(
      await failing(
        owner.updateStaff({
          venueId: 'v-lumen',
          staffMemberId: 'b-lumen-cascade-manager',
          patch: { role: 'manager' },
        }),
      ),
      NEEDS_BRANCH,
      'required',
    );
    await expect(
      owner.updateStaff({
        venueId: 'v-lumen',
        staffMemberId: 'b-lumen-cascade-manager',
        patch: { role: 'manager', setBranch: true, branchId: 'b-lumen-saryan' },
      }),
    ).resolves.toMatchObject({ role: 'manager', branchId: 'b-lumen-saryan' });
  });
});
