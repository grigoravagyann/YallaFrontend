import {
  createApiClient,
  createMockStaffAuth,
  createStaffAuth,
  createStaffSession,
  type StaffSession,
} from '@yalla/api';
import { readConfig } from '../../config';
import { staffDeviceStore } from './deviceStore';

/**
 * The tablet's session, wired to the backend and to IndexedDB.
 *
 * Built at module scope, once, because the API client holds it and a session
 * rebuilt on a re-render would lose the access token it is holding in memory —
 * and then renew, spending a rotating handle that the previous instance may
 * still be holding, which revokes the chain and locks the tablet.
 *
 * Against the mock data source the session is backed by the mock staff auth
 * (QA F13): the tablet enrols with a code the console mock generated, the
 * keypad shows the branch's roster, and "Tap to sign out" locks it. The
 * credential it hands out means nothing outside this browser, and is kept in
 * the same place the mock worlds are, so "reset mock data" forgets it too.
 */
const config = readConfig();

/**
 * The auth calls go through their own bare client.
 *
 * A client that carried the session would attach a bearer to the enrolment
 * call, and would refresh on the PIN endpoint's own 401 — which is a refresh of
 * the thing being minted.
 */
const staffAuth = config.api
  ? createStaffAuth(createApiClient({ baseUrl: config.api.baseUrl }))
  : createMockStaffAuth();

export const staffSession: StaffSession | null = createStaffSession({
  auth: staffAuth,
  storage: staffDeviceStore,
});

/**
 * Whether this build has a tablet session at all.
 *
 * Always, now that the mock has one too. Kept as a value — the screens read
 * this rather than testing `staffSession === null` in four places, and the
 * type still admits `null` for a host that cannot hold a session.
 */
export const staffAuthAvailable = staffSession !== null;
