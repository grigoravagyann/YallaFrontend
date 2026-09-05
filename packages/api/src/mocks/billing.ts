import type { ParticipantShare, TabBill } from '../contracts/unshipped';

/**
 * The bill, computed the way the server computes it.
 *
 * A port of `Yalla.Domain.Billing.TabBilling.Compute`, kept faithful on purpose.
 * The alternative — a mock that sums line totals and calls it a bill — would let
 * every screen be built and demonstrated against arithmetic the server does not
 * do, and the disagreement would surface on the day the backend is wired, at a
 * table, in front of a guest.
 *
 * **The client never uses this to display money.** Real screens read totals from
 * the server; this exists so the mock can behave like one. The one place the app
 * does arithmetic is the order tray's subtotal, which is a basket preview of
 * items not yet ordered and is labelled as such.
 *
 * The order of operations is the part that gets decided by accident elsewhere,
 * so it is stated:
 *
 * 1. Each line's gross, with voided lines counting zero.
 * 2. Line-level adjustments come off their own line.
 * 3. Tab-level adjustments come off the sum.
 * 4. **Service charge is computed on what is left** — a comped dish comps its
 *    service charge with it, which is what a manager means by comping a dish.
 * 5. Rounding is half-up and happens **once**, at the service-charge line. Never
 *    per item: rounding each item and summing gives a different answer from
 *    summing and rounding, and only one of the two matches what the guest sees.
 */

export interface BillingLine {
  readonly lineId: string;
  /** `null` when a waiter keyed in a spoken order and could not attribute it. */
  readonly ownerParticipantId: string | null;
  readonly unitPriceDram: number;
  readonly quantity: number;
  /** Voided lines stay on the bill and count zero. */
  readonly isVoided: boolean;
  readonly isSplitAcrossParticipants: boolean;
  /**
   * Who was at the table when it was ordered. A snapshot: the guest who arrived
   * for dessert is not on the starters, and the guest who left early still owes
   * for them.
   */
  readonly shareParticipantIds: readonly string[];
}

export interface BillingAdjustment {
  /** `null` for the whole tab. */
  readonly lineId: string | null;
  /** Exactly one of these is set. */
  readonly percent: number | null;
  readonly amountDram: number | null;
}

export interface BillingParticipant {
  readonly participantId: string;
  readonly displayName: string | null;
  /** The host carries every rounding remainder. */
  readonly isHost: boolean;
  readonly status: 'pendingApproval' | 'approved' | 'removed';
  readonly paidDram: number;
}

export interface ComputedBill {
  readonly bill: TabBill;
  readonly shares: readonly ParticipantShare[];
}

/** Half-up, away from zero — `Money.PercentOf`. */
export function percentOf(amountDram: number, percent: number): number {
  if (amountDram === 0 || percent === 0) return 0;
  const exact = (amountDram * percent) / 100;
  return Math.sign(exact) * Math.round(Math.abs(exact));
}

/**
 * Whole-dram parts that sum back exactly, remainder to the **first** part.
 *
 * 1,000 dram three ways is 334 + 333 + 333, not 333 three times. The naive
 * version loses a dram, the shares add up to less than the total, and the last
 * person to pay is short by one while a waiter sorts it out at the table.
 */
export function splitEvenly(amountDram: number, ways: number): number[] {
  if (ways < 1) throw new RangeError('splitEvenly: ways must be at least 1');
  const parts = new Array<number>(ways).fill(0);
  if (amountDram === 0) return parts;

  const each = Math.trunc(amountDram / ways);
  const remainder = amountDram - each * ways;
  for (let i = 0; i < ways; i += 1) parts[i] = each;
  // Callers order participants host-first, so the extra dram lands on the one
  // person who has agreed to be responsible for the tab.
  parts[0] = (parts[0] ?? 0) + remainder;
  return parts;
}

function reductionOn(adjustment: BillingAdjustment, baseDram: number): number {
  if (baseDram <= 0) return 0;
  const raw =
    adjustment.percent !== null
      ? percentOf(baseDram, adjustment.percent)
      : (adjustment.amountDram ?? 0);
  return Math.min(raw, baseDram);
}

/**
 * Hands `amountToShare` out in proportion to `weights`, summing to it exactly
 * and never going negative — the largest-remainder method.
 *
 * The obvious alternative, rounding every slice and giving the residue to the
 * host, is wrong in a way that only shows up on a real bill: half-up rounding
 * can hand out several dram *more* than there are to give, and taking that back
 * off a host who ordered one coffee produces a negative share. "You owe −3 ֏" is
 * a bug whatever the totals say.
 */
function apportionExactly(
  ordered: readonly BillingParticipant[],
  weights: ReadonlyMap<string, number>,
  amountToShare: number,
  weightTotal: number,
): Map<string, number> {
  const result = new Map<string, number>(ordered.map((p) => [p.participantId, 0]));
  if (amountToShare === 0 || ordered.length === 0) return result;

  if (weightTotal <= 0) {
    // Nothing to weigh by — a fully comped tab that still carries a service
    // charge, say. Split it evenly rather than dropping it, host first.
    const even = splitEvenly(amountToShare, ordered.length);
    ordered.forEach((p, i) => result.set(p.participantId, even[i] ?? 0));
    return result;
  }

  const floors: number[] = [];
  const fractions: number[] = [];
  let allocated = 0;

  for (const participant of ordered) {
    const exact = (amountToShare * (weights.get(participant.participantId) ?? 0)) / weightTotal;
    const floor = Math.floor(exact);
    floors.push(floor);
    fractions.push(exact - floor);
    allocated += floor;
  }

  const leftOver = amountToShare - allocated;
  // Whoever was cut by the most gets the next dram. Position breaks ties, and
  // the host is first, so a table splitting evenly sees the odd dram land there.
  const byFraction = floors
    .map((_, index) => index)
    .sort((a, b) => (fractions[b] ?? 0) - (fractions[a] ?? 0) || a - b);

  for (let n = 0; n < leftOver; n += 1) {
    const index = byFraction[n % byFraction.length] ?? 0;
    floors[index] = (floors[index] ?? 0) + 1;
  }

  ordered.forEach((p, i) => result.set(p.participantId, floors[i] ?? 0));
  return result;
}

export function computeBill(input: {
  readonly lines: readonly BillingLine[];
  readonly adjustments: readonly BillingAdjustment[];
  readonly participants: readonly BillingParticipant[];
  readonly serviceChargePercent: number;
  readonly paidDram: number;
}): ComputedBill {
  const { lines, adjustments, participants, serviceChargePercent, paidDram } = input;

  // --- 1 and 2. lines, net of their own adjustments ------------------------
  const netByLine = new Map<string, number>();
  for (const line of lines) {
    let net = line.isVoided ? 0 : line.unitPriceDram * line.quantity;
    for (const adjustment of adjustments.filter((a) => a.lineId === line.lineId)) {
      net -= reductionOn(adjustment, net);
    }
    netByLine.set(line.lineId, net);
  }
  const grossSubtotal = [...netByLine.values()].reduce((sum, net) => sum + net, 0);

  // --- 3. tab-wide adjustments ---------------------------------------------
  let tabReduction = 0;
  let reducible = grossSubtotal;
  for (const adjustment of adjustments.filter((a) => a.lineId === null)) {
    const off = reductionOn(adjustment, reducible);
    tabReduction += off;
    reducible -= off;
  }
  const subtotal = grossSubtotal - tabReduction;

  // --- 4 and 5. the service charge, rounded once ---------------------------
  const serviceCharge = percentOf(subtotal, serviceChargePercent);
  const total = subtotal + serviceCharge;

  // Host first, in every ordering, because the host carries every remainder.
  // After the host, join order — a stable sort is what leaving the second key
  // off does. Sorting by id instead would look equivalent and is not: the odd
  // dram would land on a different guest each time the same bill is computed.
  const ordered = [...participants].sort((a, b) => Number(b.isHost) - Number(a.isHost));

  if (ordered.length === 0) {
    return {
      bill: {
        subtotalDram: subtotal,
        serviceChargeDram: serviceCharge,
        totalDram: total,
        paidDram,
        remainingDram: Math.max(0, total - paidDram),
        absorbedFromRemovedDram: 0,
      },
      shares: [],
    };
  }

  // Where an unattributable amount lands: the host, or the first approved
  // person when there is no host, or simply the first person on a tab where
  // nobody is approved yet.
  const absorber =
    ordered.find((p) => p.isHost) ?? ordered.find((p) => p.status === 'approved') ?? ordered[0]!;

  const own = new Map(ordered.map((p) => [p.participantId, 0]));
  const shared = new Map(ordered.map((p) => [p.participantId, 0]));
  const absorbed = new Map(ordered.map((p) => [p.participantId, 0]));
  const onTab = new Map(ordered.map((p) => [p.participantId, p]));

  const add = (map: Map<string, number>, id: string, amount: number) =>
    map.set(id, (map.get(id) ?? 0) + amount);

  for (const line of lines) {
    const net = netByLine.get(line.lineId) ?? 0;
    if (net === 0) continue;

    if (!line.isSplitAcrossParticipants) {
      // One person's item. If they are gone — or were never really on the tab —
      // the food was still eaten and somebody has to owe for it.
      const owner = line.ownerParticipantId;
      const person = owner ? onTab.get(owner) : undefined;
      if (owner && person && person.status !== 'removed') add(own, owner, net);
      else add(absorbed, absorber.participantId, net);
      continue;
    }

    // A shared bottle, or a line the waiter could not attribute. Split across
    // the people snapshotted on it, host first so the remainder lands right.
    const payers = ordered.filter((p) => line.shareParticipantIds.includes(p.participantId));
    const present = payers.filter((p) => p.status !== 'removed');

    if (present.length === 0) {
      // Everyone who shared this has since been removed. It still has to be
      // paid for.
      add(absorbed, absorber.participantId, net);
      continue;
    }

    const parts = splitEvenly(net, payers.length);
    payers.forEach((payer, index) => {
      const part = parts[index] ?? 0;
      if (payer.status === 'removed') add(absorbed, absorber.participantId, part);
      else add(shared, payer.participantId, part);
    });
  }

  // Anything the lines could not place at all — a tab whose only lines are
  // table-attributed with nobody snapshotted on them — still has to add up.
  const placed =
    [...own.values()].reduce((a, b) => a + b, 0) +
    [...shared.values()].reduce((a, b) => a + b, 0) +
    [...absorbed.values()].reduce((a, b) => a + b, 0);
  if (placed !== grossSubtotal) {
    add(absorbed, absorber.participantId, grossSubtotal - placed);
  }

  const beforeDiscount = new Map(
    ordered.map((p) => [
      p.participantId,
      (own.get(p.participantId) ?? 0) +
        (shared.get(p.participantId) ?? 0) +
        (absorbed.get(p.participantId) ?? 0),
    ]),
  );

  const personal = apportionExactly(ordered, beforeDiscount, subtotal, grossSubtotal);
  const service = apportionExactly(ordered, personal, serviceCharge, subtotal);

  const shares: ParticipantShare[] = ordered.map((p) => {
    const personalDram = personal.get(p.participantId) ?? 0;
    const serviceChargeDram = service.get(p.participantId) ?? 0;
    return {
      participantId: p.participantId,
      displayName: p.displayName,
      isHost: p.isHost,
      ownItemsDram: own.get(p.participantId) ?? 0,
      sharedItemsDram: shared.get(p.participantId) ?? 0,
      absorbedFromRemovedDram: absorbed.get(p.participantId) ?? 0,
      personalDram,
      serviceChargeDram,
      shareDram: personalDram + serviceChargeDram,
      paidDram: p.paidDram,
    };
  });

  return {
    bill: {
      subtotalDram: subtotal,
      serviceChargeDram: serviceCharge,
      totalDram: total,
      paidDram,
      remainingDram: Math.max(0, total - paidDram),
      absorbedFromRemovedDram: shares.reduce((sum, s) => sum + s.absorbedFromRemovedDram, 0),
    },
    shares,
  };
}
