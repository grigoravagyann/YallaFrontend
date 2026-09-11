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
  // screens in. Runs whenever the tablet becomes enrolled-but-locked, which is
  // also every launch.
  useEffect(() => {
    if (!staffSession || !restored) return;
    if (snapshot.state !== 'locked' || snapshot.device) return;
    void staffSession.refreshDevice().catch(() => undefined);
  }, [restored, snapshot.state, snapshot.device]);

  useTouchOnInteraction(snapshot.state === 'signedIn');

  const locked = staffAuthAvailable && snapshot.state !== 'signedIn';

  if (!restored) {
    return (
      <div className="staff-gate" data-surface="staff">
        <p className="floor-note">{t('floor.loading')}</p>
      </div>
    );
  }

  if (staffAuthAvailable && snapshot.state === 'unenrolled') {
    return <EnrolDeviceScreen reason={snapshot.lastSignOut === 'expired' ? 'revoked' : 'never'} />;
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
      ) : null}

      {locked ? <PinScreen device={snapshot.device} lastSignOut={snapshot.lastSignOut} /> : null}
    </>
  );
}

/**
 * The floor — or, for the kitchen, the order queue — given whichever identity
 * this build has.
 *
 * Against a real backend that is the staff session's. Against the mock there is
 * no tablet credential to hold — signing in is the one thing a mock cannot
 * honestly simulate — so the dev role switcher supplies the role and the mock's
 * own branch supplies the scope, exactly as it did before this screen had a
 * sign-in at all.
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

  return <FloorRoute identity={resolved} paused={paused} />;
}
