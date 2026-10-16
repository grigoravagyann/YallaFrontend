import { describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import { FloorPlanChangedError, ReviewHiddenByPlatformError } from '../contracts/errors';
import type { ReplaceFloorPlanCommand } from '../contracts/floorPlan';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';
import { createMockReviewStore } from './reviewStore';

/**
 * The console mock against the hardening contract: branch limits (K4), floor-plan
 * versions (K6), readiness from state, and review moderation.
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

  it('moves no pin when the cover changes: the cover is the card picture only', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const photoId = await withCover(gateway, 'hall.png');
    const plan = await gateway.getFloorPlan(BRANCH);
    const hall = plan.areas[0]!;
    const command = await planCommand(gateway);
    const saved = await gateway.replaceFloorPlan({
      branchId: BRANCH,
      command: {
        ...command,
        areas: [{ id: hall.id, name: hall.name, displayOrder: 0, photoIds: [photoId] }],
        tables: command.tables.map((t, index) =>
          index === 0 ? { ...t, floorAreaName: hall.name, pin: { photoId, x: 0.2, y: 0.3 } } : t,
        ),
      },
    });

    const pinned = saved.plan.tables.find((t) => t.pin !== null);
    expect(pinned?.pin).toEqual({ photoId, x: 0.2, y: 0.3 });

    await withCover(gateway, 'another.png');

    const after = await gateway.getFloorPlan(BRANCH);
    expect(after.tables.find((t) => t.id === pinned!.id)?.pin).toEqual(pinned!.pin);
    expect(after.version).toBe(saved.plan.version);
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
          command: { areas: [], tables: [], expectedVersion: '1' },
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
      // Seeded from the public fixture, where Cascade takes bookings (QA F5).
      acceptsWebBookings: true,
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

  it('orders the reported filter by the most recent report, as the server does', async () => {
    const reviews = createMockReviewStore({ seed: true });
    const manager = createConsoleMockGateway({ role: 'manager', reviews });
    // The oldest review, reported a moment ago; seed-2 was written later and last reported two days ago.
    reviews.report({
      reviewId: 'review-seed-1',
      dinerUserId: 'diner-reporter',
      reason: 'spam',
      note: null,
      createdAtUtc: new Date().toISOString(),
    });

    const reported = await manager.listVenueBranchReviews('b-lumen-north', { filter: 'reported' });
    expect(reported.items.map((r) => r.reviewId)).toEqual(['review-seed-1', 'review-seed-2']);

    const first = await manager.listVenueBranchReviews('b-lumen-north', {
      filter: 'reported',
      pageSize: 1,
    });
    expect(first.items.map((r) => r.reviewId)).toEqual(['review-seed-1']);
    expect(first.total).toBe(2);
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
