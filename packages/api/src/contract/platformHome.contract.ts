import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlatformAdminProfile } from '../contracts/platformHome';
import { ValidationError } from '../errors';
import type { ContractSubject } from './subject';
import { CONTRACT_RUN } from './subject';

/**
 * Home and Settings (console redesign phase 5), held to one set of answers by
 * the mock and the live backend (`docs/platform-admin.md` §5):
 *
 * - **The overview adds up**: thirty days, oldest first; the rolling week is
 *   the last seven of them; the venues split by tier and by state into the
 *   same total; each per-venue counter is the sum of its venues.
 * - **The admin's own account**: a rename is answered with the new name and
 *   the same email, written to the activity feed as `admin.rename`, and a blank
 *   name is a 422 naming `fullName`.
 * - **A wrong current password is a form error**, a 422 naming
 *   `currentPassword` with the `conflict` bound — and the session still works
 *   after it, because it is not a 401. The password itself is never changed
 *   here: the run's credentials have to survive it.
 */
export function describePlatformHomeContract(subject: ContractSubject): void {
  describe(`platform home and settings — ${subject.name}`, () => {
    const { console: admin } = subject;
    let before: PlatformAdminProfile;

    beforeAll(async () => {
      before = await admin.getPlatformProfile();
    });

    afterAll(async () => {
      // Leave the account named as it was, so the next run starts from the same place.
      if (before) await admin.updatePlatformProfile({ fullName: before.fullName });
    });

    it('answers an overview whose numbers add up', async () => {
      const overview = await admin.getPlatformOverview();
      const { venues, bookings, pendingApprovals, openTabs } = overview;

      expect(bookings.perDay).toHaveLength(30);
      const dates = bookings.perDay.map((day) => day.date);
      expect(dates).toEqual([...dates].sort());
      const sum = (from: number, to: number) =>
        bookings.perDay.slice(from, to).reduce((total, day) => total + day.count, 0);
      expect(bookings.last7Days).toBe(sum(23, 30));
      expect(bookings.previous7Days).toBe(sum(16, 23));
      if (bookings.previous7Days === 0) expect(bookings.changePercent).toBeNull();

      expect(venues.paid + venues.mixed + venues.free).toBe(venues.total);
      expect(venues.active + venues.suspended + venues.inactive).toBe(venues.total);
      for (const counter of [pendingApprovals, openTabs]) {
        expect(counter.total).toBe(counter.venues.reduce((total, venue) => total + venue.count, 0));
      }
      expect(overview.recentVenues.length).toBeLessThanOrEqual(5);
      expect(overview.notReady.branches.length).toBeLessThanOrEqual(overview.notReady.total);
      expect(overview.outbox.deadLetteredLastDay).toBeLessThanOrEqual(overview.outbox.deadLettered);
    });

    it('renames the admin, keeps the email, and writes the rename to the feed', async () => {
      const wanted = `Contract admin ${CONTRACT_RUN.slice(0, 8)}`;
      const after = await admin.updatePlatformProfile({ fullName: `  ${wanted}  ` });
      expect(after).toEqual({ ...before, fullName: wanted });
      expect(await admin.getPlatformProfile()).toEqual(after);

      const [latest] = await admin.listPlatformActivity({ limit: 1 });
      expect(latest).toMatchObject({
        action: 'admin.rename',
        actor: { role: 'platformAdmin' },
        venue: null,
      });
    });

    it('refuses a blank name, naming the field', async () => {
      const error = await admin.updatePlatformProfile({ fullName: '   ' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).violations.map((violation) => violation.field)).toContain(
        'fullName',
      );
    });

    it('answers a wrong current password as a form error, and stays signed in', async () => {
      const error = await admin
        .changePlatformPassword({
          currentPassword: `not-the-password-${CONTRACT_RUN}`,
          newPassword: 'a-long-enough-new-password',
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).violations).toContainEqual(
        expect.objectContaining({ field: 'currentPassword', bound: 'conflict' }),
      );
      // Not a 401: the console is still signed in.
      await expect(admin.getPlatformProfile()).resolves.toMatchObject({
        email: before.email,
      });
    });

    it('caps the feed at the limit it was asked for', async () => {
      expect((await admin.listPlatformActivity({ limit: 2 })).length).toBeLessThanOrEqual(2);
      const error = await admin.listPlatformActivity({ limit: 0 }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
    });
  });
}
