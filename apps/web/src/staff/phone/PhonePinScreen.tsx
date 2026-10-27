import {
  isFeatureNotEnabled,
  PinLockedError,
  PinRejectedError,
  describeFailure,
  type EnrolledDevice,
  type StaffSignOutReason,
} from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { Wordmark } from '../../components/Wordmark';
import { staffDeviceStore } from '../auth/deviceStore';
import { staffSession } from '../auth/staffSession';
import { PhoneKeypad } from '../pair/PhoneKeypad';
import { useMinuteClock } from '../useMinuteClock';
import './phone.css';
import '../pair/pair.css';

export interface PhonePinScreenProps {
  /** A paired phone: `kind` 2, and the one person it belongs to. */
  readonly device: EnrolledDevice;
  readonly lastSignOut: StaffSignOutReason | null;
}

/** The PIN screen's own count before it warns: the server never reports one. */
const ASSUMED_MAX_ATTEMPTS = 5;

/**
 * Unlocking a personal phone (Pin artboard): its person, their PIN, nothing
 * else. No list of names — the server takes only this person's id on a phone,
 * and anybody else's would be refused as a wrong PIN anyway.
 *
 * Over the phone's screens, which stay mounted underneath, as the tablet's
 * PIN gate is over its floor.
 */
export function PhonePinScreen({ device, lastSignOut }: PhonePinScreenProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { locale } = useLocale();
  const now = useMinuteClock();
  const headingId = useId();
  const person = device.boundStaffMember;
  const [pin, setPinState] = useState('');
  const entered = useRef('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'wrong' | 'offline' | 'phoneOff' | 'failed' | null>(null);
  const [lock, setLock] = useState<{ readonly until: string | null } | null>(null);
  // The device read says staff phones are off at the branch: said before a PIN.
  // Or the lock said so and no device read has answered since: a read that
  // answers with the feature back clears it.
  const phoneOffHere = Array.isArray(device.features)
    ? !device.features.includes('staffPhone')
    : lastSignOut === 'phoneOff';
  const [attempts, setAttempts] = useState(0);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
    const up = () => setOnline(true);
    const down = () => {
      setOnline(false);
      entered.current = '';
      setPinState('');
    };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const locked = lock !== null && (lock.until === null || Date.parse(lock.until) > now.getTime());
  const padOff = busy || locked || !online || !person;

  function setPin(next: string): void {
    entered.current = next;
    setPinState(next);
  }

  async function submit(digits: string): Promise<void> {
    if (!staffSession || !person) return;
    setBusy(true);
    setFailure(null);
    try {
      const identity = await staffSession.signInWithPin({ staffMemberId: person.id, pin: digits });
      await staffDeviceStore.rememberStaff({
        staffMemberId: identity.staffMemberId,
        fullName: identity.fullName,
      });
      setAttempts(0);
      setPin('');
    } catch (error) {
      setPin('');
      if (error instanceof PinLockedError) {
        setLock({ until: error.lockedUntilUtc });
      } else if (error instanceof PinRejectedError) {
        setAttempts((count) => count + 1);
        setFailure('wrong');
      } else if (isFeatureNotEnabled(error)) {
        // Staff phones are switched off at the branch: a PIN will not fix it.
        setFailure('phoneOff');
      } else {
        setFailure(describeFailure(error) === 'offline' ? 'offline' : 'failed');
      }
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string): void {
    if (padOff) return;
    const next = (entered.current + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(next);
  }

  const firstName = person?.fullName.split(/\s+/u)[0] ?? '';
  const initials = (person?.fullName ?? '')
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase(locale))
    .join('');
  const remaining = Math.max(0, ASSUMED_MAX_ATTEMPTS - attempts);

  const message = busy
    ? { text: t('pin.working'), tone: 'quiet' }
    : !online || failure === 'offline'
      ? { text: t('pin.offline'), tone: 'warn' }
      : locked
        ? { text: `${t('pin.locked')} ${t('pin.askManager')}`, tone: 'error' }
        : failure === 'wrong'
          ? {
              text:
                remaining > 0 && remaining < ASSUMED_MAX_ATTEMPTS
                  ? `${t('phone.pin.wrong')} · ${t('pin.attemptsLeft', { count: remaining })}`
                  : t('phone.pin.wrong'),
              tone: 'error',
            }
          : failure === 'phoneOff' || phoneOffHere
            ? { text: `${t('features.phoneOff')} ${t('features.askManager')}`, tone: 'error' }
            : failure === 'failed'
              ? { text: t('pin.failed'), tone: 'error' }
              : lastSignOut === 'idle'
                ? { text: t('pin.lockedByIdle'), tone: 'quiet' }
                : lastSignOut === 'expired'
                  ? { text: t('pin.sessionEnded'), tone: 'quiet' }
                  : { text: t('phone.pin.enter'), tone: 'quiet' };

  return (
    <div className="ph-lock" data-surface="staff">
      <div
        ref={dialog}
        className="ph-lock-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <div className="ph-lock-head">
          <span className="ph-lock-brand">
            <Wordmark />
          </span>
          <span className="ph-lock-where">
            {device.venueName && device.branchName
              ? `${device.venueName} · ${device.branchName}`
              : t('pin.branchUnknown')}
          </span>
          <span className="ph-lock-face" aria-hidden="true">
            {initials}
          </span>
          <h1 id={headingId} className="ph-lock-hello">
            {t('phone.pin.hello', { name: firstName })}
          </h1>
          {/* An error is an alert; everything else a polite status. */}
          <p
            className={`ph-lock-msg is-${message.tone}`}
            role={message.tone === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </p>
        </div>
        <PhoneKeypad
          tone="dark"
          length={pin.length}
          wrong={failure === 'wrong'}
          disabled={padOff}
          onDigit={press}
          onDelete={() => setPin(entered.current.slice(0, -1))}
        />
        <p className="ph-lock-foot">{t('phone.pin.forgot')}</p>
      </div>
    </div>
  );
}
