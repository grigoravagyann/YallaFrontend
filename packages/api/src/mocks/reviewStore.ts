import {
  publicAuthorName,
  type ReplyAuthorRole,
  type ReviewReply,
  type ReviewReportReason,
} from '../contracts/reviews';

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
  /** The venue person who hid it, by name; null while visible or when the platform hid it. */
  hiddenByName: string | null;
  /** The venue's one public reply. */
  reply: ReviewReply | null;
  /**
   * How many times a reply went from none to one: the server writes the
   * author's `review-replied` notice on that transition only, never on an edit.
   */
  replyCount: number;
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
  /** The reports nobody has set aside: what `reportCount` and the reported filter read. */
  reports(reviewId: string): readonly StoredReport[];
  /**
   * The platform set a review's reports aside: they are kept (each is still a
   * diner's word) but no longer count; the review stays as it was.
   */
  dismissReports(reviewId: string): void;
  /** Undo the last dismissal: the reports it set aside count again. */
  restoreReports(reviewId: string): void;
  setVisibility(input: {
    readonly reviewId: string;
    readonly hidden: boolean;
    readonly reason: string | null;
    readonly by: HiddenBy;
    /** The venue person's name, for "hidden by"; ignored for the platform. */
    readonly byName?: string | null;
    readonly atUtc: string;
  }): StoredReview;
  /**
   * Write the venue's reply or change its text; the writer signs it. The same
   * text again changes nothing, its time included. True when it was the first.
   */
  setReply(input: {
    readonly reviewId: string;
    readonly text: string;
    readonly authorName: string;
    readonly authorRole: ReplyAuthorRole;
    readonly atUtc: string;
  }): { readonly review: StoredReview; readonly first: boolean };
  /** Take the reply down; nothing to take down changes nothing. */
  removeReply(reviewId: string): StoredReview;
}

export interface MockReviewStoreOptions {
  readonly now?: () => Date;
  /**
   * Start with a handful of reviews — one reported twice, one hidden by the
   * venue, one hidden by the platform — so every state of the moderation screen
   * is reachable on first load. The authors are placeholders, not people.
   */
  readonly seed?: boolean;
  /**
   * Two dozen published reviews at Northern Avenue (b-lumen-north), a few with the
   * venue's reply, for walking the public page in mock mode. Not for tests that
   * read an unreviewed branch.
   */
  readonly showcase?: boolean | undefined;
}

const DAY_MS = 24 * 60 * 60_000;

export function createMockReviewStore(options: MockReviewStoreOptions = {}): MockReviewStore {
  const now = options.now ?? (() => new Date());
  const reviews = new Map<string, StoredReview>();
  const reports: StoredReport[] = [];
  /** The reports set aside, per review, by the dismissal that set them aside. */
  const dismissed = new Map<string, StoredReport[]>();
  let sequence = 0;

  const newestFirst = (a: StoredReview, b: StoredReview) =>
    b.createdAtUtc.localeCompare(a.createdAtUtc) || b.sequence - a.sequence;

  function insert(
    input: Omit<
      StoredReview,
      'sequence' | 'authorName' | 'hideCount' | 'hiddenByName' | 'reply' | 'replyCount'
    > & {
      displayName: string | null;
      hiddenByName?: string | null;
      reply?: ReviewReply | null;
    },
  ): StoredReview {
    const { displayName, hiddenByName = null, reply = null, ...rest } = input;
    const stored: StoredReview = {
      ...rest,
      hiddenByName,
      reply,
      replyCount: reply ? 1 : 0,
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
    const answered = seed(
      14,
      cascade,
      'Arthur',
      3,
      'Ուտելիքը լավն էր, բայց ուրբաթ երեկոյան սպասեցինք 25 րոպե։',
      3,
    );
    // Answered by the owner, as the Reviews artboard shows a reply.
    answered.reply = {
      text: 'Շնորհակալություն, Arthur։ Ուրբաթ երեկոները հիմա երկու մատուցող ավելի ունենք։',
      authorName: 'Aram Hakobyan',
      authorRole: 'owner',
      createdAtUtc: ago(2),
      updatedAtUtc: ago(2),
      edited: false,
    };
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

  if (options.showcase) {
    /*
     * Northern Avenue as a venue a few months in: two dozen reviews in the
     * languages its guests write in, mostly good, a few answered. More than a
     * page of twenty, so the public page's "see all" has a second page.
     */
    const ago = (days: number, hours = 0) =>
      new Date(now().getTime() - days * DAY_MS - hours * 3_600_000).toISOString();
    const branchId = 'b-lumen-north';
    const reply = (
      text: string,
      authorName: string,
      authorRole: ReplyAuthorRole,
      days: number,
    ): ReviewReply => ({
      text,
      authorName,
      authorRole,
      createdAtUtc: ago(days),
      updatedAtUtc: ago(days),
      edited: false,
    });
    const showcase: readonly (readonly [
      name: string,
      rating: number,
      text: string | null,
      days: number,
      reply?: ReviewReply,
    ])[] = [
      [
        'Ani Martirosyan',
        5,
        'Սուրճը քաղաքի լավագույններից է, իսկ պատուհանի մոտ սեղանը պատրաստ էր ճիշտ ժամին։',
        1,
      ],
      [
        'Davit Karapetyan',
        4,
        'Նախաճաշը համեղ էր, բայց շաբաթ առավոտյան մի քիչ աղմկոտ էր։',
        3,
        reply(
          'Շնորհակալություն, Դավիթ։ Շաբաթ օրերին խորհուրդ ենք տալիս հետևի սրահը՝ այնտեղ ավելի հանգիստ է։',
          'Aram Hakobyan',
          'owner',
          2,
        ),
      ],
      ['Mariam Sargsyan', 5, 'Booked a table for six on the web in a minute. Great flat white.', 6],
      ['Ольга Петрова', 5, 'Очень уютно, вкусные сырники и отличный фильтр-кофе.', 9],
      ['Aram Hovhannisyan', 5, null, 12],
      [
        'Lilit Grigoryan',
        3,
        'Համեղ էր, բայց աղանդերին 20 րոպե սպասեցինք։',
        16,
        reply(
          'Ներողություն սպասելու համար, Լիլիթ։ Այդ օրը խոհանոցում մեկ հոգի պակաս էր, արդեն ուղղել ենք։',
          'Nare Sargsyan',
          'generalManager',
          15,
        ),
      ],
      [
        'Tigran Avetisyan',
        5,
        'Լավագույն տեղը աշխատելու համար՝ արագ Wi-Fi և հանգիստ երաժշտություն։',
        20,
      ],
      [
        'James Miller',
        4,
        'Lovely terrace, friendly staff. The avocado toast could use more salt.',
        24,
      ],
      ['Анна Смирнова', 5, 'Заказали столик через сайт — всё было готово к нашему приходу.', 29],
      ['Gayane Petrosyan', 5, 'Բնական գինին երեկոյան՝ հաճելի անակնկալ։', 33],
      ['Hayk Melkonyan', 4, null, 38],
      [
        'Sofia Rossi',
        2,
        'Our booking was not found at first and we waited at the door for ten minutes.',
        44,
        reply(
          'We are sorry, Sofia. A tablet lost its connection that evening; it now warns the host when it does.',
          'Aram Hakobyan',
          'owner',
          43,
        ),
      ],
      ['Narek Ghazaryan', 5, 'Ամեն անգամ վերադառնում ենք կապուչինոյի համար։', 51],
      [
        'Елена Ковалёва',
        4,
        'Хорошее место для завтрака, но по выходным лучше бронировать заранее.',
        58,
      ],
      ['Arpi Simonyan', 5, 'Շատ ջերմ սպասարկում և գեղեցիկ ինտերիեր։', 64],
      ['Michael Brown', 5, 'Best coffee we had in Yerevan.', 71],
      ['Karen Abrahamyan', 3, 'Լավ էր, բայց գները մի փոքր բարձր են։', 79],
      ['Sona Hakobyan', 5, null, 86],
      ['Armen Vardanyan', 5, 'Հիանալի նախաճաշ ամբողջ ընտանիքով։', 94],
      [
        'Мария Иванова',
        4,
        'Уютно и вкусно, только музыка была громковата.',
        103,
        reply(
          'Спасибо, Мария! Мы сделали музыку в зале тише по утрам.',
          'Nare Sargsyan',
          'generalManager',
          101,
        ),
      ],
      ['Vahe Mkrtchyan', 5, 'Ամենալավ ֆիլտր սուրճը քաղաքում։', 117],
      ['Emma Wilson', 5, 'Quiet back room, good for a work call. Will come back.', 132],
      ['Ruzanna Harutyunyan', 4, 'Հաճելի մթնոլորտ, բայց երեկոյան տեղ գտնելը դժվար է։', 150],
      ['Gor Asatryan', 5, 'Առաջին անգամն էր, անպայման կվերադառնանք։', 171],
    ];
    showcase.forEach(([name, rating, text, days, answer], index) => {
      insert({
        reviewId: `review-showcase-${index + 1}`,
        branchId,
        dinerUserId: `diner-showcase-${index + 1}`,
        displayName: name,
        rating,
        text,
        createdAtUtc: ago(days, index % 5),
        updatedAtUtc: ago(days, index % 5),
        hidden: false,
        hiddenReason: null,
        hiddenAtUtc: null,
        hiddenBy: null,
        reply: answer ?? null,
      });
    });
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
      const setAside: StoredReport[] = [];
      for (let i = reports.length - 1; i >= 0; i -= 1) {
        if (reports[i]!.reviewId === reviewId) setAside.unshift(...reports.splice(i, 1));
      }
      // Idempotent, as on the server: a review with no open report changes nothing.
      if (setAside.length > 0) dismissed.set(reviewId, setAside);
    },

    restoreReports(reviewId) {
      const setAside = dismissed.get(reviewId) ?? [];
      dismissed.delete(reviewId);
      for (const report of setAside) {
        if (!reports.some((r) => r.reviewId === reviewId && r.dinerUserId === report.dinerUserId)) {
          reports.push(report);
        }
      }
    },

    setVisibility({ reviewId, hidden, reason, by, byName = null, atUtc }) {
      const review = reviews.get(reviewId);
      if (!review) throw new Error(`No review ${reviewId}.`);
      if (hidden && !review.hidden) review.hideCount += 1;
      review.hidden = hidden;
      review.hiddenReason = hidden ? reason : null;
      review.hiddenAtUtc = hidden ? atUtc : null;
      review.hiddenBy = hidden ? by : null;
      review.hiddenByName = hidden && by === 'venue' ? byName : null;
      return review;
    },

    setReply({ reviewId, text, authorName, authorRole, atUtc }) {
      const review = reviews.get(reviewId);
      if (!review) throw new Error(`No review ${reviewId}.`);
      const current = review.reply;
      if (current && current.text === text) return { review, first: false };
      review.reply = current
        ? { ...current, text, authorName, authorRole, updatedAtUtc: atUtc, edited: true }
        : {
            text,
            authorName,
            authorRole,
            createdAtUtc: atUtc,
            updatedAtUtc: atUtc,
            edited: false,
          };
      if (current === null) review.replyCount += 1;
      return { review, first: current === null };
    },

    removeReply(reviewId) {
      const review = reviews.get(reviewId);
      if (!review) throw new Error(`No review ${reviewId}.`);
      review.reply = null;
      return review;
    },
  };
}
