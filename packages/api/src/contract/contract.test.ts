import { describe, it } from 'vitest';
import { describeAvailabilityContract } from './availability.contract';
import { describeMenuContract, describeReportContract } from './menuReports.contract';
import { describeReservationContract } from './reservation.contract';
import { describeTabContract } from './tab.contract';
import { describeTableStateContract } from './tableState.contract';
import { contractBackendUrl, httpSubject, mockSubject } from './subjects';

/**
 * One suite, run against every implementation of the gateway interfaces.
 *
 * ## Why
 *
 * Three defects have now survived because the test double reproduced them. The
 * worst was `availabilityFor`, which derived every answer from the *current*
 * table state whatever slot it was asked about — exactly the bug the clients
 * had. The double agreed with the defect, so the regression tests that would
 * have caught it passed against a lie, on the product's core flow, for five
 * prompts.
 *
 * The backend has already been through this: Prompt 11's contract tests failed
 * five of its doubles on the first run, including a production implementation.
 * This is the frontend's equivalent.
 *
 * ## How the live run is switched on
 *
 * `YALLA_CONTRACT_BASE_URL=http://localhost:5086 pnpm --filter @yalla/api test`
 *
 * Off by default so `pnpm test` stays fast and offline, and wired into CI as
 * its own job against a backend container. **A contract suite that only ever
 * runs against the mock is the problem, not the fix** — so when the flag is
 * absent the suite says so out loud rather than reporting a clean run.
 */

/** Every contract, against every subject. One list, so neither run can drift. */
function describeEveryContract(subject: Parameters<typeof describeAvailabilityContract>[0]): void {
  describeAvailabilityContract(subject);
  describeReservationContract(subject);
  describeTabContract(subject);
  describeTableStateContract(subject);
  describeMenuContract(subject);
  describeReportContract(subject);
}

describeEveryContract(mockSubject());

const baseUrl = contractBackendUrl();

if (baseUrl) {
  describeEveryContract(await resolveLiveSubject(baseUrl));
} else {
  describe('the live run', () => {
    it.skip('is off — set YALLA_CONTRACT_BASE_URL to run this suite against a real backend', () => {});
  });
}

/**
 * Discover the seeded branch through the public catalogue, then sign in if
 * credentials were supplied.
 *
 * The branch is discovered rather than configured because a backend container's
 * seed generates fresh ids on every boot, and a hard-coded guid would make the
 * CI job fail for a reason that has nothing to do with the contract.
 */
async function resolveLiveSubject(url: string) {
  const venues = (await (await fetch(new URL('/api/public/venues', url))).json()) as {
    branches: { branchId: string }[];
  }[];

  const branchId = venues[0]?.branches[0]?.branchId;
  if (!branchId) {
    throw new Error(
      `No published venue at ${url}. The contract suite needs a seeded branch to ask about.`,
    );
  }

  return httpSubject({
    baseUrl: url,
    branchId,
    // Every Yalla venue is in Yerevan; the branch payload does not carry the
    // zone, and the contract asserts the availability answer reports it.
    timeZoneId: 'Asia/Yerevan',
    venueToken: await venueToken(url),
  });
}

async function venueToken(url: string): Promise<string | null> {
  const email = globalThis.process?.env?.['YALLA_CONTRACT_VENUE_EMAIL'];
  const password = globalThis.process?.env?.['YALLA_CONTRACT_VENUE_PASSWORD'];
  if (!email || !password) return null;

  const response = await fetch(new URL('/api/auth/venue/sign-in', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return null;

  const body = (await response.json()) as { accessToken?: string };
  return body.accessToken ?? null;
}
