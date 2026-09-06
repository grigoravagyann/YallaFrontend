import type { ConsoleGateway } from '../consoleGateway';
import type { YallaGateway } from '../gateway';
import type { StaffGateway } from '../staffGateway';

/**
 * What a contract suite is run against.
 *
 * ## Why this exists
 *
 * The mock adapter and the HTTP client implement the same interfaces and
 * nothing checked that they agree. That is not a theoretical gap: it is how the
 * availability bug survived five prompts. `availabilityFor` in the mock derived
 * every answer from `table.state` — the current moment — regardless of the slot
 * being asked about, and the clients had the same bug. **The double reproduced
 * the defect it existed to catch**, so every regression test passed against a
 * lie, and the mock was free to be wrong in precisely the way the code was
 * wrong.
 *
 * A contract suite is one set of assertions run twice: once against the mock,
 * once against the real client and a live backend. A behaviour asserted here
 * must hold for both, or the mock is lying.
 *
 * ## The rule for writing assertions
 *
 * **Written against the API's documented behaviour, never against either
 * implementation.** If you find yourself opening the mock to decide what to
 * assert, stop — that is exactly how the last three defects got in. The source
 * of truth is the backend's own XML documentation on
 * `Yalla.Application.*`, quoted in the assertion where it is not obvious.
 *
 * And when a run fails: **fix the implementation, never the assertion.** If the
 * mock cannot satisfy the contract, the mock is wrong. If the *real client*
 * cannot, that is a live bug and it gets reported rather than accommodated.
 */
export interface ContractSubject {
  /** Shown in test names, so a failure says which implementation broke. */
  readonly name: string;
  readonly gateway: YallaGateway;
  readonly staff: StaffGateway;
  readonly console: ConsoleGateway;
  readonly fixtures: ContractFixtures;
  /**
   * Why a capability cannot be exercised against this subject, or `null` when
   * it can.
   *
   * Declared rather than silently skipped. A contract suite whose live run
   * quietly covers a third of the surface is the problem it was built to fix,
   * so an unsupported capability prints its reason in the test name and the
   * report has to account for it.
   */
  readonly unsupported: (capability: ContractCapability) => string | null;
  /**
   * A contract this subject is **known to violate**, with the defect's reason.
   *
   * Not a way to make a red run green. A named defect is asserted to *fail*
   * (`it.fails`), so the day the implementation is fixed the test errors with
   * "expected to fail but passed" and somebody has to come and delete the
   * entry. A silent skip would let a known bug age quietly into a permanent
   * one; this makes the fix impossible to miss and the bug impossible to
   * forget.
   *
   * Only ever populated for the live subject. If the *mock* violates a
   * contract, the mock is fixed — there is nothing to record.
   */
  readonly knownDefect?: (contract: string) => string | null;
  /** Released after the suite: an HTTP subject holds a session. */
  readonly dispose?: () => Promise<void>;
}

/**
 * The areas of behaviour a subject may or may not be able to exercise.
 *
 * Coarse on purpose. A subject either has the credentials and seeded data for a
 * whole area or it does not; making this finer would let a live run opt out of
 * the single assertion it fails.
 */
export type ContractCapability =
  'availability' | 'reservations' | 'tabs' | 'tableState' | 'menu' | 'reports';

/**
 * The ids a suite needs to ask a real question.
 *
 * Supplied by each runner rather than discovered through the interface, because
 * discovery would itself depend on an endpoint (`listVenues`) that the HTTP
 * gateway does not have — and a suite that cannot start against the real client
 * is a suite that only ever runs against the mock.
 */
export interface ContractFixtures {
  readonly branchId: string;
  readonly timeZoneId: string;
  /** A local date well clear of today, for "a slot tomorrow evening" questions. */
  readonly tomorrowEveningUtc: string;
}

/** Tomorrow at 20:00 in the branch's zone, as an instant. */
export function tomorrowEvening(timeZoneId: string, now: Date = new Date()): string {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
  const localDay = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timeZoneId,
  }).format(tomorrow);

  // 20:00 local, resolved by probing the zone's offset at that instant.
  const naive = Date.parse(`${localDay}T20:00:00Z`);
  const probe = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneId,
    timeZoneName: 'longOffset',
  }).format(new Date(naive));
  const match = /GMT([+-])(\d{2}):(\d{2})/u.exec(probe);
  const offsetMinutes = match
    ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
    : 0;

  return new Date(naive - offsetMinutes * 60_000).toISOString();
}
