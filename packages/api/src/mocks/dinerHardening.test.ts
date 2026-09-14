import { describe, expect, it } from 'vitest';
import type { CreateBookingCommand } from '../contracts/booking';
import {
  BookingsNotAcceptedError,
  CannotReportOwnReviewError,
  InvalidCredentialsError,
  PhoneNotVerifiedError,
  ReviewNeedsVisitError,
} from '../contracts/errors';
import { NotFoundError, SessionRevokedError, UnauthorizedError, ValidationError } from '../errors';
import type { YallaGateway } from '../gateway';
import { SEEDED_ACCOUNT } from './accounts';
import { createConsoleMockGateway } from './consoleMock';
import { createMockGateway } from './mockGateway';
import { createMockReviewStore } from './reviewStore';
import { mockTableCode } from './tableCodes';

/**
 * The diner mock against the hardening contract and its addendum, rule by rule,
 * so a screen built in mock mode meets the refusals production will give it.
 */

const NORTH = 'b-lumen-north';
const CASCADE = 'b-lumen-cascade';
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

function clock(start = '2026-09-15T08:00:00.000Z') {
  let t = Date.parse(start);
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

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

/** The seeded account, signed in with its password and its number confirmed by code. */
async function signInSeeded(gateway: YallaGateway): Promise<void> {
  await gateway.loginDiner({
    identifier: SEEDED_ACCOUNT.username,
    password: SEEDED_ACCOUNT.password,
  });
  const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
}

/** A fresh password account on a test-range number, confirmed by code and signed in. */
async function signUp(gateway: YallaGateway, n: number): Promise<string> {
  const phoneE164 = `+37491000${100 + n}`;
  const result = await gateway.registerDiner({
    username: `testdiner${n}`,
    email: `testdiner${n}@example.test`,
    password: 'correct horse',
    phoneE164,
    displayName: 'Test Diner',
  });
  const challenge = await gateway.requestPhoneCode(phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
  return result.dinerUserId;
}

let commandSequence = 0;

/** A booking for two at the first table the room offers at that slot. */
async function bookAt(
  gateway: YallaGateway,
  branchId: string,
  slotUtc: string,
  extra: Partial<CreateBookingCommand> = {},
) {
  const floor = await gateway.getSlotFloor({ branchId, slotUtc, partySize: 2 });
  const table = floor!.tables.find((t) => t.isBookable) ?? floor!.tables[0]!;
  return gateway.createBooking({
    commandId: `cmd-${(commandSequence += 1)}`,
    branchId,
    tableId: table.tableId,
    slotUtc,
    timeZoneId: 'Asia/Yerevan',
    partySize: 2,
    guestName: 'Test Diner',
    guestPhone: '+37491000199',
    channel: 'app',
    ...extra,
  });
}

describe('reviews in the mock (K8)', () => {
  it('needs a visit in the last 180 days for a first review, and never for a revision', async () => {
    const reviews = createMockReviewStore();
    const gateway = createMockGateway({ reviews });
    await signInSeeded(gateway);

    // The seed's visit is at Lumen North.
    await expect(gateway.saveMyBranchReview({ branchId: NORTH, rating: 5 })).resolves.toMatchObject(
      {
        rating: 5,
        publicAuthorName: 'Lurj A.',
        hidden: false,
      },
    );
    expect(
      await caught(gateway.saveMyBranchReview({ branchId: CASCADE, rating: 4 })),
    ).toBeInstanceOf(ReviewNeedsVisitError);

    // A review already there, from before the rule, is revised freely.
    reviews.save({
      branchId: CASCADE,
      dinerUserId: SEEDED_ACCOUNT.id,
      displayName: SEEDED_ACCOUNT.displayName,
      rating: 3,
      text: null,
      atUtc: new Date().toISOString(),
    });
    await expect(
      gateway.saveMyBranchReview({ branchId: CASCADE, rating: 4 }),
    ).resolves.toMatchObject({
      rating: 4,
    });
  });

  it('does not count a visit older than 180 days', async () => {
    const gateway = createMockGateway({
      visits: [
        {
          dinerUserId: SEEDED_ACCOUNT.id,
          branchId: NORTH,
          atUtc: new Date(Date.now() - 181 * DAY_MS).toISOString(),
        },
      ],
    });
    await signInSeeded(gateway);
    expect(await caught(gateway.saveMyBranchReview({ branchId: NORTH, rating: 5 }))).toBeInstanceOf(
      ReviewNeedsVisitError,
    );
  });

  it('counts a booking the diner was seated for through "I\'m at my table"', async () => {
    const time = clock();
    const gateway = createMockGateway({ now: time.now, visits: [], simulateJoiners: false });
    await signUp(gateway, 1);
    const booking = await bookAt(
      gateway,
      NORTH,
      new Date(time.now().getTime() + 2 * HOUR_MS).toISOString(),
    );

    expect(await caught(gateway.saveMyBranchReview({ branchId: NORTH, rating: 5 }))).toBeInstanceOf(
      ReviewNeedsVisitError,
    );

    time.advance(2 * HOUR_MS - 10 * 60_000);
    await gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'open-1' });
    await expect(gateway.saveMyBranchReview({ branchId: NORTH, rating: 5 })).resolves.toMatchObject(
      {
        rating: 5,
      },
    );
  });

  it('changes nothing on an identical save, and keeps a revised review in its first-written place', async () => {
    const time = clock();
    const reviews = createMockReviewStore({ now: time.now });
    const gateway = createMockGateway({
      now: time.now,
      reviews,
      visits: [
        { dinerUserId: SEEDED_ACCOUNT.id, branchId: NORTH, atUtc: time.now().toISOString() },
      ],
    });
    const other = { branchId: NORTH, dinerUserId: 'diner-other', displayName: 'Test Diner' };
    reviews.save({ ...other, rating: 4, text: 'Fine.', atUtc: time.now().toISOString() });
    time.advance(60_000);
    await signInSeeded(gateway);

    const first = await gateway.saveMyBranchReview({ branchId: NORTH, rating: 5, text: 'Great.' });
    time.advance(60_000);
    const again = await gateway.saveMyBranchReview({
      branchId: NORTH,
      rating: 5,
      text: ' Great. ',
    });
    expect(again.updatedAtUtc).toBe(first.updatedAtUtc);

    time.advance(60_000);
    reviews.save({
      ...other,
      rating: 2,
      text: 'Changed my mind.',
      atUtc: time.now().toISOString(),
    });

    const page = await gateway.getBranchReviews({ branchId: NORTH });
    expect(page?.reviews.map((r) => [r.authorName, r.edited])).toEqual([
      ['Lurj A.', false],
      ['Test D.', true],
    ]);
    expect(page?.rating).toBe(3.5);
  });

  it('drops a review the console took down from the list and the rating, and tells its author', async () => {
    const reviews = createMockReviewStore();
    const gateway = createMockGateway({ reviews });
    const consoleGateway = createConsoleMockGateway({ reviews });
    await signInSeeded(gateway);

    const mine = await gateway.saveMyBranchReview({ branchId: NORTH, rating: 1, text: 'Awful.' });
    await consoleGateway.setReviewVisibility(mine.reviewId, {
      hidden: true,
      reason: 'Personal information.',
    });

    expect(await gateway.getBranchReviews({ branchId: NORTH })).toMatchObject({
      reviewCount: 0,
      rating: null,
      reviews: [],
    });
    const detail = await gateway.getBranchDetail(NORTH);
    expect(detail?.listing.rating).toBeNull();
    expect(detail?.recentReviews).toEqual([]);
    expect(await gateway.getMyBranchReview(NORTH)).toMatchObject({ hidden: true });

    const feed = await gateway.listNotifications();
    expect(feed.items.map((n) => [n.kind, n.params['reviewId']])).toEqual([
      ['review-hidden', mine.reviewId],
    ]);
    expect(feed.unreadCount).toBe(1);
  });
});

describe('the app booking gate and the note in the mock (K9)', () => {
  it('refuses an app booking where online bookings are off, and says so on the detail', async () => {
    const gateway = createMockGateway();
    await signUp(gateway, 2);

    expect((await gateway.getBranchDetail('b-tumanyan-main'))?.acceptsAppBookings).toBe(false);
    expect((await gateway.getBranchDetail(NORTH))?.acceptsAppBookings).toBe(true);
    expect(
      await caught(bookAt(gateway, 'b-tumanyan-main', new Date(Date.now() + DAY_MS).toISOString())),
    ).toBeInstanceOf(BookingsNotAcceptedError);
  });

  it('keeps the note trimmed and blank as none, and refuses one over 500 characters by name', async () => {
    const gateway = createMockGateway();
    await signUp(gateway, 3);
    const slotUtc = new Date(Date.now() + DAY_MS).toISOString();

    const noted = await bookAt(gateway, NORTH, slotUtc, { note: '  A quiet corner, please.  ' });
    expect(noted.note).toBe('A quiet corner, please.');
    expect((await gateway.getBooking(noted.id))?.note).toBe('A quiet corner, please.');
    expect((await bookAt(gateway, NORTH, slotUtc, { note: '   ' })).note).toBeNull();

    const refusal = await caught(bookAt(gateway, NORTH, slotUtc, { note: 'x'.repeat(501) }));
    expect((refusal as ValidationError).violations).toEqual([
      { field: 'note', message: 'At most 500 characters.', bound: 'max', max: 500 },
    ]);
  });
});

describe('reporting a review in the mock', () => {
  it("reports somebody else's review once, and refuses the diner's own, a hidden one and a bad body", async () => {
    const reviews = createMockReviewStore();
    const other = reviews.save({
      branchId: NORTH,
      dinerUserId: 'diner-other',
      displayName: 'Test Diner',
      rating: 1,
      text: 'Bad.',
      atUtc: new Date().toISOString(),
    });
    const gateway = createMockGateway({ reviews });
    await signInSeeded(gateway);
    const mine = await gateway.saveMyBranchReview({ branchId: NORTH, rating: 5 });

    await gateway.reportReview({
      reviewId: other.reviewId,
      reason: 'spam',
      note: '  An advert.  ',
    });
    await gateway.reportReview({ reviewId: other.reviewId, reason: 'offensive' });
    expect(reviews.reports(other.reviewId)).toEqual([
      expect.objectContaining({
        dinerUserId: SEEDED_ACCOUNT.id,
        reason: 'spam',
        note: 'An advert.',
      }),
    ]);

    expect(
      await caught(gateway.reportReview({ reviewId: mine.reviewId, reason: 'spam' })),
    ).toBeInstanceOf(CannotReportOwnReviewError);
    expect(
      await caught(gateway.reportReview({ reviewId: 'review-nowhere', reason: 'spam' })),
    ).toBeInstanceOf(NotFoundError);

    reviews.setVisibility({
      reviewId: other.reviewId,
      hidden: true,
      reason: 'Off topic.',
      by: 'venue',
      atUtc: new Date().toISOString(),
    });
    expect(
      await caught(gateway.reportReview({ reviewId: other.reviewId, reason: 'spam' })),
    ).toBeInstanceOf(NotFoundError);
    // The body is read first, whatever the review.
    const bad = await caught(
      gateway.reportReview({
        reviewId: other.reviewId,
        reason: 'boring' as never,
        note: 'x'.repeat(501),
      }),
    );
    expect(named(bad).map(([field]) => field)).toEqual(['reason', 'note']);
  });
});

describe('favourites in the mock (K11)', () => {
  it('saves idempotently, lists newest first with the listing, and unsaves idempotently', async () => {
    const time = clock();
    const gateway = createMockGateway({ now: time.now });
    // An unverified account may keep hearts.
    await gateway.loginDiner({
      identifier: SEEDED_ACCOUNT.username,
      password: SEEDED_ACCOUNT.password,
    });

    await gateway.addFavorite(NORTH);
    time.advance(1000);
    await gateway.addFavorite(CASCADE);
    await gateway.addFavorite(NORTH);

    const list = await gateway.listFavorites({ latitude: 40.18, longitude: 44.51 });
    expect(list.map((f) => f.branchId)).toEqual([CASCADE, NORTH]);
    expect(list[0]?.listing.branchId).toBe(CASCADE);
    expect(list[0]?.listing.distanceKm).not.toBeNull();

    await gateway.removeFavorite(NORTH);
    await gateway.removeFavorite(NORTH);
    expect((await gateway.listFavorites()).map((f) => f.branchId)).toEqual([CASCADE]);
  });

  it('refuses a branch that is unknown or not listed', async () => {
    const gateway = createMockGateway();
    await gateway.loginDiner({
      identifier: SEEDED_ACCOUNT.username,
      password: SEEDED_ACCOUNT.password,
    });
    expect(await caught(gateway.addFavorite('b-nowhere'))).toBeInstanceOf(NotFoundError);
    expect(await caught(gateway.addFavorite('b-dolmama-dalma'))).toBeInstanceOf(NotFoundError);
  });

  it('merges hearts made while signed out: adds what is missing, never removes, skips what is gone', async () => {
    const gateway = createMockGateway();
    await gateway.loginDiner({
      identifier: SEEDED_ACCOUNT.username,
      password: SEEDED_ACCOUNT.password,
    });
    await gateway.addFavorite(NORTH);

    const merged = await gateway.mergeFavorites([CASCADE, 'b-nowhere', CASCADE]);
    expect(merged.map((f) => f.branchId).sort()).toEqual([CASCADE, NORTH].sort());
    expect(await gateway.mergeFavorites([])).toHaveLength(2);

    expect(
      named(await caught(gateway.mergeFavorites(Array.from({ length: 501 }, (_, i) => `b-${i}`)))),
    ).toEqual([['branchIds', 'max']]);
  });

  it("keeps each account's hearts to itself, and needs somebody signed in", async () => {
    const gateway = createMockGateway();
    expect(await caught(gateway.listFavorites())).toBeInstanceOf(UnauthorizedError);

    await gateway.loginDiner({
      identifier: SEEDED_ACCOUNT.username,
      password: SEEDED_ACCOUNT.password,
    });
    await gateway.addFavorite(NORTH);
    await signUp(gateway, 4);
    expect(await gateway.listFavorites()).toEqual([]);
  });
});

describe('the notifications feed in the mock (K12)', () => {
  it('writes a reminder once a booking is two hours away, pages it, and marks it read', async () => {
    const time = clock();
    const gateway = createMockGateway({ now: time.now });
    await signUp(gateway, 5);
    const bookings = [];
    for (const hours of [5, 6, 7]) {
      bookings.push(
        await bookAt(
          gateway,
          NORTH,
          new Date(time.now().getTime() + hours * HOUR_MS).toISOString(),
        ),
      );
    }
    expect((await gateway.listNotifications()).items).toEqual([]);

    time.advance(5.5 * HOUR_MS);
    expect(await gateway.getUnreadNotificationCount()).toBe(3);

    const first = await gateway.listNotifications({ limit: 2 });
    expect(first.items.map((n) => n.reservationId)).toEqual([bookings[2]!.id, bookings[1]!.id]);
    expect(first.items[0]).toMatchObject({
      kind: 'booking-reminder',
      branchId: NORTH,
      read: false,
    });
    expect(first.nextCursor).not.toBeNull();

    const second = await gateway.listNotifications({ before: first.nextCursor, limit: 2 });
    expect(second.items.map((n) => n.reservationId)).toEqual([bookings[0]!.id]);
    expect(second.nextCursor).toBeNull();
    // Reading again writes no second reminder for the same booking.
    expect((await gateway.listNotifications()).items).toHaveLength(3);

    await gateway.markNotificationsRead({ ids: [first.items[1]!.notificationId, 'ntf-not-yours'] });
    expect(await gateway.getUnreadNotificationCount()).toBe(2);
    await gateway.markNotificationsRead({ upTo: first.items[0]!.notificationId });
    expect(await gateway.getUnreadNotificationCount()).toBe(0);
  });
});

describe('deleting the account in the mock (K2)', () => {
  it('needs the password on a password account, and ends the session with what the diner wrote', async () => {
    const reviews = createMockReviewStore();
    const gateway = createMockGateway({ reviews });
    await signInSeeded(gateway);
    await gateway.saveMyBranchReview({ branchId: NORTH, rating: 5 });
    await gateway.addFavorite(NORTH);

    expect(named(await caught(gateway.deleteDinerAccount({})))).toEqual([['password', 'required']]);
    expect(await caught(gateway.deleteDinerAccount({ password: 'not it' }))).toBeInstanceOf(
      InvalidCredentialsError,
    );

    await gateway.deleteDinerAccount({ password: SEEDED_ACCOUNT.password });

    expect(reviews.all(NORTH)).toEqual([]);
    expect(await caught(gateway.getDinerProfile())).toBeInstanceOf(SessionRevokedError);
    expect(await caught(gateway.listFavorites())).toBeInstanceOf(SessionRevokedError);
    // The number, the username and the email can be registered again.
    await expect(
      gateway.registerDiner({
        username: SEEDED_ACCOUNT.username,
        email: SEEDED_ACCOUNT.email,
        password: 'another password',
        phoneE164: SEEDED_ACCOUNT.phoneE164,
        displayName: 'Test Diner',
      }),
    ).resolves.toMatchObject({ isNewAccount: true });
  });

  it('needs a fresh code for its own number on an account with no password', async () => {
    const gateway = createMockGateway();
    const phone = '+37499000102';
    const signIn = await gateway.requestPhoneCode(phone);
    await gateway.verifyPhoneCode({ challengeId: signIn.challengeId, code: signIn.devCode! });

    expect(named(await caught(gateway.deleteDinerAccount({})))).toEqual([['code', 'required']]);
    // The sign-in code was spent; nothing is waiting to be matched.
    expect(await caught(gateway.deleteDinerAccount({ code: signIn.devCode! }))).toBeInstanceOf(
      InvalidCredentialsError,
    );

    const confirm = await gateway.requestPhoneCode(phone);
    expect(await caught(gateway.deleteDinerAccount({ code: '000000' }))).toBeInstanceOf(
      InvalidCredentialsError,
    );
    await gateway.deleteDinerAccount({ code: confirm.devCode! });
    expect(await caught(gateway.getDinerProfile())).toBeInstanceOf(SessionRevokedError);
  });

  it('refuses an account whose number was never confirmed', async () => {
    const gateway = createMockGateway();
    await gateway.registerDiner({
      username: 'unconfirmed1',
      email: 'unconfirmed1@example.test',
      password: 'long enough',
      phoneE164: '+37491000103',
      displayName: 'Test Diner',
    });
    expect(await caught(gateway.deleteDinerAccount({ password: 'long enough' }))).toBeInstanceOf(
      PhoneNotVerifiedError,
    );
  });
});

describe('naming yourself on a tab in the mock', () => {
  it("sets the name on this phone's participant, and refuses a blank one by name", async () => {
    const gateway = createMockGateway({ simulateJoiners: false });
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t1'),
      commandId: 'scan-1',
    });

    const change = await gateway.setTabDisplayName(scan.tab.tabId, '  Tigran  ');
    expect(change).toMatchObject({
      participantId: scan.tab.me.participantId,
      displayName: 'Tigran',
    });

    const refusal = await caught(gateway.setTabDisplayName(scan.tab.tabId, '   '));
    expect(refusal).toBeInstanceOf(ValidationError);
    expect((refusal as ValidationError).field).toBe('displayName');
  });
});
