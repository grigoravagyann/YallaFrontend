import {
  createApiClient,
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
 * Against the mock data source there is no server to enrol with, so this is
 * `null` and the staff screens skip straight to the floor. That is what keeps
 * the mock adapter usable for working without a backend: signing in is the one
 * thing a mock cannot honestly simulate, because the credential it would hand
 * out means nothing.
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
  : null;

export const staffSession: StaffSession | null = staffAuth
  ? createStaffSession({
      auth: staffAuth,
      storage: staffDeviceStore,
    })
  : null;

/**
 * Whether this build has a tablet session at all.
 *
 * `false` on the mock data source. The screens read this rather than testing
 * `staffSession === null` in four places.
 */
export const staffAuthAvailable = staffSession !== null;
