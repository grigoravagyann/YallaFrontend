import { beforeAll, describe, expect, it } from 'vitest';
import type { Booking, CreateBookingCommand } from '../contracts/booking';
import { BookingTooEarlyError, ReviewNeedsVisitError } from '../contracts/errors';
import type { ReviewReportReason } from '../contracts/reviews';
import { NotFoundError, SessionRevokedError, ValidationError } from '../errors';
import { pngBlob } from './png';
import type { ContractDiner, ContractSubject } from './subject';
import { randomUuid } from './subject';

/**
 * One diner, from a fresh account to a deleted one, through the diner routes
 * (`/api/reservations`, `/api/tabs/open-by-booking`, `/api/diner/*`).
 *
 * What it protects is mostly **what a diner may not do, and how they are
 * told**: open a tab before the table is held, review a place they never
 * visited, read somebody else's order, report their own review, keep using a
 * session after the account is gone. Each is its own named refusal, because each
 * has a different next step on the screen.
 *
 * And the K11/K12 halves of the addendum: favourites live on the account, a
 * second save or a merge never duplicates or removes, and the feed's unread
 * count is the one the badge shows.
 */
export function describeDinerJourneyContract(subject: ContractSubject): void {
  const reason = subject.unsupported('dinerJourney');
  const suite = reason ? describe.skip : describe;

  suite(`diner journey — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { fixtures } = subject;
    const branchId = fixtures.branchId;
    const NOTE = 'A quiet table, please.';
    const nowhere = '00000000-0000-4000-8000-00000000dead';

    let diner: ContractDiner;
    let stranger: ContractDiner;

    beforeAll(async () => {
      diner = await subject.newDiner();
      stranger = await subject.newDiner();
    });

    let booked: Promise<{ booking: Booking; command: CreateBookingCommand }> | null = null;

    /** Tomorrow evening, a two-top, with a note for the venue. Made once. */
    function book() {
      booked ??= (async () => {
        const floor = await diner.gateway.getSlotFloor({
          branchId,
          slotUtc: fixtures.tomorrowEveningUtc,
          partySize: 2,
          timeZoneId: fixtures.timeZoneId,
        });
        const table = floor?.tables.find((entry) => entry.isBookable);
        expect(table, 'nothing is bookable tomorrow evening').toBeDefined();

        const command: CreateBookingCommand = {
          commandId: randomUuid(),
          branchId,
          tableId: table!.tableId,
          slotUtc: fixtures.tomorrowEveningUtc,
          timeZoneId: fixtures.timeZoneId,
          partySize: 2,
          guestName: 'Contract Diner',
          guestPhone: diner.phoneE164,
          channel: 'app',
          // Trimmed; blank is no note (K9).
          note: `  ${NOTE}  `,
        };
        return { booking: await diner.gateway.createBooking(command), command };
      })();
      return booked;
    }

    // --- Booking -------------------------------------------------------------------

    it('books tomorrow evening with a note for the venue, lists it, and replays an identical command', async () => {
      const { booking, command } = await book();
      expect(booking.note).toBe(NOTE);

      const replay = await diner.gateway.createBooking(command);
      expect(replay.id, 'a retried booking created a second reservation').toBe(booking.id);
      expect(replay.code).toBe(booking.code);

      const mine = await diner.gateway.listBookings();
      const listed = [...mine.upcoming, ...mine.past].find((entry) => entry.id === booking.id);
      expect(listed, 'the booking is not among the diner’s own').toBeDefined();
      expect(listed!.note).toBe(NOTE);

      const theirs = await stranger.gateway.listBookings();
      expect([...theirs.upcoming, ...theirs.past].some((entry) => entry.id === booking.id)).toBe(
        false,
      );
    });

    it('refuses to open the tab of a booking whose table is not being held yet', async () => {
      const { booking } = await book();

      const attempt = diner.gateway.openTabByBooking({
        bookingCode: booking.code,
        commandId: randomUuid(),
      });
      await expect(attempt).rejects.toBeInstanceOf(BookingTooEarlyError);

      // From when it will work, and never later than the booking itself.
      const refusal = (await attempt.catch((error: unknown) => error)) as BookingTooEarlyError;
      if (refusal.earliestUtc !== null) {
        expect(Date.parse(refusal.earliestUtc)).toBeLessThanOrEqual(Date.parse(booking.slotUtc));
      }
    });

    // --- Reviews ---------------------------------------------------------------------

    it('refuses a first review with no visit as its own named outcome, and writes nothing', async () => {
      // A booking for tomorrow is not a visit: only a seated or completed one,
      // or a place on a tab at the branch, within 180 days (K8).
      await book();

      await expect(
        diner.gateway.saveMyBranchReview({
          branchId,
          rating: 5,
          text: 'Written by the contract run.',
        }),
      ).rejects.toBeInstanceOf(ReviewNeedsVisitError);
      await expect(diner.gateway.getMyBranchReview(branchId)).resolves.toBeNull();
    });

    it("reports somebody else's review, and a second report changes nothing", async () => {
      const page = await diner.gateway.getBranchReviews({ branchId });
      const review = page?.reviews[0];
      expect(
        review,
        'nobody has reviewed the fixture branch, so there is nothing to report',
      ).toBeDefined();

      const report = { reviewId: review!.reviewId, reason: 'spam' as const, note: 'Contract run.' };
      await expect(diner.gateway.reportReview(report)).resolves.toBeUndefined();
      await expect(diner.gateway.reportReview(report)).resolves.toBeUndefined();
    });

    it('refuses a report of a review that does not exist, and one with a reason nobody offers', async () => {
      await expect(
        diner.gateway.reportReview({ reviewId: randomUuid(), reason: 'spam' }),
      ).rejects.toBeInstanceOf(NotFoundError);

      const page = await diner.gateway.getBranchReviews({ branchId });
      const review = page?.reviews[0];
      expect(review, 'nobody has reviewed the fixture branch').toBeDefined();
      await expect(
        diner.gateway.reportReview({
          reviewId: review!.reviewId,
          reason: 'because' as unknown as ReviewReportReason,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    // --- Orders -----------------------------------------------------------------------

    it('has no orders for a fresh diner, and no way to read one that is not theirs', async () => {
      await expect(stranger.gateway.listDinerOrders()).resolves.toEqual([]);
      await expect(stranger.gateway.listDinerOrders('active')).resolves.toEqual([]);
      await expect(stranger.gateway.listDinerOrders('history')).resolves.toEqual([]);
      // Unknown and somebody else's answer identically.
      await expect(stranger.gateway.getDinerOrder(randomUuid())).resolves.toBeNull();
    });

    // --- The avatar -------------------------------------------------------------------

    let avatar: Promise<string> | null = null;
    function uploadAvatar() {
      avatar ??= diner.gateway.uploadDinerPhoto(pngBlob()).then((photo) => photo.photoId);
      return avatar;
    }

    it('puts an uploaded avatar on the profile', async () => {
      const photoId = await uploadAvatar();
      const profile = await diner.gateway.getDinerProfile();
      expect(profile.photo?.photoId).toBe(photoId);
      expect(profile.photo?.thumbnailUrl).toBeTruthy();
    });

    const bytesGap = subject.unsupported('photoBytes');
    (bytesGap ? it.skip : it)(
      `serves the avatar's thumbnail as an image${bytesGap ? ` (skipped: ${bytesGap})` : ''}`,
      async () => {
        await uploadAvatar();
        const profile = await diner.gateway.getDinerProfile();
        const served = await subject.fetchPhoto(profile.photo!.thumbnailUrl);
        expect(served.status).toBe(200);
        expect(served.contentType).toMatch(/^image\//u);
      },
    );

    // --- Favourites (K11) ---------------------------------------------------------------

    it('keeps favourites on the account: a second save is one entry, a merge adds and never removes', async () => {
      await expect(diner.gateway.listFavorites()).resolves.toEqual([]);

      await diner.gateway.addFavorite(branchId);
      await diner.gateway.addFavorite(branchId);
      const saved = await diner.gateway.listFavorites();
      expect(saved.map((entry) => entry.branchId)).toEqual([branchId]);
      expect(saved[0]!.listing.branchId).toBe(branchId);

      // Somebody else's account never sees it.
      await expect(stranger.gateway.listFavorites()).resolves.toEqual([]);

      const merged = await diner.gateway.mergeFavorites([branchId, branchId]);
      expect(merged.map((entry) => entry.branchId)).toEqual([branchId]);

      await diner.gateway.removeFavorite(branchId);
      await diner.gateway.removeFavorite(branchId);
      await expect(diner.gateway.listFavorites()).resolves.toEqual([]);

      const uploaded = await diner.gateway.mergeFavorites([branchId]);
      expect(uploaded.map((entry) => entry.branchId)).toEqual([branchId]);
      await diner.gateway.removeFavorite(branchId);
    });

    it('carries a distance on a favourite when a position is sent', async () => {
      await diner.gateway.addFavorite(branchId);
      const [favorite] = await diner.gateway.listFavorites({
        latitude: 40.1792,
        longitude: 44.4991,
      });
      expect(favorite?.branchId).toBe(branchId);
      // The fixture branch is located, so a null here is a projection that
      // dropped the coordinates, not a branch without any.
      expect(favorite!.listing.latitude).not.toBeNull();
      expect(favorite!.listing.distanceKm).not.toBeNull();
      await diner.gateway.removeFavorite(branchId);
    });

    it('refuses to save a place that is not listed', async () => {
      await expect(diner.gateway.addFavorite(nowhere)).rejects.toBeInstanceOf(NotFoundError);
    });

    // --- The notifications feed (K12) ---------------------------------------------------

    it('answers the feed with the unread count the badge shows, and marking read brings it to zero', async () => {
      await book();
      const page = await diner.gateway.listNotifications({ limit: 20 });

      for (const item of page.items) {
        expect(typeof item.kind).toBe('string');
        expect(Number.isNaN(Date.parse(item.createdAtUtc))).toBe(false);
      }
      // Across the whole feed, not the page.
      expect(page.unreadCount).toBeGreaterThanOrEqual(
        page.items.filter((item) => !item.read).length,
      );
      await expect(diner.gateway.getUnreadNotificationCount()).resolves.toBe(page.unreadCount);

      const newest = page.items[0];
      if (newest) {
        await diner.gateway.markNotificationsRead({ upTo: newest.notificationId });
      } else {
        // Ids that are not the diner's are ignored, never revealed.
        await diner.gateway.markNotificationsRead({ ids: [randomUuid()] });
      }
      await expect(diner.gateway.getUnreadNotificationCount()).resolves.toBe(0);
    });

    // --- Leaving (K2) -------------------------------------------------------------------

    it('deletes the account, after which the same session is refused as revoked', async () => {
      // A diner of its own: nothing after this may depend on the account.
      const leaving = await subject.newDiner();
      await leaving.gateway.addFavorite(branchId);

      await leaving.gateway.deleteDinerAccount({ password: leaving.password });

      // The first call is refused as revoked; its refused refresh signs the session
      // out, so every later call is simply not signed in (SessionRevokedError is a
      // 401 too, which is why the second check is on the status).
      await expect(leaving.gateway.getDinerProfile()).rejects.toBeInstanceOf(SessionRevokedError);
      await expect(leaving.gateway.listFavorites()).rejects.toMatchObject({ status: 401 });
    });
  });
}
