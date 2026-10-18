import { publicAuthorName, type ReviewReportReason } from '../contracts/reviews';

/**
 * Reviews, reports and takedowns, in memory — one store that the diner mock and
 * the console mock can share.
 *
 * On the server there is one `BranchReviews` table: a diner writes to it, a
 * venue and the platform moderate it, and the public list reads it. The two
 * mocks are separate gateways, so this store is what lets a review a diner
 * writes in mock mode show up on the console's Reviews screen, and a review the
 * console hides drop off the diner's list. Pass the same instance to both
 * (`createMockGateway({ reviews })`, `createConsoleMockGateway({ reviews })`);
 * each creates its own when given none.
 *
 * The store keeps state and nothing else. The rules — who may hide what, who
 * may report, the visit window — live in the gateways, next to the other rules
 * of the route they belong to.
 */

export type HiddenBy = 'venue' | 'platform';

export interface StoredReview {
  readonly reviewId: string;
  readonly branchId: string;
  readonly dinerUserId: string;
  /** By the K8 rule, from the display name at the last write. */
  authorName: string;
  rating: number;
  text: string | null;
  readonly createdAtUtc: string;
  updatedAtUtc: string;
  hidden: boolean;
  hiddenReason: string | null;
  hiddenAtUtc: string | null;
  /** Who hid it, which decides who may restore it. `null` while visible. */
  hiddenBy: HiddenBy | null;
  /**
   * How many times it went from shown to hidden. The server writes the
   * author's `review-hidden` notice on that transition only, so re-hiding a
   * hidden review — a new reason, or the platform taking over — counts nothing.
   */
  hideCount: number;
  /** Insertion order, to order two reviews written in the same millisecond. */
  readonly sequence: number;
}

export interface StoredReport {
  readonly reviewId: string;
  readonly dinerUserId: string;
  readonly reason: ReviewReportReason;
  readonly note: string | null;
  readonly createdAtUtc: string;
}

export interface MockReviewStore {
  /** Every review at a branch, hidden ones included, newest first written first. */
  all(branchId: string): readonly StoredReview[];
  /** What the public sees: hidden reviews left out. */
  visible(branchId: string): readonly StoredReview[];
  find(reviewId: string): StoredReview | null;
  mine(branchId: string, dinerUserId: string): StoredReview | null;
  /**
   * Write or revise. The same stars and text again change nothing, the
   * revision time and the author name included (K8).
   */
  save(input: {
    readonly branchId: string;
    readonly dinerUserId: string;
    readonly displayName: string | null;
    readonly rating: number;
    readonly text: string | null;
    readonly atUtc: string;
  }): StoredReview;
  /** Account deletion (K2): every review by the diner goes, and its reports with it. */
  deleteByDiner(dinerUserId: string): void;
  /** One report per diner per review; a repeat is ignored. */
  report(report: StoredReport): void;
  reports(reviewId: string): readonly StoredReport[];
  /** The platform set a review's reports aside: they are gone, the review stays as it was. */
  dismissReports(reviewId: string): void;
  setVisibility(input: {
    readonly reviewId: string;
    readonly hidden: boolean;
    readonly reason: string | null;
    readonly by: HiddenBy;
    readonly atUtc: string;
  }): StoredReview;
}

export interface MockReviewStoreOptions {
  readonly now?: () => Date;
  /**
   * Start with a handful of reviews — one reported twice, one hidden by the
   * venue, one hidden by the platform — so every state of the moderation screen
   * is reachable on first load. The authors are placeholders, not people.
   */
  readonly seed?: boolean;
}

const DAY_MS = 24 * 60 * 60_000;

export function createMockReviewStore(options: MockReviewStoreOptions = {}): MockReviewStore {
  const now = options.now ?? (() => new Date());
  const reviews = new Map<string, StoredReview>();
  const reports: StoredReport[] = [];
  let sequence = 0;

  const newestFirst = (a: StoredReview, b: StoredReview) =>
    b.createdAtUtc.localeCompare(a.createdAtUtc) || b.sequence - a.sequence;

  function insert(
    input: Omit<StoredReview, 'sequence' | 'authorName' | 'hideCount'> & {
      displayName: string | null;
    },
  ): StoredReview {
    const { displayName, ...rest } = input;
    const stored: StoredReview = {
      ...rest,
      hideCount: rest.hidden ? 1 : 0,
      authorName: publicAuthorName(displayName),
      sequence: (sequence += 1),
    };
    reviews.set(stored.reviewId, stored);
    return stored;
  }

  if (options.seed) {
    const ago = (days: number) => new Date(now().getTime() - days * DAY_MS).toISOString();
    const seed = (
      index: number,
      branchId: string,
      displayName: string,
      rating: number,
      text: string,
      days: number,
      hiddenBy: HiddenBy | null = null,
      hiddenReason: string | null = null,
    ) =>
      insert({
        reviewId: `review-seed-${index}`,
        branchId,
        dinerUserId: `diner-seed-${index}`,
        displayName,
        rating,
        text,
        createdAtUtc: ago(days),
        updatedAtUtc: ago(days),
        hidden: hiddenBy !== null,
        hiddenReason,
        hiddenAtUtc: hiddenBy !== null ? ago(days - 1) : null,
        hiddenBy,
      });

    seed(
      1,
      'b-lumen-north',
      'Test Diner',
      5,
      'Placeholder review: quick coffee, friendly staff.',
      12,
    );
    const reported = seed(
      2,
      'b-lumen-north',
      'Sample Guest',
      2,
      'Placeholder review: a long wait.',
      6,
    );
    seed(
      3,
      'b-lumen-north',
      'Mock Visitor',
      1,
      'Placeholder review hidden by the venue.',
      4,
      'venue',
      'Not about this venue.',
    );
    seed(
      4,
      'b-lumen-cascade',
      'Demo Reviewer',
      1,
      'Placeholder review hidden by the platform.',
      3,
      'platform',
      'Personal information.',
    );

    /*
     * Cascade Cafe's branch, as the Reviews artboard draws it: two reported
     * reviews that break the rules (a phone number, an advert), the ordinary
     * ones, and one the platform already hid for being about another venue.
     */
    const cascade = 'b-cascade-center';
    const phone = seed(
      11,
      cascade,
      'Աննա Պետրոսյան',
      1,
      'Մատուցողը կոպիտ էր, իսկ մենեջերը (+374 91 •• •• 12) նույնիսկ չպատասխանեց։ Զանգեք նրան։',
      0,
    );
    const advert = seed(
      12,
      cascade,
      'Karen Mkrtchyan',
      5,
      'Լավագույն սուրճը Կասկադում։ Ավելի էժան տարբերակի համար այցելեք cheap-coffee-yerevan.am։',
      1,
    );
    seed(
      13,
      cascade,
      'Լիլիթ Սարգսյան',
      5,
      'Տեռասից տեսարանը հիասքանչ է, ամրագրումը տևեց մեկ րոպե։',
      1,
    );
    seed(14, cascade, 'Arthur', 3, 'Ուտելիքը լավն էր, բայց ուրբաթ երեկոյան սպասեցինք 25 րոպե։', 3);
    seed(
      15,
      cascade,
      'Մարիամ Աբրահամյան',
      2,
      'Այս կարծիքը Garden Bistro-ի մասին է, սխալմամբ գրեցի այստեղ։',
      6,
      'platform',
      'Գրված է այլ վայրի մասին',
    );
    seed(16, cascade, 'Davit Hakobyan', 4, 'Հաճելի մթնոլորտ, լավ երաժշտություն։', 9);
    const reportBy = (reviewId: string, n: number, reason: StoredReport['reason']) => {
      for (let i = 0; i < n; i += 1) {
        reports.push({
          reviewId,
          dinerUserId: `diner-report-${reviewId}-${i}`,
          reason,
          note: null,
          createdAtUtc: ago(0),
        });
      }
    };
    reportBy(phone.reviewId, 3, 'personal-info');
    reportBy(advert.reviewId, 2, 'spam');

    reports.push(
      {
        reviewId: reported.reviewId,
        dinerUserId: 'diner-seed-5',
        reason: 'spam',
        note: null,
        createdAtUtc: ago(5),
      },
      {
        reviewId: reported.reviewId,
        dinerUserId: 'diner-seed-6',
        reason: 'not-a-visit',
        note: null,
        createdAtUtc: ago(2),
      },
    );
  }

  return {
    all: (branchId) =>
      [...reviews.values()].filter((r) => r.branchId === branchId).sort(newestFirst),

    visible: (branchId) =>
      [...reviews.values()].filter((r) => r.branchId === branchId && !r.hidden).sort(newestFirst),

    find: (reviewId) => reviews.get(reviewId) ?? null,

    mine: (branchId, dinerUserId) =>
      [...reviews.values()].find((r) => r.branchId === branchId && r.dinerUserId === dinerUserId) ??
      null,

    save({ branchId, dinerUserId, displayName, rating, text, atUtc }) {
      const existing = [...reviews.values()].find(
        (r) => r.branchId === branchId && r.dinerUserId === dinerUserId,
      );
      if (existing) {
        if (existing.rating === rating && existing.text === text) return existing;
        existing.rating = rating;
        existing.text = text;
        existing.updatedAtUtc = atUtc;
        existing.authorName = publicAuthorName(displayName);
        return existing;
      }
      return insert({
        reviewId: `review-${branchId}-${dinerUserId}`,
        branchId,
        dinerUserId,
        displayName,
        rating,
        text,
        createdAtUtc: atUtc,
        updatedAtUtc: atUtc,
        hidden: false,
        hiddenReason: null,
        hiddenAtUtc: null,
        hiddenBy: null,
      });
    },

    deleteByDiner(dinerUserId) {
      for (const [id, review] of reviews) {
        if (review.dinerUserId !== dinerUserId) continue;
        reviews.delete(id);
        for (let i = reports.length - 1; i >= 0; i -= 1) {
          if (reports[i]!.reviewId === id) reports.splice(i, 1);
        }
      }
    },

    report(report) {
      if (
        reports.some((r) => r.reviewId === report.reviewId && r.dinerUserId === report.dinerUserId)
      ) {
        return;
      }
      reports.push(report);
    },

    reports: (reviewId) => reports.filter((r) => r.reviewId === reviewId),

    dismissReports(reviewId) {
      for (let i = reports.length - 1; i >= 0; i -= 1) {
        if (reports[i]!.reviewId === reviewId) reports.splice(i, 1);
      }
    },

    setVisibility({ reviewId, hidden, reason, by, atUtc }) {
      const review = reviews.get(reviewId);
      if (!review) throw new Error(`No review ${reviewId}.`);
      if (hidden && !review.hidden) review.hideCount += 1;
      review.hidden = hidden;
      review.hiddenReason = hidden ? reason : null;
      review.hiddenAtUtc = hidden ? atUtc : null;
      review.hiddenBy = hidden ? by : null;
      return review;
    },
  };
}
