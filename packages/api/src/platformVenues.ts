import type { ConsoleGateway } from './consoleGateway';
import type {
  ConsoleBranch,
  ConsoleVenue,
  ConsoleVenueDetail,
  SubscriptionTier,
} from './contracts/console';
import { BranchNotReadyError } from './contracts/errors';
import { ConcurrencyConflictError, NotFoundError } from './errors';

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

/**
 * A branch the server would refuse, found before anything is sent: going
 * Paid, its menu is unfinished; going Free, it has tabs open — hiding a live
 * bill from the people who owe it strands real money. One count is non-zero.
 */
export interface VenueTierBlocker {
  readonly branch: ConsoleBranch;
  /** Going Paid: the dishes left. `0` going Free. */
  readonly incompleteMenuItemCount: number;
  /** Going Free: the tabs open now. `0` going Paid. */
  readonly openTabCount: number;
}

export interface VenueTierCheck {
  /** The venue as it is now, every branch with its tier. */
  readonly venue: ConsoleVenueDetail;
  /** The branches the switch would change: those not on `tier` already. */
  readonly toChange: readonly ConsoleBranch[];
  /** Going Paid, the branches whose menu is unfinished; going Free, those with tabs open. */
  readonly blockers: readonly VenueTierBlocker[];
  /**
   * Going Free, the branches that could not come back to Paid as they stand —
   * their menu is unfinished, which the server refuses Paid for. Not a
   * refusal: Free is still allowed, but the way back is said before the way
   * out is taken. Always empty going Paid.
   */
  readonly cannotReturnToPaid: readonly VenueTierBlocker[];
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
 * (`branch-not-ready`); going Free, while the branch has tabs open. Asking
 * first — each branch's readiness, and the open tabs the venue read reports —
 * lets the dialog say so, naming the branch, before the button is pressed, as
 * the artboard does, rather than after a switch that moved half the venue. A
 * readiness that cannot be read, or tabs nobody reported, are left to the
 * server: the check is a courtesy, the server is the authority.
 */
export async function checkVenueTier(
  gateway: Pick<ConsoleGateway, 'getVenue' | 'getBranchReadiness'>,
  input: {
    readonly venueId: string;
    readonly tier: SubscriptionTier;
    /**
     * Only these branches: the venue page's per-branch plan control. Absent,
     * every branch of the venue — the list's one button.
     */
    readonly branchIds?: readonly string[] | undefined;
  },
): Promise<VenueTierCheck> {
  const venue = await requireVenue(gateway, input.venueId);
  const scope = input.branchIds ? new Set(input.branchIds) : null;
  const toChange = venue.branches.filter(
    (branch) => branch.subscriptionTier !== input.tier && (scope === null || scope.has(branch.id)),
  );
  // Each branch's menu, as Paid judges it: what refuses going Paid, and what
  // would keep a branch going Free from coming back.
  const unfinished = await unfinishedMenus(gateway, toChange);
  if (input.tier !== 'paid') {
    const blockers = toChange
      .filter((branch) => (branch.openTabCount ?? 0) > 0)
      .map((branch) => ({
        branch,
        incompleteMenuItemCount: 0,
        openTabCount: branch.openTabCount ?? 0,
      }));
    return { venue, toChange, blockers, cannotReturnToPaid: unfinished };
  }
  return { venue, toChange, blockers: unfinished, cannotReturnToPaid: [] };
}

/** The branches whose menu is unfinished. One whose readiness cannot be read is left out. */
async function unfinishedMenus(
  gateway: Pick<ConsoleGateway, 'getBranchReadiness'>,
  branches: readonly ConsoleBranch[],
): Promise<readonly VenueTierBlocker[]> {
  const readiness = await Promise.all(
    branches.map((branch) =>
      gateway.getBranchReadiness(branch.id).then(
        (answer) => ({
          branch,
          incompleteMenuItemCount: answer.incompleteMenuItemCount,
          openTabCount: 0,
        }),
        () => null,
      ),
    ),
  );
  return readiness.filter(
    (entry): entry is VenueTierBlocker => entry !== null && entry.incompleteMenuItemCount > 0,
  );
}

/**
 * The refusal the check stands in for: the server's own going Free with tabs
 * open is a 409 `conflicting-state` naming the count, and so is this.
 */
export function openTabsRefusal(
  branch: ConsoleBranch,
  openTabCount: number,
): ConcurrencyConflictError {
  const url = `/api/platform/branches/${branch.id}`;
  return new ConcurrencyConflictError({
    url,
    problem: {
      type: 'about:blank',
      title: 'Conflicting state',
      status: 409,
      detail: `This branch has ${openTabCount} open tab(s). Moving it to Free would hide those bills from the people who owe them. Wait until they are settled.`,
      code: 'conflicting-state',
      traceId: 'console-check',
    },
  });
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
  /** The branches that moved. Reported even when another one refused. */
  readonly changed: readonly ConsoleBranch[];
  /** Every branch that did not, with why. Empty when every branch moved. */
  readonly refused: readonly VenueTierRefusal[];
}

/**
 * Switch every branch of a venue to `tier`, one branch at a time.
 *
 * All or nothing where it can be: when the check finds an unfinished menu
 * (going Paid) or open tabs (going Free), nothing is sent and every blocked
 * branch is named. Past the check it is one `PATCH` per branch, **every
 * branch tried** whatever another answered, and the result says which moved
 * and which refused — there is no venue-wide tier route to make it atomic,
 * and stopping at the first refusal would leave the rest unmentioned.
 *
 * Each branch gets its own command id, derived from the one given, so a
 * deliberate retry of the whole switch repeats each branch's command.
 */
export async function applyVenueTier(
  gateway: Pick<ConsoleGateway, 'getVenue' | 'getBranchReadiness' | 'setBranchTier'>,
  input: {
    readonly venueId: string;
    readonly tier: SubscriptionTier;
    readonly commandId: string;
    /** Only these branches; absent, every branch. See {@link checkVenueTier}. */
    readonly branchIds?: readonly string[] | undefined;
  },
): Promise<VenueTierResult> {
  const check = await checkVenueTier(gateway, input);
  if (check.blockers.length > 0) {
    return {
      venue: check.venue,
      changed: [],
      refused: check.blockers.map((blocker) => ({
        branch: blocker.branch,
        error:
          input.tier === 'paid'
            ? new BranchNotReadyError({
                url: `/api/platform/branches/${blocker.branch.id}`,
                branchId: blocker.branch.id,
                incompleteMenuItemCount: blocker.incompleteMenuItemCount,
              })
            : openTabsRefusal(blocker.branch, blocker.openTabCount),
      })),
    };
  }

  let venue = check.venue;
  const changed: ConsoleBranch[] = [];
  const refused: VenueTierRefusal[] = [];
  for (const branch of check.toChange) {
    try {
      venue = await gateway.setBranchTier({
        branchId: branch.id,
        tier: input.tier,
        commandId: `${input.commandId}:${branch.id}`,
      });
      changed.push(branch);
    } catch (error) {
      refused.push({ branch, error });
    }
  }
  return { venue, changed, refused };
}
