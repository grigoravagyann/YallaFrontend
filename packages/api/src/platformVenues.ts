import type { ConsoleGateway } from './consoleGateway';
import type {
  ConsoleBranch,
  ConsoleVenue,
  ConsoleVenueDetail,
  SubscriptionTier,
} from './contracts/console';
import { BranchNotReadyError } from './contracts/errors';
import { NotFoundError } from './errors';

/**
 * The platform venues list's tier column, and the one button in it.
 *
 * The tier is the **branch's** (`PATCH /api/platform/branches/{id}`), and a
 * chain often pilots one branch before the rest. The user's decision of
 * 2026-10-18 (HANDOFF section 6): the list shows a summary — "Paid", "Free",
 * or "Mixed · 1/2" — and its button switches every branch of the venue; the
 * per-branch control lives on the venue page.
 */

export interface VenueTierSummary {
  /** `none` is a venue with no branch: there is nothing to switch. */
  readonly kind: 'paid' | 'free' | 'mixed' | 'none';
  readonly paid: number;
  readonly total: number;
}

/**
 * Paid when every branch is, Free when none is, Mixed in between. The
 * branches' own tiers win over the counts when the row carries both: they are
 * the same answer at a finer grain.
 */
export function venueTierSummary(
  venue: Pick<ConsoleVenue, 'branchCount' | 'paidBranchCount' | 'branchTiers'>,
): VenueTierSummary {
  const tiers = venue.branchTiers;
  const total = tiers ? tiers.length : venue.branchCount;
  const paid = tiers
    ? tiers.filter((branch) => branch.subscriptionTier === 'paid').length
    : venue.paidBranchCount;
  const kind = total === 0 ? 'none' : paid === total ? 'paid' : paid === 0 ? 'free' : 'mixed';
  return { kind, paid, total };
}

/** The server's page ceiling (`PlatformService.ListVenuesAsync` clamps to 200). */
const PAGE_SIZE = 200;
/** A guard against a total that never arrives, not a real limit: 10 000 venues. */
const MAX_PAGES = 50;

/**
 * Every venue on the platform, deleted ones included, in the server's order.
 *
 * The redesigned list filters, sorts and searches in place, and counts what it
 * hides ("12 venues · 1 deleted"), so it reads the whole platform once rather
 * than a page at a time. The platform is tens of venues, not thousands.
 */
export async function listAllConsoleVenues(
  gateway: Pick<ConsoleGateway, 'listVenues'>,
): Promise<readonly ConsoleVenue[]> {
  const all: ConsoleVenue[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const answer = await gateway.listVenues({ includeDeleted: true, page, pageSize: PAGE_SIZE });
    all.push(...answer.items);
    if (answer.items.length === 0 || all.length >= answer.total) break;
  }
  return all;
}

/** A branch whose menu stops it going Paid, and how many dishes are left. */
export interface VenueTierBlocker {
  readonly branch: ConsoleBranch;
  readonly incompleteMenuItemCount: number;
}

export interface VenueTierCheck {
  /** The venue as it is now, every branch with its tier. */
  readonly venue: ConsoleVenueDetail;
  /** The branches the switch would change: those not on `tier` already. */
  readonly toChange: readonly ConsoleBranch[];
  /** Going Paid: the branches whose menu is unfinished. Empty going Free. */
  readonly blockers: readonly VenueTierBlocker[];
}

async function requireVenue(
  gateway: Pick<ConsoleGateway, 'getVenue'>,
  venueId: string,
): Promise<ConsoleVenueDetail> {
  const venue = await gateway.getVenue(venueId);
  if (!venue) throw new NotFoundError({ url: `/api/platform/venues/${venueId}` });
  return venue;
}

/**
 * What switching every branch to `tier` would do, before anything is sent.
 *
 * Going Paid is refused by the server while a branch's menu is unfinished
 * (`branch-not-ready`). Asking each branch's readiness first lets the dialog
 * say so — and name the branch — before the button is pressed, as the
 * artboard does, rather than after a switch that moved half the venue. A
 * readiness that cannot be read is left to the server: the check is a
 * courtesy, the server is the authority.
 */
export async function checkVenueTier(
  gateway: Pick<ConsoleGateway, 'getVenue' | 'getBranchReadiness'>,
  input: { readonly venueId: string; readonly tier: SubscriptionTier },
): Promise<VenueTierCheck> {
  const venue = await requireVenue(gateway, input.venueId);
  const toChange = venue.branches.filter((branch) => branch.subscriptionTier !== input.tier);
  if (input.tier !== 'paid') return { venue, toChange, blockers: [] };

  const readiness = await Promise.all(
    toChange.map((branch) =>
      gateway.getBranchReadiness(branch.id).then(
        (answer) => ({ branch, incompleteMenuItemCount: answer.incompleteMenuItemCount }),
        () => null,
      ),
    ),
  );
  const blockers = readiness.filter(
    (entry): entry is VenueTierBlocker => entry !== null && entry.incompleteMenuItemCount > 0,
  );
  return { venue, toChange, blockers };
}

/** One branch the switch could not move, and what the server (or the check) said. */
export interface VenueTierRefusal {
  readonly branch: ConsoleBranch;
  /** A `BranchNotReadyError` going Paid; going Free with open tabs, a 409. */
  readonly error: unknown;
}

export interface VenueTierResult {
  /** The venue after the switch, as the server last answered it. */
  readonly venue: ConsoleVenueDetail;
  /** The branches that moved. Reported even when a later one refused. */
  readonly changed: readonly ConsoleBranch[];
  /** Empty when every branch moved. */
  readonly refused: readonly VenueTierRefusal[];
}

/**
 * Switch every branch of a venue to `tier`, one branch at a time.
 *
 * All or nothing where it can be: when the readiness check finds an
 * unfinished menu, nothing is sent and every blocked branch is named. Past the
 * check it is one `PATCH` per branch, stopping at the first refusal and saying
 * honestly which branches had already moved — there is no venue-wide tier
 * route to make it atomic, and pretending otherwise would hide a mixed venue.
 *
 * Each branch gets its own command id, derived from the one given, so a
 * deliberate retry of the whole switch repeats each branch's command.
 */
export async function applyVenueTier(
  gateway: Pick<ConsoleGateway, 'getVenue' | 'getBranchReadiness' | 'setBranchTier'>,
  input: { readonly venueId: string; readonly tier: SubscriptionTier; readonly commandId: string },
): Promise<VenueTierResult> {
  const check = await checkVenueTier(gateway, input);
  if (check.blockers.length > 0) {
    return {
      venue: check.venue,
      changed: [],
      refused: check.blockers.map((blocker) => ({
        branch: blocker.branch,
        error: new BranchNotReadyError({
          url: `/api/platform/branches/${blocker.branch.id}`,
          branchId: blocker.branch.id,
          incompleteMenuItemCount: blocker.incompleteMenuItemCount,
        }),
      })),
    };
  }

  let venue = check.venue;
  const changed: ConsoleBranch[] = [];
  for (const branch of check.toChange) {
    try {
      venue = await gateway.setBranchTier({
        branchId: branch.id,
        tier: input.tier,
        commandId: `${input.commandId}:${branch.id}`,
      });
      changed.push(branch);
    } catch (error) {
      return { venue, changed, refused: [{ branch, error }] };
    }
  }
  return { venue, changed, refused: [] };
}
