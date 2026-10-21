import type { EnrolledDevice, StaffSessionIdentity } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useState } from 'react';
import { usingMockData } from '../data/gateway';
import { useCurrentUser } from '../auth/useCurrentUser';
import { EnrolDeviceScreen } from './auth/EnrolDeviceScreen';
import { PinScreen } from './auth/PinScreen';
import { staffAuthAvailable, staffSession } from './auth/staffSession';
import { useStaffSessionSnapshot, useTouchOnInteraction } from './auth/useStaffSession';
import { FloorRoute } from './FloorRoute';
import { KitchenRoute } from './KitchenRoute';
import { usePageTitle } from '../public/meta';
import './staff.css';

/**
 * The counter screen and everything that guards it.
 *
 * Mounted outside the console's router on purpose. `/staff` has its own
 * credential, its own sign-in and no email field anywhere in it; routing it
 * through the venue-user session would send a waiter with no console account to
 * a password form, which is precisely the thing the staff model exists to
 * avoid.
 *
 * ## Locking never unmounts the floor
 *
 * The PIN screen renders **over** the floor, not instead of it. That is the
 * whole reason inactivity locking is acceptable: a half-entered order is React
 * state inside the order-entry overlay, and a gate that swapped the tree would
 * throw it away every time somebody put the tablet down for half a minute. A
 * waiter who loses one spoken order to a lock turns locking off, and then the
 * tablet on the counter is signed in to somebody who went home at six.
 *
 * What locking *does* do is stop the floor talking: its queries and its live
 * stream are paused while the keypad is up, because there is no token and a
 * screen quietly firing 401s at a backend is not a paused screen.
 */
export function StaffRoute() {
  const { t } = useTranslation(['staff', 'common']);
  const snapshot = useStaffSessionSnapshot();
  const [restored, setRestored] = useState(!staffAuthAvailable);

  /**
   * Whose session this is, or was.
   *
   * The session keeps it across a lock precisely so the floor can stay mounted
   * underneath the keypad — with its branch, its role and above all its React
   * state, which is where a half-entered order lives. `snapshot.state` is what
   * says whether anybody is actually signed in.
   */
  const identity = snapshot.identity;

  /**
   * Enrolled on this screen, just now.
   *
   * Enrolling moves the session straight to `locked`, which would swap the
   * enrolment screen for the keypad in the same frame. The staff get one look
   * at the venue and branch the tablet is bound to first — the moment a tablet
   * on the wrong branch is cheap to notice — and tap through. Adjusted during
   * render rather than in an effect, so the keypad never flashes in between.
   */
  const [lastState, setLastState] = useState(snapshot.state);
  const [justEnrolled, setJustEnrolled] = useState(false);
  if (snapshot.state !== lastState) {
    setLastState(snapshot.state);
    if (lastState === 'unenrolled' && snapshot.state === 'locked') setJustEnrolled(true);
    if (snapshot.state === 'unenrolled') setJustEnrolled(false);
  }

  useEffect(() => {
    if (!staffSession) return;
    let cancelled = false;
    void staffSession
      .restore()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A revoked tablet is discovered here rather than by a request failing three
  // screens in. Runs whenever the tablet is enrolled and does not know its
  // device yet: locked, which is also every launch — and signed in, because a
  // reload restores a live session without the device, and the top bar takes
  // the venue's name from it. Once per state, not per render.
  useEffect(() => {
    if (!staffSession || !restored) return;
    if (snapshot.state !== 'locked' && snapshot.state !== 'signedIn') return;
    if (snapshot.device) return;
    void staffSession.refreshDevice().catch(() => undefined);
  }, [restored, snapshot.state, snapshot.device]);

  useTouchOnInteraction(snapshot.state === 'signedIn');

  const locked = staffAuthAvailable && snapshot.state !== 'signedIn';

  // The tab bar says which screen this is — the floor, the kitchen, or the
  // PIN gate — rather than "Yalla" three times over.
  usePageTitle(
    staffAuthAvailable && (snapshot.state === 'unenrolled' || justEnrolled)
      ? t('enrol.title')
      : locked
        ? t('pin.prompt')
        : identity?.role === 'kitchen'
          ? t('kitchen.title')
          : t('floor.title'),
    t('common:appName'),
  );

  if (!restored) {
    return (
      <div className="staff-gate" data-surface="staff">
        <p className="floor-note">{t('floor.loading')}</p>
      </div>
    );
  }

  if (
    staffAuthAvailable &&
    (snapshot.state === 'unenrolled' ||
      (justEnrolled && snapshot.state === 'locked' && snapshot.device))
  ) {
    return (
      <EnrolDeviceScreen
        reason={snapshot.lastSignOut === 'expired' ? 'revoked' : 'never'}
        enrolled={justEnrolled ? snapshot.device : null}
        onContinue={() => setJustEnrolled(false)}
      />
    );
  }

  return (
    <>
      {/* `inert` rather than unmounting. The floor keeps its state and stops
          taking input; a keypad with a live floor behind it would let a stray
          thumb seat a table nobody is signed in for. */}
      {identity || !staffAuthAvailable ? (
        <div className="staff-shell" inert={locked ? true : undefined}>
          <StaffFloor paused={locked} identity={identity} device={snapshot.device} />
        </div>
      ) : locked ? (
        // Nobody has signed in since launch, so there is no floor to blur:
        // its outline stands in, as on the Pin artboard.
        <div className="ft-ghost" aria-hidden="true">
          {Array.from({ length: 15 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      ) : null}

      {locked ? <PinScreen device={snapshot.device} lastSignOut={snapshot.lastSignOut} /> : null}
    </>
  );
}

/**
 * The floor — or, for the kitchen, the order queue — given whichever identity
 * this build has.
 *
 * The staff session's, against a real backend and — since QA F13 — against
 * the mock too, whose tablet enrols with a code the console mock generated and
 * signs in with `MOCK_STAFF_PIN`. The dev role switcher's user is the fallback
 * only for a build with no tablet session at all.
 */
function StaffFloor({
  paused,
  identity,
  device,
}: {
  readonly paused: boolean;
  readonly identity: StaffSessionIdentity | null;
  readonly device: EnrolledDevice | null;
}) {
  const { user } = useCurrentUser();
  const { t } = useTranslation(['staff']);

  const resolved: StaffSessionIdentity | null = identity
    ? identity
    : usingMockData && user
      ? {
          staffMemberId: user.id,
          fullName: user.displayName,
          role: user.role,
          branchId: user.scope.branchIds[0] ?? '',
        }
      : null;

  if (!resolved) {
    return (
      <div className="staff-gate" data-surface="staff">
        <p className="floor-note">{t('floor.loading')}</p>
      </div>
    );
  }

  // The kitchen gets its queue, not the room. The floor is refused to it by the
  // server, and branching here keeps every read it cannot make out of the tree
  // rather than guarding each one inside the floor screen.
  if (resolved.role === 'kitchen') {
    return <KitchenRoute identity={resolved} device={device} paused={paused} />;
  }

  return <FloorRoute identity={resolved} device={device} paused={paused} />;
}
