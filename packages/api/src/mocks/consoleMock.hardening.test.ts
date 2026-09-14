import { describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import {
  CoverChangedError,
  FloorPlanChangedError,
  ReviewHiddenByPlatformError,
} from '../contracts/errors';
import type { ReplaceFloorPlanCommand } from '../contracts/floorPlan';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';
import { createMockReviewStore } from './reviewStore';

/**
 * The console mock against the hardening contract: branch limits (K4), floor-plan
 * versions (K6), the pin route (K7), readiness from state, and review moderation.
 */

const BRANCH = 'b-lumen-cascade';

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

function named(error: unknown): (readonly [string, string | undefined])[] {
  expect(error).toBeInstanceOf(ValidationError);
  return (error as ValidationError).violations.map((v) => [v.field, v.bound] as const);
}

async function withCover(gateway: ConsoleGateway, fileName = 'cover.png'): Promise<string> {
  const { photo } = await gateway.uploadPhoto({
    branchId: BRANCH,
    file: new Blob([new Uint8Array([1, 2, 3, fileName.length])], { type: 'image/png' }),
    fileName,
  });
  await gateway.updatePublicProfile({
    branchId: BRANCH,
    profile: { phoneE164: null, acceptsWebBookings: true, coverPhotoId: photo.photoId },
  });
  return photo.photoId;
}

async function planCommand(gateway: ConsoleGateway): Promise<ReplaceFloorPlanCommand> {
  const plan = await gateway.getFloorPlan(BRANCH);
  return {
    floorWidth: plan.floorWidth,
    floorHeight: plan.floorHeight,
    areas: [],
    tables: plan.tables.filter((t) => t.isActive).map((t) => ({ ...t, floorAreaName: null })),
    expectedVersion: plan.version,
  };
}

describe('floor-plan versions in the mock (K6)', () => {
  it('refuses a save against a stale version with the current one, and writes nothing', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const loaded = await planCommand(gateway);
    const seatsOf = async () =>
      (await gateway.getFloorPlan(BRANCH)).tables.find((t) => t.label === '1')?.seats;

    const first = await gateway.replaceFloorPlan({
      branchId: BRANCH,
      command: {
        ...loaded,
        tables: loaded.tables.map((t) => (t.label === '1' ? { ...t, seats: 6 } : t)),
      },
    });
    expect(first.plan.version).not.toBe(loaded.expectedVersion);

    const stale = await caught(
      gateway.replaceFloorPlan({
        branchId: BRANCH,
        command: {
          ...loaded,
          tables: loaded.tables.map((t) => (t.label === '1' ? { ...t, seats: 3 } : t)),
        },
      }),
    );
    expect(stale).toBeInstanceOf(FloorPlanChangedError);
    expect((stale as FloorPlanChangedError).currentVersion).toBe(first.plan.version);
    expect(await seatsOf()).toBe(6);
  });

  it('requires the version, naming the field', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const command = await planCommand(gateway);
    expect(
      named(
        await caught(
          gateway.replaceFloorPlan({
            branchId: BRANCH,
            command: { ...command, expectedVersion: '' },
          }),
        ),
      ),
    ).toEqual([['expectedVersion', 'required']]);
  });

  it('keeps pins through a plan save, ignores pins sent with it, and gives a new table none', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const cover = await withCover(gateway);
    const before = await gateway.getFloorPlan(BRANCH);
    const [one, two] = before.tables;

    await gateway.saveTablePhotoPositions(BRANCH, {
      coverPhotoId: cover,
      positions: [
        { tableId: one!.id, photoX: 0.2, photoY: 0.3 },
        { tableId: two!.id, photoX: 0.7, photoY: 0.8 },
      ],
    });
    // A pin is not a plan edit.
    expect((await gateway.getFloorPlan(BRANCH)).version).toBe(before.version);

    const command = await planCommand(gateway);
    const result = await gateway.replaceFloorPlan({
      branchId: BRANCH,
      command: {
        ...command,
        // A stale editor sending pins with the plan: ignored, never written.
        tables: [
          ...command.tables.map((t) => Object.assign({}, t, { photoX: 0.9, photoY: 0.9 })),
          {
            label: '99',
            seats: 2,
            x: 10,
            y: 10,
            width: 50,
            height: 50,
            rotationDegrees: 0,
            shape: 'round' as const,
            isBookable: true,
          },
        ],
      },
    });

    const pins = new Map(result.plan.tables.map((t) => [t.label, [t.photoX, t.photoY]]));
    expect(pins.get(one!.label)).toEqual([0.2, 0.3]);
    expect(pins.get(two!.label)).toEqual([0.7, 0.8]);
    expect(pins.get('99')).toEqual([null, null]);
    expect(result.plan.version).not.toBe(before.version);
  });
});

describe('table photo positions in the mock (K7)', () => {
  it('changes only the listed tables and answers every active table', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const cover = await withCover(gateway);
    const plan = await gateway.getFloorPlan(BRANCH);
    const [one, two] = plan.tables;

    await gateway.saveTablePhotoPositions(BRANCH, {
      coverPhotoId: cover,
      positions: [{ tableId: two!.id, photoX: 0.5, photoY: 0.5 }],
    });
    const answer = await gateway.saveTablePhotoPositions(BRANCH, {
      coverPhotoId: cover,
      positions: [{ tableId: one!.id, photoX: 0.25, photoY: 0.75 }],
    });

    expect(answer.coverPhotoId).toBe(cover);
    expect(answer.tables).toHaveLength(plan.tables.filter((t) => t.isActive).length);
    expect(answer.tables.find((t) => t.tableId === one!.id)).toMatchObject({
      label: one!.label,
      photoX: 0.25,
      photoY: 0.75,
    });
    // Left out of the second call, so kept.
    expect(answer.tables.find((t) => t.tableId === two!.id)).toMatchObject({ photoX: 0.5 });

    // null/null takes a table off the photo.
    const off = await gateway.saveTablePhotoPositions(BRANCH, {
      coverPhotoId: cover,
      positions: [{ tableId: one!.id, photoX: null, photoY: null }],
    });
    expect(off.tables.find((t) => t.tableId === one!.id)).toMatchObject({ photoX: null });
  });

  it('refuses a stale cover, and a branch with no cover, naming the cover it has', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const plan = await gateway.getFloorPlan(BRANCH);
    const position = { tableId: plan.tables[0]!.id, photoX: 0.5, photoY: 0.5 };

    const none = await caught(
      gateway.saveTablePhotoPositions(BRANCH, { coverPhotoId: 'photo-old', positions: [position] }),
    );
    expect(none).toBeInstanceOf(CoverChangedError);
    expect((none as CoverChangedError).currentCoverPhotoId).toBeNull();

    const first = await withCover(gateway, 'first.png');
    const second = await withCover(gateway, 'second.png');
    const stale = await caught(
      gateway.saveTablePhotoPositions(BRANCH, { coverPhotoId: first, positions: [position] }),
    );
    expect(stale).toBeInstanceOf(CoverChangedError);
    expect((stale as CoverChangedError).currentCoverPhotoId).toBe(second);
    expect((await gateway.getFloorPlan(BRANCH)).tables[0]?.photoX ?? null).toBeNull();
  });

  it('names half a position, a value out of range and a repeated table, before the cover', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const [one, two] = (await gateway.getFloorPlan(BRANCH)).tables;

    const refusal = await caught(
      gateway.saveTablePhotoPositions(BRANCH, {
        coverPhotoId: 'not-the-cover',
        positions: [
          { tableId: one!.id, photoX: 0.5, photoY: null },
          { tableId: two!.id, photoX: 1.5, photoY: 0.5 },
          { tableId: two!.id, photoX: 0.1, photoY: 0.1 },
        ],
      }),
    );
    expect(named(refusal)).toEqual([
      ['positions[0].photoY', 'required'],
      ['positions[1].photoX', 'range'],
      ['positions', 'conflict'],
    ]);
  });

  it('refuses a table that is not active at this branch', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const cover = await withCover(gateway);
    expect(
      await caught(
        gateway.saveTablePhotoPositions(BRANCH, {
          coverPhotoId: cover,
          positions: [{ tableId: 'tbl-b-lumen-north-1', photoX: 0.5, photoY: 0.5 }],
        }),
      ),
    ).toBeInstanceOf(NotFoundError);
  });

  it('refuses a waiter, and a manager at a branch that is not their home (K4)', async () => {
    const command = { coverPhotoId: 'c', positions: [] };
    expect(
      await caught(
        createConsoleMockGateway({ role: 'waiter' }).saveTablePhotoPositions(BRANCH, command),
      ),
    ).toBeInstanceOf(ForbiddenError);
    expect(
      await caught(
        createConsoleMockGateway({ role: 'manager' }).saveTablePhotoPositions(BRANCH, command),
      ),
    ).toBeInstanceOf(ForbiddenError);
  });
});

describe('writes a manager may make only at their home branch (K4)', () => {
  it('refuses a plan save and an upload at a sibling branch, and allows them at home', async () => {
    const manager = createConsoleMockGateway({ role: 'manager' });
    const home = await manager.getFloorPlan('b-lumen-north');
    await expect(
      manager.replaceFloorPlan({
        branchId: 'b-lumen-north',
        command: {
          floorWidth: home.floorWidth,
          floorHeight: home.floorHeight,
          areas: [],
          tables: home.tables.map((t) => ({ ...t, floorAreaName: null })),
          expectedVersion: home.version,
        },
      }),
    ).resolves.toBeTruthy();

    expect(
      await caught(
        manager.replaceFloorPlan({
          branchId: BRANCH,
          command: { floorWidth: 1, floorHeight: 1, areas: [], tables: [], expectedVersion: '1' },
        }),
      ),
    ).toBeInstanceOf(ForbiddenError);
    expect(
      await caught(
        manager.uploadPhoto({
          branchId: BRANCH,
          file: new Blob([new Uint8Array(3)]),
          fileName: 'a.png',
        }),
      ),
    ).toBeInstanceOf(ForbiddenError);
  });
});

describe('readiness in the mock', () => {
  it('counts the reservation policy only once somebody saves it', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const blocker = 'Nobody has reviewed the reservation policy; it is still on the defaults.';

    const before = await gateway.getBranchReadiness(BRANCH);
    expect(before.reservationPolicyReviewed).toBe(false);
    expect(before.blockers).toContain(blocker);

    // A policy loads either way. Loading it is not reviewing it.
    const policy = await gateway.getReservationPolicy(BRANCH);
    expect((await gateway.getBranchReadiness(BRANCH)).reservationPolicyReviewed).toBe(false);

    await gateway.replaceReservationPolicy({ branchId: BRANCH, policy });
    const after = await gateway.getBranchReadiness(BRANCH);
    expect(after.reservationPolicyReviewed).toBe(true);
    expect(after.blockers).not.toContain(blocker);
  });

  it('reads every other line from the mock world', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const readiness = await gateway.getBranchReadiness(BRANCH);

    expect(readiness).toMatchObject({
      branchId: BRANCH,
      floorPlanDrawn: true,
      tablesLabelled: true,
      menuCategoriesPresent: true,
      openingHoursSet: true,
      openingHoursDayCount: 6,
      staffEnrolled: true,
      deviceEnrolled: true,
      deviceCount: 1,
      acceptsWebBookings: false,
      isReadyForDiners: false,
    });
    // The fixture seeds one dish without a photo, which is what the to-do list is for.
    expect(readiness.incompleteMenuItemCount).toBeGreaterThan(0);
    expect(readiness.menuComplete).toBe(false);
    expect(readiness.incompleteMenuItemIds).toHaveLength(readiness.incompleteMenuItemCount);
  });

  it('refuses a waiter', async () => {
    expect(
      await caught(
        createConsoleMockGateway({ role: 'waiter' }).getBranchReadiness('b-lumen-north'),
      ),
    ).toBeInstanceOf(ForbiddenError);
  });
});

describe('review moderation in the mock', () => {
  it("lists a manager's own branch newest first, with report counts, and filters it", async () => {
    const manager = createConsoleMockGateway({ role: 'manager' });

    const all = await manager.listVenueBranchReviews('b-lumen-north');
    expect(all.total).toBe(3);
    expect(all.items.map((r) => r.reviewId)).toEqual([
      'review-seed-3',
      'review-seed-2',
      'review-seed-1',
    ]);

    const reported = await manager.listVenueBranchReviews('b-lumen-north', { filter: 'reported' });
    expect(reported.items.map((r) => [r.reviewId, r.reportCount])).toEqual([['review-seed-2', 2]]);
    expect(reported.items[0]?.lastReportedAtUtc).not.toBeNull();

    const hidden = await manager.listVenueBranchReviews('b-lumen-north', { filter: 'hidden' });
    expect(hidden.items.map((r) => [r.reviewId, r.hiddenReason])).toEqual([
      ['review-seed-3', 'Not about this venue.'],
    ]);

    // K4 applies to the venue route as to every branch route.
    expect(await caught(manager.listVenueBranchReviews(BRANCH))).toBeInstanceOf(ForbiddenError);
  });

  it('hides with a reason and restores, and refuses a hide with no reason', async () => {
    const manager = createConsoleMockGateway({ role: 'manager' });

    expect(
      named(
        await caught(
          manager.setVenueReviewVisibility('b-lumen-north', 'review-seed-1', {
            hidden: true,
            reason: '  ',
          }),
        ),
      ),
    ).toEqual([['reason', 'required']]);

    const hidden = await manager.setVenueReviewVisibility('b-lumen-north', 'review-seed-1', {
      hidden: true,
      reason: 'Off topic.',
    });
    expect(hidden).toMatchObject({ hidden: true, hiddenReason: 'Off topic.' });
    expect(hidden.hiddenAtUtc).not.toBeNull();

    const restored = await manager.setVenueReviewVisibility('b-lumen-north', 'review-seed-1', {
      hidden: false,
      reason: null,
    });
    expect(restored).toMatchObject({ hidden: false, hiddenReason: null, hiddenAtUtc: null });

    // A review of another branch is not found at this one.
    expect(
      await caught(
        manager.setVenueReviewVisibility('b-lumen-north', 'review-seed-4', {
          hidden: false,
          reason: null,
        }),
      ),
    ).toBeInstanceOf(NotFoundError);
  });

  it('lets the platform restore what a venue hid, and never the other way round', async () => {
    const reviews = createMockReviewStore({ seed: true });
    const owner = createConsoleMockGateway({ role: 'owner', reviews });
    const admin = createConsoleMockGateway({ role: 'platformAdmin', reviews });

    expect(
      await caught(
        owner.setVenueReviewVisibility(BRANCH, 'review-seed-4', { hidden: false, reason: null }),
      ),
    ).toBeInstanceOf(ReviewHiddenByPlatformError);

    await expect(
      admin.setReviewVisibility('review-seed-3', { hidden: false, reason: null }),
    ).resolves.toMatchObject({ hidden: false });

    await admin.setReviewVisibility('review-seed-1', {
      hidden: true,
      reason: 'Personal information.',
    });
    expect(
      await caught(
        owner.setVenueReviewVisibility('b-lumen-north', 'review-seed-1', {
          hidden: false,
          reason: null,
        }),
      ),
    ).toBeInstanceOf(ReviewHiddenByPlatformError);

    const page = await admin.listPlatformBranchReviews('b-lumen-north');
    expect(page.items.find((r) => r.reviewId === 'review-seed-1')).toMatchObject({
      hidden: true,
      hiddenReason: 'Personal information.',
    });
  });

  it('keeps the platform routes to the platform admin', async () => {
    const owner = createConsoleMockGateway({ role: 'owner' });
    expect(await caught(owner.listPlatformBranchReviews('b-lumen-north'))).toBeInstanceOf(
      ForbiddenError,
    );
    expect(
      await caught(owner.setReviewVisibility('review-seed-1', { hidden: true, reason: 'x' })),
    ).toBeInstanceOf(ForbiddenError);
  });
});
