import { describe, it, vi } from 'vitest';
import { describeAvailabilityContract } from './availability.contract';
import { describeConsoleListingContract } from './consoleListing.contract';
import { describeDinerJourneyContract } from './dinerJourney.contract';
import { resolveLiveSubject } from './liveSubject';
import { describeMenuContract, describeReportContract } from './menuReports.contract';
import { describePlacesContract } from './places.contract';
import { describeReservationContract } from './reservation.contract';
import type { ContractSubject } from './subject';
import { contractBackendUrl, mockSubject } from './subjects';
import { describeTabContract } from './tab.contract';
import { describeTableStateContract } from './tableState.contract';

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
 *     YALLA_CONTRACT_BASE_URL=http://localhost:5086 \
 *     YALLA_CONTRACT_ADMIN_EMAIL=… YALLA_CONTRACT_ADMIN_PASSWORD=… \
 *     pnpm --filter @yalla/api exec vitest run src/contract/
 *
 * against a backend in Development with `DevSeed__Enabled=true` and
 * `DevActor__Enabled=false`. The admin pair is the backend's
 * `PlatformAdmin:Email`/`Password`; `liveSubject.ts` signs in as it, enrols a
 * tablet for the seeded waiter and manager, and makes diners as the suites need
 * them.
 *
 * Off by default so `pnpm test` stays fast and offline, and wired into CI as
 * its own job against a backend container. **A contract suite that only ever
 * runs against the mock is the problem, not the fix** — so when the flag is
 * absent the suite says so out loud rather than reporting a clean run.
 */

// A live test makes real requests — uploads, sign-ups, bookings — and several
// chain a dozen of them; the mock run is unaffected.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

/** Every contract, against every subject. One list, so neither run can drift. */
function describeEveryContract(subject: ContractSubject): void {
  describeAvailabilityContract(subject);
  describeReservationContract(subject);
  describeTabContract(subject);
  describeTableStateContract(subject);
  describeMenuContract(subject);
  describeReportContract(subject);
  describePlacesContract(subject);
  describeConsoleListingContract(subject);
  describeDinerJourneyContract(subject);
}

describeEveryContract(mockSubject());

const baseUrl = contractBackendUrl();

if (baseUrl) {
  describeEveryContract(await resolveLiveSubject(baseUrl));
} else {
  console.info(
    'contract: the live run is off — YALLA_CONTRACT_BASE_URL is not set, so only the mock adapter was checked.',
  );
  describe('the live run', () => {
    it.skip('is off — set YALLA_CONTRACT_BASE_URL to run this suite against a real backend', () => {});
  });
}
