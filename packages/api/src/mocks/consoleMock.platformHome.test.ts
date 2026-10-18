import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../errors';
import { createConsoleMockGateway, MOCK_PLATFORM_PASSWORD } from './consoleMock';

/**
 * Home and Settings against the mock, which has to answer as the server does
 * (`docs/platform-admin.md` §5): the overview's numbers agree with the venues
 * it holds, the feed records what the platform does here, the name is the
 * admin's to change and the email is not, and a password change is one 422
 * naming every field.
 */

const NOW = new Date('2026-10-18T10:30:00Z');

function mock(role: 'platformAdmin' | 'owner' = 'platformAdmin') {
  return createConsoleMockGateway({ latencyMs: 0, role, now: () => NOW });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('the overview', () => {
  it('counts the venues it lists, by tier and by state, with deleted ones apart', async () => {
    const gateway = mock();
    const overview = await gateway.getPlatformOverview();
    const { items } = await gateway.listVenues({ pageSize: 200, includeDeleted: true });
    const deleted = items.filter((venue) => venue.status === 'deleted');
    expect(overview.venues.deleted).toBe(deleted.length);
    expect(overview.venues.total).toBe(items.length - deleted.length);
    expect(overview.venues.paid + overview.venues.mixed + overview.venues.free).toBe(
      overview.venues.total,
    );
    expect(overview.venues.active + overview.venues.suspended + overview.venues.inactive).toBe(
      overview.venues.total,
    );
    // A deleted venue is in no other number, and never among the recent ones.
    for (const venue of deleted) {
      expect(overview.recentVenues.some((recent) => recent.id === venue.id)).toBe(false);
    }
    expect(overview.recentVenues.length).toBeLessThanOrEqual(5);
  });

  it('has thirty days, today last, and the two weeks they add up to', async () => {
    const overview = await mock().getPlatformOverview();
    const { perDay, last7Days, previous7Days, changePercent } = overview.bookings;
    expect(perDay).toHaveLength(30);
    expect(perDay.at(-1)?.date).toBe('2026-10-18');
    expect(perDay[0]?.date).toBe('2026-09-19');
    const sum = (from: number, to: number) =>
      perDay.slice(from, to).reduce((total, day) => total + day.count, 0);
    expect(last7Days).toBe(sum(23, 30));
    expect(previous7Days).toBe(sum(16, 23));
    expect(changePercent).toBe(
      Math.round(((last7Days - previous7Days) / previous7Days) * 1000) / 10,
    );
  });

  it('lists the venues waiting on approvals and holding tabs, the most first', async () => {
    const { pendingApprovals, openTabs } = await mock().getPlatformOverview();
    for (const counter of [pendingApprovals, openTabs]) {
      expect(counter.total).toBe(counter.venues.reduce((sum, venue) => sum + venue.count, 0));
      const counts = counter.venues.map((venue) => venue.count);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
      expect(counts.every((count) => count > 0)).toBe(true);
    }
    expect(pendingApprovals.total).toBeGreaterThan(0);
  });

  it('names the unfinished branches with what a guest would find missing', async () => {
    const { notReady } = await mock().getPlatformOverview();
    expect(notReady.total).toBeGreaterThan(0);
    for (const branch of notReady.branches) expect(branch.issues.length).toBeGreaterThan(0);
  });

  it("is the platform admin's alone", async () => {
    const owner = mock('owner');
    expect(await caught(owner.getPlatformOverview())).toBeInstanceOf(ForbiddenError);
    expect(await caught(owner.listPlatformActivity())).toBeInstanceOf(ForbiddenError);
    expect(await caught(owner.getPlatformProfile())).toBeInstanceOf(ForbiddenError);
  });
});

describe('the activity feed', () => {
  it('starts with some history and records what the platform does, newest first', async () => {
    const gateway = mock();
    expect((await gateway.listPlatformActivity()).length).toBeGreaterThan(0);

    const { items } = await gateway.listVenues({});
    const venue = items.find((candidate) => candidate.status === 'active')!;
    await gateway.suspendVenue({ venueId: venue.id, commandId: 'c-1' });
    const [latest] = await gateway.listPlatformActivity({ limit: 1 });
    expect(latest).toMatchObject({
      action: 'venue.suspend',
      actor: { role: 'platformAdmin', name: 'Yalla team' },
      venue: { id: venue.id, name: venue.name },
    });
  });

  it('narrows to one venue and refuses a limit out of range', async () => {
    const gateway = mock();
    const { items } = await gateway.listVenues({});
    const venue = items[0]!;
    await gateway.suspendVenue({ venueId: venue.id, commandId: 'c-1' });
    const feed = await gateway.listPlatformActivity({ venueId: venue.id });
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.every((entry) => entry.venue?.id === venue.id)).toBe(true);
    expect(await caught(gateway.listPlatformActivity({ limit: 0 }))).toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("the admin's own account", () => {
  it("renames them, and the shell's name follows", async () => {
    const gateway = mock();
    const before = await gateway.getPlatformProfile();
    expect(before.email).toBe('admin@yalla.am');
    const after = await gateway.updatePlatformProfile({ fullName: '  Grigor Avagyan ' });
    expect(after).toEqual({ ...before, fullName: 'Grigor Avagyan' });
    expect((await gateway.getCurrentUser()).displayName).toBe('Grigor Avagyan');
    expect((await gateway.listPlatformActivity({ limit: 1 }))[0]?.action).toBe('admin.rename');
  });

  it('refuses a blank name naming the field', async () => {
    const error = await caught(mock().updatePlatformProfile({ fullName: '   ' }));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).violations[0]).toMatchObject({
      field: 'fullName',
      bound: 'required',
    });
  });

  it('refuses a wrong current password and a short new one in one answer', async () => {
    const error = await caught(
      mock().changePlatformPassword({ currentPassword: 'not-it', newPassword: 'short' }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(
      (error as ValidationError).violations.map((violation) => [violation.field, violation.bound]),
    ).toEqual([
      ['currentPassword', 'conflict'],
      ['newPassword', 'min'],
    ]);
  });

  it('changes the password, which the next change has to give as the current one', async () => {
    const gateway = mock();
    await gateway.changePlatformPassword({
      currentPassword: MOCK_PLATFORM_PASSWORD,
      newPassword: 'a-new-password-1234',
    });
    expect(
      await caught(
        gateway.changePlatformPassword({
          currentPassword: MOCK_PLATFORM_PASSWORD,
          newPassword: 'another-password-5678',
        }),
      ),
    ).toBeInstanceOf(ValidationError);
    await expect(
      gateway.changePlatformPassword({
        currentPassword: 'a-new-password-1234',
        newPassword: 'another-password-5678',
      }),
    ).resolves.toBeUndefined();
  });
});
