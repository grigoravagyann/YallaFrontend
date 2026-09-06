import { describe, expect, it } from 'vitest';
import vectorFile from './fixtures/billing-vectors.json';
import {
  computeBill,
  type BillingAdjustment,
  type BillingLine,
  type BillingParticipant,
} from './billing';

/**
 * The arithmetic, checked against the side that owns it.
 *
 * `billing.ts` is a port of `Yalla.Domain.Billing.TabBilling.Compute`, and a
 * port is a second implementation. The property test that used to stand in for
 * this one asserted that the port's shares sum to the port's total across two
 * thousand random tabs — which proves the port is *self-consistent*, not that it
 * agrees with the server. Two implementations can both be internally coherent,
 * both green, and quietly disagree about what three people owe, and the place
 * that surfaces is a table with a guest at it.
 *
 * So the side that owns the arithmetic publishes its answers.
 * `fixtures/billing-vectors.json` is copied verbatim from the backend's
 * `docs/billing-vectors.json`, which is emitted by
 * `Yalla.UnitTests.GoldenBillingVectorTests` from `TabBilling.Compute` itself
 * and committed. **Nothing in that file is maintained by hand on either side.**
 *
 * When the backend's arithmetic changes deliberately, the flow is: their test
 * regenerates the file, they read the diff, the file is copied here, and these
 * tests say exactly which vector moved. When it changes *un*deliberately,
 * theirs goes red before it ever reaches us.
 *
 * The property test is still here, in `billing.test.ts`, and it is still worth
 * running — it covers shapes no fourteen hand-picked vectors reach. It is no
 * longer the thing standing between the two implementations.
 */

/** Bumped by the backend when the file's *shape* changes. Numbers moving is not that. */
const SUPPORTED_SCHEMA_VERSION = 1;

interface VectorLine {
  readonly lineId: string;
  readonly ownerParticipantId: string | null;
  readonly unitPriceAmd: number;
  readonly quantity: number;
  readonly isVoided: boolean;
  readonly isSplitAcrossParticipants: boolean;
  readonly shareParticipantIds: readonly string[];
}

interface VectorAdjustment {
  readonly lineId: string | null;
  readonly percent: number | null;
  readonly amountAmd: number | null;
}

interface VectorParticipant {
  readonly participantId: string;
  readonly isHost: boolean;
  readonly status: string;
  readonly paidAmd: number;
}

interface VectorShare {
  readonly participantId: string;
  readonly ownItemsAmd: number;
  readonly sharedItemsAmd: number;
  readonly absorbedFromRemovedAmd: number;
  readonly personalAmd: number;
  readonly serviceChargeAmd: number;
  readonly shareAmd: number;
  readonly paidAmd: number;
}

interface Vector {
  readonly name: string;
  readonly description: string;
  readonly input: {
    readonly serviceChargePercent: number;
    readonly paidAmd: number;
    readonly lines: readonly VectorLine[];
    readonly adjustments: readonly VectorAdjustment[];
    readonly participants: readonly VectorParticipant[];
  };
  readonly expected: {
    readonly subtotalAmd: number;
    readonly serviceChargeAmd: number;
    readonly totalAmd: number;
    readonly paidAmd: number;
    readonly remainingAmd: number;
    readonly absorbedFromRemovedAmd: number;
    readonly shares: readonly VectorShare[];
  };
}

const file = vectorFile as unknown as {
  readonly schemaVersion: number;
  readonly vectors: readonly Vector[];
};

/**
 * `Amd` on the wire, `Dram` in the client. The one translation this file does,
 * and it is the same one `http/` does everywhere else.
 */
function toLine(line: VectorLine): BillingLine {
  return {
    lineId: line.lineId,
    ownerParticipantId: line.ownerParticipantId,
    unitPriceDram: line.unitPriceAmd,
    quantity: line.quantity,
    isVoided: line.isVoided,
    isSplitAcrossParticipants: line.isSplitAcrossParticipants,
    shareParticipantIds: line.shareParticipantIds,
  };
}

function toAdjustment(adjustment: VectorAdjustment): BillingAdjustment {
  return {
    lineId: adjustment.lineId,
    percent: adjustment.percent,
    amountDram: adjustment.amountAmd,
  };
}

function toParticipant(person: VectorParticipant): BillingParticipant {
  const status =
    person.status === 'PendingApproval'
      ? ('pendingApproval' as const)
      : person.status === 'Removed'
        ? ('removed' as const)
        : ('approved' as const);

  return {
    participantId: person.participantId,
    displayName: null,
    isHost: person.isHost,
    status,
    paidDram: person.paidAmd,
  };
}

describe('the golden billing vectors', () => {
  it('is a file this client knows how to read', () => {
    // A schema bump means the shape changed and the mapping above may be wrong.
    // Failing loudly beats mapping a file we do not understand.
    expect(file.schemaVersion).toBe(SUPPORTED_SCHEMA_VERSION);
    expect(file.vectors.length).toBeGreaterThan(0);
  });

  it.each(file.vectors.map((vector) => [vector.name, vector] as const))(
    'agrees with the server on %s',
    (_name, vector) => {
      const { bill, shares } = computeBill({
        lines: vector.input.lines.map(toLine),
        adjustments: vector.input.adjustments.map(toAdjustment),
        participants: vector.input.participants.map(toParticipant),
        serviceChargePercent: vector.input.serviceChargePercent,
        paidDram: vector.input.paidAmd,
      });

      // The aggregate first: if this disagrees, the per-person numbers below
      // are noise and the failure output should say so plainly.
      expect({
        subtotalDram: bill.subtotalDram,
        serviceChargeDram: bill.serviceChargeDram,
        totalDram: bill.totalDram,
        paidDram: bill.paidDram,
        remainingDram: bill.remainingDram,
        absorbedFromRemovedDram: bill.absorbedFromRemovedDram,
      }).toEqual({
        subtotalDram: vector.expected.subtotalAmd,
        serviceChargeDram: vector.expected.serviceChargeAmd,
        totalDram: vector.expected.totalAmd,
        paidDram: vector.expected.paidAmd,
        remainingDram: vector.expected.remainingAmd,
        absorbedFromRemovedDram: vector.expected.absorbedFromRemovedAmd,
      });

      // Then every share, by participant, in the server's own order.
      const byId = new Map(shares.map((share) => [share.participantId, share]));
      expect([...byId.keys()].sort()).toEqual(
        vector.expected.shares.map((share) => share.participantId).sort(),
      );

      for (const expected of vector.expected.shares) {
        const actual = byId.get(expected.participantId);
        expect(actual, `no share for ${expected.participantId}`).toBeDefined();
        expect({
          ownItemsDram: actual?.ownItemsDram,
          sharedItemsDram: actual?.sharedItemsDram,
          absorbedFromRemovedDram: actual?.absorbedFromRemovedDram,
          personalDram: actual?.personalDram,
          serviceChargeDram: actual?.serviceChargeDram,
          shareDram: actual?.shareDram,
          paidDram: actual?.paidDram,
        }).toEqual({
          ownItemsDram: expected.ownItemsAmd,
          sharedItemsDram: expected.sharedItemsAmd,
          absorbedFromRemovedDram: expected.absorbedFromRemovedAmd,
          personalDram: expected.personalAmd,
          serviceChargeDram: expected.serviceChargeAmd,
          shareDram: expected.shareAmd,
          paidDram: expected.paidAmd,
        });
      }
    },
  );
});
