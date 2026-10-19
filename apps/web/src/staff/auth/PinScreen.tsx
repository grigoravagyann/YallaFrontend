import {
  PinLockedError,
  PinRejectedError,
  describeFailure,
  isOnShiftAt,
  type EnrolledDevice,
  type StaffRosterEntry,
  type StaffSignOutReason,
  type UserRole,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useMinuteClock } from '../useMinuteClock';
import { staffDeviceStore, type KnownStaffMember } from './deviceStore';
import { staffSession } from './staffSession';

/**
 * Four digits, standing up, with a thumb: the PIN gate over the floor (Pin
 * artboard).
 *
 * The most-used sign-in in the product and the one with the least patience
 * behind it. Everything here follows from that:
 *
 * - **Who is on shift comes first.** The roster says who has a shift running
 *   at this branch; those names are the list, and everybody else the roster
 *   allows is one tap away under "Someone else", with the typed staff id last.
 *   Shifts order the list and never narrow it: anybody the server accepts can
 *   sign in, on shift or not.
 * - **The keys are 96×76.** A waiter is holding the tablet in one hand and
 *   pressing with the other thumb, sometimes with wet fingers.
 * - **The venue, the branch and the device are on the card**, always. A tablet
 *   that will act on the wrong branch is worth noticing before the shift, not
 *   in an audit row afterwards.
 * - **The remaining attempts show after every wrong PIN**, and the lockout says
 *   a manager can clear it. A waiter locked out mid-rush with no explanation
 *   goes back to paper that evening, and paper does not come back.
 * - **Offline, the pad is off and says why.** A PIN is checked by the server;
 *   a pad that takes four digits and then fails is worse than one that says
 *   up front it needs the network.
 *
 * ## Where the names come from
 *
 * `POST /api/auth/staff/pin` takes a `staffMemberId`. Online, the names are the
 * branch roster (`GET /api/auth/staff/roster`, read with the device token), so
 * a person tapping their name for the first time needs nothing else. When the
 * roster cannot be had — offline, or it failed — the names are everybody this
 * tablet remembers, and "Someone else" takes a typed id, which a manager copies
 * from the console.
 */

export interface PinScreenProps {
  readonly device: EnrolledDevice | null;
  /** Why the last session ended, for the line above the names. */
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

/**
 * Shown after every wrong PIN, as the SMS code screen does ("4 attempts
 * left"). It used to appear only before the last attempt, which in practice
 * meant a waiter saw "not recognised" four times and then a lockout with no
 * warning in between.
 */
const WARN_FROM_REMAINING = ASSUMED_MAX_ATTEMPTS - 1;

/**
 * How often a gate left open reads the roster again: who is on shift is
 * re-judged every minute from the shifts' own instants, but a shift added in
 * the console, or tomorrow's once the day turns, only arrives with a read.
 */
const ROSTER_REFRESH_MS = 10 * 60_000;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'other', '0', 'del'] as const;
type Key = (typeof KEYS)[number];

/** One name to tap: from the roster, or remembered by this tablet (no role, no shift). */
interface Person {
  readonly staffMemberId: string;
  readonly fullName: string;
  readonly entry: StaffRosterEntry | null;
}

export function PinScreen({ device, lastSignOut }: PinScreenProps) {
  const { t } = useTranslation(['staff', 'common']);
  const now = useMinuteClock();
  const online = useOnline();
  const listId = useId();
  const othersId = useId();

  const [known, setKnown] = useState<readonly KnownStaffMember[]>([]);
  /** `null` until the roster answers, and for good if it fails. */
  const [roster, setRoster] = useState<readonly StaffRosterEntry[] | null>(null);
  const [rosterFailed, setRosterFailed] = useState(false);
  const [staffMemberId, setStaffMemberId] = useState<string | null>(null);
  /** "By staff ID" was chosen: the id field is showing. */
  const [someoneElse, setSomeoneElse] = useState(false);
  /** The people off shift are showing under "Someone else". */
  const [showOthers, setShowOthers] = useState(false);
  /** Somebody touched the choice, so a late preselect must not overrule them. */
  const chose = useRef(false);
  const [typedId, setTypedId] = useState('');
  const [pin, setPinState] = useState('');
  /** The digits as of the last tap, ahead of the render that shows them. */
  const entered = useRef('');
  const setPin = useCallback((next: string | ((current: string) => string)) => {
    entered.current = typeof next === 'function' ? next(entered.current) : next;
    setPinState(entered.current);
  }, []);
  /** The dialog, focused when it opens: the lock leaves focus on the inert floor. */
  const dialogRef = useRef<HTMLDivElement>(null);
  /** "Someone else" was opened by a tap: its first name takes focus once it shows. */
  const focusOthers = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'wrong' | 'locked' | 'offline' | 'failed' | null>(null);
  /** The server locked the chosen person's PIN; until when, when it said. */
  const [lock, setLock] = useState<{ readonly until: string | null } | null>(null);
  /** Consecutive wrong PINs for the person currently selected. */
  const [attempts, setAttempts] = useState(0);

  // The roster is the better list whenever it can be had. A failure is not an
  // error on this screen — the remembered names and the id field still work —
  // so it becomes a quiet note, not an alert, and a later read that fails
  // keeps the list already on screen. A revoked device is the session's
  // business: it unenrols, and the gate swaps this screen out.
  const alive = useRef(true);
  const readRoster = useCallback(() => {
    staffSession
      ?.roster()
      .then((entries) => {
        if (!alive.current) return;
        setRoster(entries);
        setRosterFailed(false);
      })
      .catch(() => {
        if (alive.current) setRosterFailed(true);
      });
  }, []);

  useEffect(() => {
    alive.current = true;
    void staffDeviceStore.readKnownStaff().then((people) => {
      if (alive.current) setKnown(people);
    });
    readRoster();
    const timer = setInterval(readRoster, ROSTER_REFRESH_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [readRoster]);

  // Back online: read the roster again rather than wait ten minutes for it.
  // Going offline drops half-typed digits, as the pad goes off under them.
  // Only on a change: the opening read above is the only one on mount.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online === wasOnline.current) return;
    wasOnline.current = online;
    if (online) readRoster();
    else setPin('');
  }, [online, readRoster, setPin]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const people: readonly Person[] = roster
    ? roster.map((entry) => ({
        staffMemberId: entry.staffMemberId,
        fullName: entry.fullName,
        entry,
      }))
    : known.map((person) => ({ ...person, entry: null }));

  // On shift by the shifts' own instants, re-judged on every minute's tick:
  // a gate left open over a shift change keeps up without a read.
  const onShift = people.filter((person) => person.entry && isOnShiftAt(person.entry, now));
  const offShift = people.filter((person) => !onShift.includes(person));
  const grouped = onShift.length > 0 && offShift.length > 0;
  const listed = grouped ? onShift : people;

  // One person on the tablet is the common case at a small cafe: preselect
  // them so the shift starts with four taps and nothing else.
  const onlyId = people.length === 1 ? (people[0]?.staffMemberId ?? null) : null;
  useEffect(() => {
    if (!chose.current && onlyId) setStaffMemberId(onlyId);
  }, [onlyId]);

  useEffect(() => {
    if (!showOthers || !focusOthers.current) return;
    focusOthers.current = false;
    document.getElementById(othersId)?.querySelector<HTMLElement>('button')?.focus();
  }, [showOthers, othersId]);

  const typing = staffMemberId === null && (someoneElse || people.length === 0);
  const chosenId = staffMemberId ?? (typing ? typedId.trim() || null : null);
  const chosen = people.find((person) => person.staffMemberId === staffMemberId);
  const locked = lock !== null && (lock.until === null || Date.parse(lock.until) > now.getTime());
  const padOff = busy || chosenId === null || locked || !online;

  function reset(): void {
    setPin('');
    setAttempts(0);
    setFailure(null);
    setLock(null);
  }

  function pick(person: Person): void {
    // The same person again: their misses still count, as the server's do.
    if (person.staffMemberId === staffMemberId) {
      setPin('');
      return;
    }
    chose.current = true;
    setSomeoneElse(false);
    setStaffMemberId(person.staffMemberId);
    setTypedId('');
    reset();
  }

  function typeId(): void {
    chose.current = true;
    setSomeoneElse(true);
    setStaffMemberId(null);
    reset();
  }

  /** "Someone else": the people off shift when there are any, else the id field. */
  function other(): void {
    if (grouped) {
      focusOthers.current = true;
      setShowOthers(true);
      return;
    }
    typeId();
  }

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
        setLock({ until: error.lockedUntilUtc });
        setFailure('locked');
      } else if (error instanceof PinRejectedError) {
        setAttempts((current) => current + 1);
        setFailure('wrong');
      } else {
        setFailure(describeFailure(error) === 'offline' ? 'offline' : 'failed');
      }
    } finally {
      setBusy(false);
    }
  }

  function press(key: Key): void {
    if (key === 'other') {
      other();
      return;
    }
    if (key === 'del') {
      setPin((current) => current.slice(0, -1));
      return;
    }
    // Four digits is the PIN the console sets, and the pad sends itself at
    // four. Sent from here, not from inside a state updater: React may run an
    // updater twice, and twice is two attempts against the lockout.
    const next = (entered.current + key).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(next);
  }

  // A tablet with a keyboard docked, or a laptop at the counter: the digit
  // keys and Backspace work the pad as a tap would. Not while a field (the
  // typed staff id) has the keys, and not while the pad itself is off.
  const keys = useRef({ press, ready: !padOff });
  useEffect(() => {
    keys.current = { press, ready: !padOff };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { press: tap, ready } = keys.current;
      if (!ready || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (/^[0-9]$/u.test(event.key)) {
        event.preventDefault();
        tap(event.key as Key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        tap('del');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const remaining = Math.max(0, ASSUMED_MAX_ATTEMPTS - attempts);
  const showRemaining =
    failure === 'wrong' && remaining > 0 && remaining <= WARN_FROM_REMAINING && !locked;
  const wrongNow = failure === 'wrong' && pin.length === 0;
  const role = chosen?.entry ? roleLabel(t, chosen.entry.role) : null;

  const personButton = (person: Person) => {
    const meta = personMeta(t, person.entry, now);
    const metaId = `${listId}-${person.staffMemberId}`;
    return (
      <button
        key={person.staffMemberId}
        type="button"
        className="ft-pin-person"
        aria-pressed={staffMemberId === person.staffMemberId}
        aria-label={person.fullName}
        aria-describedby={meta ? metaId : undefined}
        onClick={() => pick(person)}
      >
        <span className="ft-pin-avatar" aria-hidden="true">
          {initialsOf(person.fullName)}
        </span>
        <span className="ft-pin-name">{person.fullName}</span>
        {meta ? (
          <span className="ft-pin-meta" id={metaId}>
            {meta}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="staff-gate ft-gate" data-surface="staff">
      <div
        ref={dialogRef}
        className="ft-pin"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${listId}-h`}
        tabIndex={-1}
      >
        <div className="ft-pin-left">
          <span className="ft-pin-brand">{t('common:appName')}</span>
          {/* Where this tablet thinks it is. First, and never collapsed: a
              tablet bound to the wrong branch is cheap to catch here and
              expensive to catch anywhere else. */}
          <div className="ft-pin-where">
            <b>{device ? `${device.venueName} · ${device.branchName}` : t('pin.branchUnknown')}</b>
            <span>
              {device
                ? t('pin.deviceLine', {
                    device: device.deviceName,
                    connection: online ? t('pin.connected') : t('pin.noConnection'),
                  })
                : t('pin.deviceUnknown')}
            </span>
          </div>

          {lastSignOut === 'idle' || lastSignOut === 'expired' ? (
            <p className="ft-pin-note">
              <LockIcon />
              <span>{lastSignOut === 'idle' ? t('pin.lockedByIdle') : t('pin.sessionEnded')}</span>
            </p>
          ) : null}

          <div className="ft-pin-people">
            <h2 id={`${listId}-who`}>
              {onShift.length > 0 ? t('pin.onShift') : t('pin.whoTitle')}
            </h2>
            <div className="ft-pin-scroll">
              <div className="ft-pin-list" role="group" aria-labelledby={`${listId}-who`}>
                {listed.map(personButton)}
                <button
                  type="button"
                  className="ft-pin-person is-other"
                  aria-label={t('pin.someoneElse')}
                  aria-describedby={`${listId}-other`}
                  {...(grouped
                    ? { 'aria-expanded': showOthers, 'aria-controls': othersId }
                    : { 'aria-pressed': typing })}
                  onClick={() => {
                    if (!grouped) {
                      typeId();
                      return;
                    }
                    focusOthers.current = !showOthers;
                    setShowOthers(!showOthers);
                  }}
                >
                  <span className="ft-pin-avatar" aria-hidden="true">
                    ?
                  </span>
                  <span className="ft-pin-name">{t('pin.someoneElse')}</span>
                  <span className="ft-pin-meta" id={`${listId}-other`}>
                    {grouped ? t('pin.someoneElseMore', { count: offShift.length }) : t('pin.byId')}
                  </span>
                </button>
              </div>

              {grouped ? (
                <div
                  id={othersId}
                  className="ft-pin-list"
                  role="group"
                  aria-label={t('pin.someoneElse')}
                  tabIndex={-1}
                  hidden={!showOthers}
                >
                  {offShift.map(personButton)}
                  <button
                    type="button"
                    className="ft-pin-person is-other"
                    aria-pressed={typing}
                    onClick={typeId}
                  >
                    {t('pin.byStaffId')}
                  </button>
                </div>
              ) : null}
            </div>
            {rosterFailed ? <p className="ft-pin-stale">{t('pin.rosterFailed')}</p> : null}
            {/* Under the names it stands in for, so the pad keeps its place. */}
            {typing ? (
              <label className="ft-pin-id">
                <span>{t('pin.staffId')}</span>
                <input
                  value={typedId}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setTypedId(event.target.value)}
                />
                <small>{t('pin.staffIdWhy')}</small>
              </label>
            ) : null}
          </div>
        </div>

        <div className="ft-pin-right">
          <div className="ft-pin-prompt">
            <h1 id={`${listId}-h`}>
              {chosen
                ? t('pin.promptNamed', { name: chosen.fullName.split(/\s+/u)[0] })
                : t('pin.prompt')}
            </h1>
            {role ? (
              <p>{t('pin.promptSub', { role })}</p>
            ) : typing && !typedId.trim() ? (
              <p>{t('pin.promptSubTyping')}</p>
            ) : null}
          </div>

          {/* The digits, as dots. Never the numbers: this screen is held at
              chest height in a room with other people in it. */}
          <output
            className={`ft-pin-dots${wrongNow ? ' is-wrong' : ''}`}
            aria-label={t('pin.entered', { count: pin.length })}
          >
            {[0, 1, 2, 3].map((index) => (
              <span key={index} className={index < pin.length ? 'is-filled' : undefined} />
            ))}
          </output>

          {/* One announcement per message: a failure is an alert of its own,
              the offline line a polite status, and "signing in" is only
              shown — said on every send it would talk over the result. */}
          <div className="ft-pin-msg">
            {busy ? (
              <p>{t('pin.working')}</p>
            ) : !online || failure === 'offline' ? (
              <p className="is-offline" role="status">
                {t('pin.offline')}
              </p>
            ) : locked ? (
              <p className="is-error" role="alert">
                <span>{t('pin.locked')}</span>
                <small>{t('pin.askManager')}</small>
              </p>
            ) : failure === 'wrong' ? (
              <p className="is-error" role="alert">
                <span>{t('pin.wrong')}</span>
                {showRemaining ? <span> {t('pin.attemptsLeft', { count: remaining })}</span> : null}
              </p>
            ) : failure === 'failed' ? (
              <p className="is-error" role="alert">
                {t('pin.failed')}
              </p>
            ) : null}
          </div>

          <div className="ft-pin-keys" role="group" aria-label={t('pin.keypad')}>
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`ft-pin-key${key === 'other' || key === 'del' ? ' is-fn' : ''}`}
                disabled={key !== 'other' && padOff}
                aria-label={
                  key === 'del' ? t('cash.delete') : key === 'other' ? t('pin.otherKeyName') : key
                }
                onClick={() => press(key)}
              >
                {key === 'del' ? '⌫' : key === 'other' ? t('pin.otherKey') : key}
              </button>
            ))}
          </div>

          <p className="ft-pin-foot">{t('pin.foot')}</p>
        </div>
      </div>
    </div>
  );
}

/** Whether the browser says it is online, kept current by its events. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function roleLabel(t: TFunction, role: UserRole): string {
  return t(`pin.role.${role}`);
}

/** "Waiter · until 23:00", "Waiter · from 18:00", or just the role. */
function personMeta(t: TFunction, entry: StaffRosterEntry | null, now: Date): string | null {
  if (!entry) return null;
  const role = roleLabel(t, entry.role);
  if (!entry.shift) return role;
  if (isOnShiftAt(entry, now)) {
    return t('pin.meta', { role, when: t('pin.until', { time: entry.shift.endsAt }) });
  }
  if (Date.parse(entry.shift.startsAtUtc) > now.getTime()) {
    return t('pin.meta', { role, when: t('pin.from', { time: entry.shift.startsAt }) });
  }
  return role;
}

/** Two letters for a face: the first of the first two words. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toLocaleUpperCase())
    .join('');
}

function LockIcon() {
  return (
    <svg className="ft-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3"
        y="11"
        width="18"
        height="11"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}
