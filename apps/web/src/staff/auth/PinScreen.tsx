import {
  PinLockedError,
  PinRejectedError,
  describeFailure,
  type EnrolledDevice,
  type StaffSignOutReason,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useState } from 'react';
import { staffDeviceStore, type KnownStaffMember } from './deviceStore';
import { staffSession } from './staffSession';

/**
 * Four digits, standing up, with a thumb.
 *
 * The most-used sign-in in the product and the one with the least patience
 * behind it. Everything here follows from that:
 *
 * - **Keys are 88px.** A waiter is holding the tablet in one hand and pressing
 *   with the other thumb, sometimes with wet fingers. The number pad is the
 *   whole lower half of the card.
 * - **The branch and the device name are above the keypad**, always. A tablet
 *   that will act on the wrong branch is worth noticing before the shift, not
 *   in an audit row afterwards.
 * - **The remaining attempts appear before the last one**, and the lockout says
 *   a manager can clear it. A waiter locked out mid-rush with no explanation
 *   goes back to paper that evening, and paper does not come back.
 *
 * ## Why there is a list of names and an id field
 *
 * `POST /api/auth/staff/pin` takes a `staffMemberId`, and **no endpoint lists a
 * branch's staff to a device token** — the staff list is `ManagerOrAbove` and
 * venue-scoped. So the tablet remembers everybody who has signed in on it and
 * shows them as tiles, and a person this tablet has never seen enters their id
 * once. That is not a good first-run experience and it is the only one the API
 * permits today; the fix is a device-readable roster, noted in the README.
 */

export interface PinScreenProps {
  readonly device: EnrolledDevice | null;
  /** Why the last session ended, for the line above the keypad. */
  readonly lastSignOut: StaffSignOutReason | null;
}

/**
 * How many wrong PINs the server tolerates.
 *
 * **The client's own count, not the server's.** `AuthOptions.PinMaxAttempts`
 * defaults to five and is not reported on any response, so this device counts
 * its own consecutive failures and warns before what it believes is the last
 * one. If a venue has configured a different limit the warning is early or
 * late by an attempt; the lockout itself is always accurate, because that comes
 * from the server.
 */
const ASSUMED_MAX_ATTEMPTS = 5;

/** Shown before the last attempt only. Earlier warnings are noise. */
const WARN_FROM_REMAINING = 2;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export function PinScreen({ device, lastSignOut }: PinScreenProps) {
  const { t } = useTranslation(['staff', 'common']);

  const [known, setKnown] = useState<readonly KnownStaffMember[]>([]);
  const [staffMemberId, setStaffMemberId] = useState<string | null>(null);
  const [typedId, setTypedId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  /** Consecutive wrong PINs for the person currently selected. */
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void staffDeviceStore.readKnownStaff().then((people) => {
      if (cancelled) return;
      setKnown(people);
      // One person on the tablet is the common case at a small cafe: preselect
      // them so the shift starts with four taps and nothing else.
      if (people.length === 1) setStaffMemberId(people[0]?.staffMemberId ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const chosenId = staffMemberId ?? (typedId.trim() || null);
  const chosenName = known.find((person) => person.staffMemberId === staffMemberId)?.fullName;

  async function submit(digits: string): Promise<void> {
    if (!staffSession || !chosenId) return;
    setBusy(true);
    setFailure(null);
    try {
      const identity = await staffSession.signInWithPin({ staffMemberId: chosenId, pin: digits });
      await staffDeviceStore.rememberStaff({
        staffMemberId: identity.staffMemberId,
        fullName: identity.fullName,
      });
      setAttempts(0);
      setPin('');
      // Nothing to call back to: the session is the store, and the gate above
      // re-renders from it. A callback here would be a second source of truth
      // about who is signed in.
    } catch (error) {
      setPin('');
      if (error instanceof PinLockedError) {
        setLockedUntil(error.lockedUntilUtc);
        setFailure(t('pin.locked'));
      } else if (error instanceof PinRejectedError) {
        setAttempts((current) => current + 1);
        setFailure(t('pin.wrong'));
      } else {
        const kind = describeFailure(error);
        setFailure(kind === 'offline' ? t('pin.offline') : t('pin.failed'));
      }
    } finally {
      setBusy(false);
    }
  }

  function press(key: (typeof KEYS)[number]): void {
    if (key === '') return;
    if (key === 'del') {
      setPin((current) => current.slice(0, -1));
      return;
    }
    setPin((current) => {
      // Four is the shortest PIN the backend accepts and the length every
      // venue will use; a longer one still works through "Sign in".
      const next = (current + key).slice(0, 8);
      if (next.length === 4) void submit(next);
      return next;
    });
  }

  const remaining = Math.max(0, ASSUMED_MAX_ATTEMPTS - attempts);
  const showRemaining =
    attempts > 0 && remaining > 0 && remaining <= WARN_FROM_REMAINING && lockedUntil === null;

  return (
    <div className="staff-gate" data-surface="staff">
      <section className="staff-gate-card card pin-card">
        {/* Where this tablet thinks it is. First, and never collapsed into a
            subtitle: a tablet bound to the wrong branch is cheap to catch here
            and expensive to catch anywhere else. */}
        <header className="pin-where">
          <h1>{device?.branchName ?? t('pin.branchUnknown')}</h1>
          <p className="muted">
            {device ? `${device.venueName} · ${device.deviceName}` : t('pin.deviceUnknown')}
          </p>
        </header>

        {lastSignOut === 'idle' ? (
          <p className="table-note">{t('pin.lockedByIdle')}</p>
        ) : lastSignOut === 'expired' ? (
          <p className="table-note">{t('pin.sessionEnded')}</p>
        ) : null}

        {/* Who is signing in. Tiles for everybody this tablet has seen. */}
        {known.length > 0 ? (
          <div className="pin-people" role="group" aria-label={t('pin.whoTitle')}>
            {known.map((person) => (
              <button
                key={person.staffMemberId}
                type="button"
                className={`pin-person ${staffMemberId === person.staffMemberId ? 'is-on' : ''}`}
                aria-pressed={staffMemberId === person.staffMemberId}
                onClick={() => {
                  setStaffMemberId(person.staffMemberId);
                  setTypedId('');
                  setPin('');
                  setAttempts(0);
                  setFailure(null);
                  setLockedUntil(null);
                }}
              >
                {person.fullName}
              </button>
            ))}
            <button
              type="button"
              className={`pin-person pin-person-other ${staffMemberId === null ? 'is-on' : ''}`}
              aria-pressed={staffMemberId === null}
              onClick={() => {
                setStaffMemberId(null);
                setPin('');
                setAttempts(0);
                setFailure(null);
              }}
            >
              {t('pin.someoneElse')}
            </button>
          </div>
        ) : null}

        {staffMemberId === null ? (
          <label className="labelled">
            {t('pin.staffId')}
            <input
              className="field"
              value={typedId}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTypedId(event.target.value)}
            />
            <span className="table-note">{t('pin.staffIdWhy')}</span>
          </label>
        ) : null}

        <p className="pin-prompt">
          {chosenName ? t('pin.promptNamed', { name: chosenName }) : t('pin.prompt')}
        </p>

        {/* The digits, as dots. Never the numbers: this screen is held at chest
            height in a room with other people in it. */}
        <output className="pin-dots" aria-label={t('pin.entered', { count: pin.length })}>
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className={`pin-dot ${index < pin.length ? 'is-filled' : ''}`} />
          ))}
        </output>

        {failure ? (
          <p className="error" role="alert">
            {failure}
          </p>
        ) : null}
        {showRemaining ? (
          <p className="table-warn">{t('pin.attemptsLeft', { count: remaining })}</p>
        ) : null}
        {lockedUntil !== null || failure === t('pin.locked') ? (
          <p className="table-warn">{t('pin.askManager')}</p>
        ) : null}

        <div className="pin-keypad">
          {KEYS.map((key, index) => (
            <button
              key={`${key}-${index}`}
              type="button"
              className={`pin-key ${key === '' ? 'is-blank' : ''}`}
              disabled={key === '' || busy || chosenId === null}
              aria-label={key === 'del' ? t('cash.delete') : key || undefined}
              aria-hidden={key === '' ? true : undefined}
              onClick={() => press(key)}
            >
              {key === 'del' ? '⌫' : key}
            </button>
          ))}
        </div>

        {/* For a PIN longer than four digits. The four-digit case never needs
            it — the keypad submits itself — so this is quiet, not primary. */}
        <button
          type="button"
          className="button big full"
          disabled={busy || pin.length < 4 || chosenId === null}
          onClick={() => void submit(pin)}
        >
          {busy ? t('pin.working') : t('pin.submit')}
        </button>
      </section>
    </div>
  );
}
