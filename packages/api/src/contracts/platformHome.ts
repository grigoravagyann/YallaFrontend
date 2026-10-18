import type {
  StaffRole,
  SubscriptionTier,
  UserRole,
  VenueReadinessIssue,
  VenueStatus,
} from './console';
import type { VenueType } from './booking';

/**
 * The platform admin's Home and Settings (Main and Settings artboards), as
 * `GET /api/platform/overview`, `GET /api/platform/outbox`,
 * `GET /api/platform/activity` and `/api/platform/me` answer them.
 *
 * **Booking numbers are aggregates only** (HANDOFF section 3): nothing here
 * carries a guest's name, phone or booking code at any depth.
 */

/** A venue's tier from its branches': none paid, some, or every one. */
export type VenueTierMix = 'free' | 'mixed' | 'paid';

/** One venue's share of a total: pending approvals, open tabs. */
export interface VenueCount {
  readonly venueId: string;
  readonly name: string;
  readonly count: number;
}

/** A total and the venues it is made of, the most first. */
export interface VenueCounter {
  readonly total: number;
  readonly venues: readonly VenueCount[];
}

/** One day's bookings, by the day of the visit. */
export interface DailyBookings {
  /** `YYYY-MM-DD`, in {@link OverviewBookings.labelTimeZoneId}. */
  readonly date: string;
  readonly count: number;
}

/**
 * Bookings by the day of the visit, cancelled ones left out. `perDay` is 30
 * entries, oldest first, today last; the 14-day chart is the last fourteen.
 */
export interface OverviewBookings {
  /** Today and the six days before it. */
  readonly last7Days: number;
  readonly previous7Days: number;
  /** To one decimal; `null` when the previous week had none (no "↑ ∞ %"). */
  readonly changePercent: number | null;
  readonly labelTimeZoneId: string;
  readonly perDay: readonly DailyBookings[];
}

/** A branch diners can reach that a guest would find unfinished. */
export interface NotReadyBranch {
  readonly venueId: string;
  readonly venueName: string;
  readonly branchId: string;
  readonly branchName: string;
  /** In the order the venue is onboarded; Home shows the first. */
  readonly issues: readonly VenueReadinessIssue[];
}

/** A recently added venue, as Home's table shows it. */
export interface RecentVenue {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: VenueType;
  readonly status: VenueStatus;
  readonly tierMix: VenueTierMix;
  readonly branchCount: number;
  readonly paidBranchCount: number;
  readonly createdAtUtc: string;
}

/** The outbox's counts — the same numbers `GET /api/platform/outbox` serves. */
export interface OutboxCounts {
  readonly pending: number;
  readonly due: number;
  readonly failed: number;
  readonly deadLettered: number;
  readonly sentLastDay: number;
  /** Given up on in the last 24 hours: what Home's alert counts. */
  readonly deadLetteredLastDay: number;
}

/** `GET /api/platform/overview`: Home in one read. */
export interface PlatformOverview {
  readonly generatedAtUtc: string;
  readonly venues: {
    /** Venues not deleted: `paid + mixed + free`. */
    readonly total: number;
    readonly paid: number;
    readonly mixed: number;
    readonly free: number;
    readonly active: number;
    readonly suspended: number;
    readonly inactive: number;
    /** Counted apart, and in no other number here. */
    readonly deleted: number;
    readonly branches: number;
    readonly paidBranches: number;
  };
  readonly bookings: OverviewBookings;
  /** Requests still waiting for the venue, whose visit is ahead. */
  readonly pendingApprovals: VenueCounter;
  /** Tabs open or closing right now. */
  readonly openTabs: VenueCounter;
  /** The newest venues' unfinished branches first, at most 20, with the total. */
  readonly notReady: { readonly total: number; readonly branches: readonly NotReadyBranch[] };
  /** The five newest venues not deleted, newest first. */
  readonly recentVenues: readonly RecentVenue[];
  readonly outbox: OutboxCounts;
}

/**
 * One message nobody is going to retry. There is **no retry**, by decision
 * (the backend's `docs/notifications.md` §5): Home shows these as details only.
 */
export interface OutboxDeadLetter {
  readonly id: string;
  /** What it was: `reservation.reminder`, `tab.order-ready`, … */
  readonly type: string;
  readonly lastError: string | null;
  readonly attemptCount: number;
  readonly scheduledForUtc: string;
  readonly deadLetteredAtUtc: string | null;
}

/** `GET /api/platform/outbox`. */
export interface OutboxHealth extends OutboxCounts {
  /** The newest first. */
  readonly deadLetters: readonly OutboxDeadLetter[];
}

/**
 * One line of the activity feed: something a member of staff did — the
 * platform admin, or a venue's own team. Names are the ones they had then;
 * the venue's is its current one, because the link goes there.
 */
export interface PlatformActivityEntry {
  readonly id: string;
  readonly atUtc: string;
  /** `venue.create`, `branch.tier-change`, `staff.create`, `review.hide`, … */
  readonly action: string;
  readonly actor: {
    readonly id: string;
    /** `null` for a row written before roles were kept. */
    readonly role: UserRole | null;
    readonly name: string | null;
  };
  readonly target: {
    /** `Venue`, `Branch`, `StaffMember`, `BranchReview`, `DiningTable`. */
    readonly type: string;
    readonly id: string;
    /** A review is named by its branch, never by its author. */
    readonly name: string | null;
  };
  /** `null` for the admin's own account. */
  readonly venue: { readonly id: string; readonly name: string } | null;
  /** `branch.tier-change`: the tier it moved to. */
  readonly tierTo: SubscriptionTier | null;
  /** `staff.create`: the role given. */
  readonly staffRole: StaffRole | null;
}

export interface PlatformActivityQuery {
  /** 1–100; the server's default is 20. */
  readonly limit?: number | undefined;
  readonly venueId?: string | undefined;
}

/** The signed-in platform admin, as Settings shows them. The email is fixed by configuration. */
export interface PlatformAdminProfile {
  readonly staffMemberId: string;
  readonly fullName: string;
  readonly email: string;
}

/** `POST /api/platform/me/password`. */
export interface ChangePlatformPasswordCommand {
  readonly currentPassword: string;
  /** At least {@link PLATFORM_PASSWORD_MIN_LENGTH} characters; length is the only rule. */
  readonly newPassword: string;
}

/** `Auth:MinimumPasswordLength`: every console password's one rule. */
export const PLATFORM_PASSWORD_MIN_LENGTH = 12;

/** `PATCH /api/platform/me`: 1–200 characters after trimming. */
export const PLATFORM_NAME_MAX_LENGTH = 200;
