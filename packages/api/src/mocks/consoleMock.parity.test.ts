import { describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import type { ReplaceFloorPlanCommand } from '../contracts/floorPlan';
import { CategoryInUseError, FloorPlanInvalidError } from '../contracts/errors';
import { ConcurrencyConflictError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * QA sweep 2026-10-16 (`.gstack/qa-reports/run-20261016T1/mock-parity.md`):
 * the console mock must refuse what the server refuses, in the server's
 * order, with the server's sentence — and must not invent state the server
 * never seeds.
 */

let n = 0;
const cmd = () => `cmd_${(n += 1)}`;

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

async function newVenue(gateway: ConsoleGateway, slug = 'kond-bakery') {
  return gateway.createVenue({
    commandId: cmd(),
    name: 'Kond Bakery',
    slug,
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
}

async function planCommand(
  gateway: ConsoleGateway,
  branchId: string,
): Promise<ReplaceFloorPlanCommand> {
  const plan = await gateway.getFloorPlan(branchId);
  return {
    floorWidth: plan.floorWidth,
    floorHeight: plan.floorHeight,
    areas: [],
    tables: plan.tables.filter((t) => t.isActive).map((t) => ({ ...t, floorAreaName: null })),
    expectedVersion: plan.version,
  };
}

describe('F1 — a new venue starts with nobody on it', () => {
  it('seeds no staff for a venue the platform admin just created', async () => {
    // `PlatformService.CreateVenueAsync` writes the venue and its first branch
    // and nothing else; the first owner is added afterwards with "Add someone".
    const gateway = createConsoleMockGateway();
    const created = await newVenue(gateway);
    expect(created.staff).toEqual([]);
    expect(await gateway.listStaff(created.id)).toEqual([]);
  });
});

describe('F3/F4 — a branch manager is one person at one branch', () => {
  it('the managed-venue read covers the home branch only', async () => {
    // `ManagedVenueQuery`: a manager whose row names a branch is shown that
    // branch and no other.
    const managed = await createConsoleMockGateway({ role: 'manager' }).getManagedVenue('v-lumen');
    expect(managed.branches.map((b) => b.id)).toEqual(['b-lumen-north']);
  });

  it('the signed-in manager is the stored row at their home branch, whatever branch is on screen', async () => {
    const gateway = createConsoleMockGateway({ role: 'manager' });
    const user = await gateway.getCurrentUser();
    const staff = await gateway.listStaff('v-lumen');
    const self = staff.find((member) => member.id === user.id);
    expect(self?.role).toBe('manager');
    expect(self?.branchId).toBe('b-lumen-north');
    expect(self?.fullName).toBe(user.displayName);
  });

  it('the signed-in owner and the venue-wide manager are their stored rows too', async () => {
    for (const options of [
      { role: 'owner' as const },
      { role: 'manager' as const, managerBranch: 'none' as const },
    ]) {
      const gateway = createConsoleMockGateway(options);
      const user = await gateway.getCurrentUser();
      const staff = await gateway.listStaff('v-lumen');
      expect(staff.some((member) => member.id === user.id)).toBe(true);
    }
  });
});

describe('F5 — the console and the public page read the same booking switch', () => {
  it('seeds "Take bookings" from the same fixture the public page publishes', async () => {
    const gateway = createConsoleMockGateway();
    // `publicBranchFixtures['b-lumen-cascade'].acceptsWebBookings` is true and
    // `b-tumanyan-main` is false; the console used to say "off" for every branch.
    expect((await gateway.getPublicProfile('b-lumen-cascade')).acceptsWebBookings).toBe(true);
    expect((await gateway.getPublicProfile('b-tumanyan-main')).acceptsWebBookings).toBe(false);
  });
});

describe('F7 — opening hours: a block must have a length', () => {
  it('refuses open == close as a 422 naming the block, with the server sentence', async () => {
    // `OpeningHoursRules.Normalise`: equal times are a FieldViolation on
    // `[i].closesAt` (bound conflict), before the overlap sweep.
    const gateway = createConsoleMockGateway();
    const week = await gateway.getOpeningHours('b-lumen-cascade');
    const monday = week.find((day) => day.day === 1)!;
    const error = await caught(
      gateway.replaceOpeningHours({
        branchId: 'b-lumen-cascade',
        week: week.map((day) =>
          day.day === 1 ? { ...day, blocks: [{ opensAt: '09:00', closesAt: '09:00' }] } : day,
        ),
      }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    const violation = (error as ValidationError).violations[0];
    expect((error as ValidationError).status).toBe(422);
    expect(violation?.field).toBe(`[${week.indexOf(monday)}].closesAt`);
    expect(violation?.bound).toBe('conflict');
    expect(violation?.message).toBe(
      'Opening and closing time are both 09:00 on Monday. A block must have a length; ' +
        'for a branch that never closes use 00:00 to 23:59.',
    );
    // Nothing written.
    expect((await gateway.getOpeningHours('b-lumen-cascade')).find((d) => d.day === 1)).toEqual(
      monday,
    );
  });
});

describe('F8 — the floor plan refuses a table outside the room, in the server words', () => {
  it('names the canvas and the tables, and writes nothing', async () => {
    const gateway = createConsoleMockGateway();
    const branchId = 'b-lumen-cascade';
    const command = await planCommand(gateway, branchId);
    const before = await gateway.getFloorPlan(branchId);
    const error = await caught(
      gateway.replaceFloorPlan({
        branchId,
        command: {
          ...command,
          tables: [
            ...command.tables,
            {
              label: 'QA13',
              seats: 2,
              x: command.floorWidth - 40,
              y: 100,
              width: 90,
              height: 90,
              rotationDegrees: 0,
              shape: 'rectangle',
              floorAreaName: null,
              isBookable: true,
            },
          ],
        },
      }),
    );
    expect(error).toBeInstanceOf(FloorPlanInvalidError);
    expect((error as FloorPlanInvalidError).errors).toEqual([
      `Every table must sit inside the ${command.floorWidth}x${command.floorHeight} canvas. Outside it: QA13.`,
    ]);
    expect(await gateway.getFloorPlan(branchId)).toEqual(before);
  });
});

async function planWithAreas(
  gateway: ConsoleGateway,
  branchId: string,
): Promise<ReplaceFloorPlanCommand> {
  const plan = await gateway.getFloorPlan(branchId);
  const nameOf = new Map(plan.areas.map((a) => [a.id, a.name]));
  return {
    floorWidth: plan.floorWidth,
    floorHeight: plan.floorHeight,
    areas: plan.areas.map((a) => ({ id: a.id, name: a.name, displayOrder: a.displayOrder })),
    tables: plan.tables
      .filter((t) => t.isActive)
      .map((t) => ({
        ...t,
        floorAreaName: t.floorAreaId ? (nameOf.get(t.floorAreaId) ?? null) : null,
      })),
    expectedVersion: plan.version,
  };
}

describe('F8 — a table still filed under an area the plan removed is refused, in the server words', () => {
  // BranchSettingsService.cs (~346-353): a table naming an area that is not in
  // the saved plan is a 422 floor-plan-invalid listing `label -> area`. The
  // mock used to file such a table under no area and save, so a console that
  // dropped an area and kept its tables passed every test and failed live.
  it('names the table and the missing area, and writes nothing', async () => {
    const gateway = createConsoleMockGateway();
    const branchId = 'b-lumen-cascade';
    const command = await planWithAreas(gateway, branchId);
    const filed = command.tables.find((t) => t.floorAreaName !== null);
    expect(filed, 'the fixture has a table filed under an area').toBeDefined();
    const area = filed!.floorAreaName!;
    const before = await gateway.getFloorPlan(branchId);
    const error = await caught(
      gateway.replaceFloorPlan({
        branchId,
        command: { ...command, areas: command.areas.filter((a) => a.name !== area) },
      }),
    );
    expect(error).toBeInstanceOf(FloorPlanInvalidError);
    const stillFiled = command.tables
      .filter((t) => t.floorAreaName === area)
      .map((t) => `${t.label} -> ${area}`);
    expect((error as FloorPlanInvalidError).errors).toEqual([
      `Tables reference areas that are not in the plan: ${stillFiled.join(', ')}.`,
    ]);
    expect(await gateway.getFloorPlan(branchId)).toEqual(before);
  });

  it('keeps every table when the same save moves them to no area', async () => {
    const gateway = createConsoleMockGateway();
    const branchId = 'b-lumen-cascade';
    const command = await planWithAreas(gateway, branchId);
    const area = command.tables.find((t) => t.floorAreaName !== null)!.floorAreaName!;
    const result = await gateway.replaceFloorPlan({
      branchId,
      command: {
        ...command,
        areas: command.areas.filter((a) => a.name !== area),
        tables: command.tables.map((t) =>
          t.floorAreaName === area ? { ...t, floorAreaName: null } : t,
        ),
      },
    });
    expect(result.plan.tables.filter((t) => t.isActive)).toHaveLength(command.tables.length);
  });
});

describe('F11 — a deleted venue can no longer be changed', () => {
  async function deletedVenue(gateway: ConsoleGateway) {
    const created = await newVenue(gateway);
    await gateway.deleteVenue({ venueId: created.id, commandId: cmd() });
    return created;
  }

  it('refuses a tier change with the server sentence', async () => {
    // `PlatformService.UpdateBranchAsync`: a DomainStateException (409).
    const gateway = createConsoleMockGateway();
    const venue = await deletedVenue(gateway);
    const error = await caught(
      gateway.setBranchTier({ branchId: venue.branches[0]!.id, tier: 'paid', commandId: cmd() }),
    );
    expect(error).toBeInstanceOf(ConcurrencyConflictError);
    expect((error as ConcurrencyConflictError).message).toBe(
      "Venue 'Kond Bakery' has been deleted, so its branches can no longer be changed.",
    );
  });

  it('still takes people and issues sign-ins, as the server does', async () => {
    // StaffManagementService.CreateAsync and IssueSignInAsync do not look at
    // the venue's deletion, on master or on fix/qa-2026-10-16-backend, so the
    // mock may not refuse them either: a mock stricter than the server hides
    // what a real console would let through.
    const gateway = createConsoleMockGateway();
    const venue = await deletedVenue(gateway);
    const hired = await gateway.createStaff({
      venueId: venue.id,
      staff: {
        fullName: 'Hasmik Sargsyan',
        phone: '+37477555555',
        pin: '4821',
        branchId: null,
        role: 'owner',
      },
    });
    expect((await gateway.listStaff(venue.id)).map((member) => member.id)).toEqual([hired.id]);
    const link = await gateway.issueStaffSignIn({
      venueId: venue.id,
      staffMemberId: hired.id,
      email: 'hasmik@kond.am',
    });
    expect(link.staffMemberId).toBe(hired.id);
  });
});

describe('F16 — a category whose dishes were ordered cannot be deleted', () => {
  it('carries the server sentence, naming the category', async () => {
    // `MenuService.DeleteCategoryAsync`'s DomainStateException.
    const gateway = createConsoleMockGateway();
    const menu = await gateway.getAdminMenu('b-lumen-cascade');
    const ordered = menu[1]!;
    const error = await caught(
      gateway.deleteCategory({ branchId: 'b-lumen-cascade', categoryId: ordered.id }),
    );
    expect(error).toBeInstanceOf(CategoryInUseError);
    expect((error as CategoryInUseError).message).toBe(
      `Category '${ordered.name}' has items that appear on orders and cannot be deleted. ` +
        'Mark its items unavailable instead.',
    );
  });
});
