import {
  FULL_FEATURES,
  isPhoneDevice,
  type EnrolledDevice,
  type StaffSessionIdentity,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useStaffGateway } from '@yalla/api/react';
import { useQueryClient } from '@tanstack/react-query';
import { usingMockData } from '../data/gateway';
import { registerServiceWorker } from '../offline/registerServiceWorker';
import { useCurrentUser } from '../auth/useCurrentUser';
import { staffDeviceStore } from './auth/deviceStore';
import { EnrolDeviceScreen } from './auth/EnrolDeviceScreen';
import { PinScreen } from './auth/PinScreen';
import { staffAuthAvailable, staffSession } from './auth/staffSession';
import { useStaffSessionSnapshot, useTouchOnInteraction } from './auth/useStaffSession';
import { FloorRoute } from './FloorRoute';
import { KitchenRoute } from './KitchenRoute';
import { PairPhoneScreen } from './pair/PairPhoneScreen';
import { PhonePinScreen } from './phone/PhonePinScreen';
import { usePhoneLayout } from './phone/usePhoneLayout';
// Caught at load: Chrome offers "install" once, early (`installPrompt.ts`).
import './pwa/installPrompt';
import { disablePush } from './pwa/webPush';
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
  const location = useLocation();
  const navigate = useNavigate();
  const phone = usePhoneLayout();
  /** `/staff/pair`: pairing a personal phone (staff phone, Main artboard). */
  const onPairPath = /^\/staff\/pair\/?$/u.test(location.pathname);
  /** "Setting up a floor tablet instead?" on a phone-sized screen: the tablet's code screen. */
  const [tabletSetup, setTabletSetup] = useState(false);

  // The staff app's worker — the floor's offline shell and the phone's pushes
  // — is registered here as well as at boot: a manager may reach `/staff`
  // from the console without a reload.
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // A tapped notification, with the app already open: the worker focuses this
  // window and says where to go, rather than reloading it over a half-entered
  // order (`public/sw.js`).
  useEffect(() => {
    const worker = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
    if (!worker) return;
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (
        typeof data === 'object' &&
        data !== null &&
        (data as { type?: unknown }).type === 'staff-push-open' &&
        typeof (data as { url?: unknown }).url === 'string' &&
        (data as { url: string }).url.startsWith('/staff')
      ) {
        navigate((data as { url: string }).url);
      }
    };
    worker.addEventListener('message', onMessage);
    return () => worker.removeEventListener('message', onMessage);
  }, [navigate]);

  /**
   * More → "Unpair this phone", after its confirm: the server revokes this
   * phone and ends its session, the browser's push subscription goes, the
   * device token is forgotten, and the next screen is pairing again.
   *
   * Nothing of the person stays behind either: their name on the device's
   * list of known people, and every answer read under their session — the
   * floor, the guests' messages, this device's notification switches — which
   * the next pairing, perhaps somebody else's, would otherwise be shown first.
   */
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  const boundStaffId = isPhoneDevice(snapshot.device)
    ? (snapshot.device.boundStaffMember?.id ?? null)
    : null;
  const unpair = useCallback(async () => {
    await gateway.unpairOwnPhone();
    await disablePush(null);
    await staffSession?.forgetDevice();
    if (boundStaffId) await staffDeviceStore.forgetStaff(boundStaffId);
    queryClient.clear();
    navigate('/staff/pair', { replace: true });
  }, [gateway, navigate, queryClient, boundStaffId]);

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
    onPairPath
      ? t('phone.pair.title')
      : staffAuthAvailable && (snapshot.state === 'unenrolled' || justEnrolled)
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

  if (staffAuthAvailable && onPairPath) {
    // Already enrolled: a phone may pair again (the server reuses it), a
    // floor tablet is refused - its device is read first if not known yet.
    const enrolled = snapshot.state === 'locked' || snapshot.state === 'signedIn';
    const enrolledTablet = !enrolled
      ? null
      : !snapshot.device
        ? ('unknown' as const)
        : isPhoneDevice(snapshot.device)
          ? null
          : snapshot.device;
    return (
      <PairPhoneScreen
        enrolledTablet={enrolledTablet}
        onCancel={() => navigate('/staff', { replace: true })}
        onRecheck={() => void staffSession?.refreshDevice().catch(() => undefined)}
        onTablet={() => {
          setTabletSetup(true);
          navigate('/staff', { replace: true });
        }}
        onFinish={() => navigate('/staff', { replace: true })}
      />
    );
  }

  // A phone that is not paired starts at pairing; a tablet-sized screen, or
  // somebody who chose "a floor tablet instead", at the tablet's code.
  if (staffAuthAvailable && snapshot.state === 'unenrolled' && phone && !tabletSetup) {
    return <Navigate to="/staff/pair" replace />;
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
          <StaffFloor
            paused={locked}
            identity={identity}
            device={snapshot.device}
            onUnpair={isPhoneDevice(snapshot.device) ? unpair : undefined}
          />
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

      {locked ? (
        isPhoneDevice(snapshot.device) && snapshot.device.boundStaffMember ? (
          // A personal phone opens with its own person's PIN, and nobody else's.
          <PhonePinScreen device={snapshot.device} lastSignOut={snapshot.lastSignOut} />
        ) : (
          <PinScreen device={snapshot.device} lastSignOut={snapshot.lastSignOut} />
        )
      ) : null}
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
  onUnpair,
}: {
  readonly paused: boolean;
  readonly identity: StaffSessionIdentity | null;
  readonly device: EnrolledDevice | null;
  readonly onUnpair: (() => Promise<void>) | undefined;
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
          // The dev role switcher has no session to read them from: all of them.
          features: FULL_FEATURES,
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

  return <FloorRoute identity={resolved} device={device} paused={paused} onUnpair={onUnpair} />;
}
