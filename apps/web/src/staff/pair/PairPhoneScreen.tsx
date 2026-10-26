import {
  KitchenPhoneNotAllowedError,
  PairingCodeExpiredError,
  PairingCodeInvalidError,
  PairingCodeUnusableError,
  PinLockedError,
  PinRejectedError,
  describeFailure,
  formatPairingCode,
  normalizeEnrolmentCode,
  pairingCodeFrom,
  ENROLMENT_CODE_LENGTH,
  type EnrolledDevice,
  type PhonePairingPreview,
} from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Wordmark } from '../../components/Wordmark';
import { staffDeviceStore } from '../auth/deviceStore';
import { staffSession } from '../auth/staffSession';
import { PhoneInstall } from '../phone/PhoneInstall';
import { thisDevice } from '../pwa/deviceName';
import { isIos, isStandalone } from '../pwa/webPush';
import { PhoneKeypad } from './PhoneKeypad';
import { QrScanner } from './QrScanner';
import '../phone/phone.css';
import './pair.css';

export interface PairPhoneScreenProps {
  /** "Setting up a floor tablet instead?": the tablet's enrolment code screen. */
  readonly onTablet: () => void;
  /** "Start", after the install screen: the phone's own screens. */
  readonly onFinish: () => void;
  /**
   * What this browser is enrolled as already, if anything: `null` when it is
   * nothing yet (or a phone, which may pair again), the device when it is a
   * floor tablet, `'unknown'` while an enrolled browser's device is being read.
   */
  readonly enrolledTablet?: EnrolledDevice | 'unknown' | null | undefined;
  /** Leaves pairing for the floor tablet this browser is: "Back to the floor tablet". */
  readonly onCancel?: (() => void) | undefined;
  /** Reads the enrolled device again, when the first read did not answer. */
  readonly onRecheck?: (() => void) | undefined;
}

type Step = 'intro' | 'scan' | 'code' | 'checking' | 'preview' | 'pin' | 'done' | 'install';

/** Why a code did not get as far as the PIN, or the PIN as far as a phone. */
type Failure = 'invalid' | 'expired' | 'unusable' | 'kitchen' | 'offline' | 'failed';

function failureOf(error: unknown): Failure {
  if (error instanceof PairingCodeExpiredError) return 'expired';
  if (error instanceof PairingCodeInvalidError) return 'invalid';
  if (error instanceof PairingCodeUnusableError) return 'unusable';
  if (error instanceof KitchenPhoneNotAllowedError) return 'kitchen';
  return describeFailure(error) === 'offline' ? 'offline' : 'failed';
}

/** The PIN screen's own count of misses before the warning: the server never says. */
const ASSUMED_MAX_ATTEMPTS = 5;

/**
 * Pairing a personal phone (Main artboard): what happens, scan the manager's
 * QR — or type its code — "is this you?", the person's own PIN, done, then
 * the install and notification screen (Install artboard).
 *
 * The code arrives in the URL's fragment when the QR was scanned with the
 * phone's own camera app (`/staff/pair#code=…`): it is taken from there and
 * wiped from the address at once, so it is not left in the history.
 */
export function PairPhoneScreen({
  onTablet,
  onFinish,
  enrolledTablet = null,
  onCancel,
  onRecheck,
}: PairPhoneScreenProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { locale } = useLocale();
  const headingId = useId();
  const fieldId = useId();
  const location = useLocation();
  const navigate = useNavigate();
  /** `#code=` from the QR (or `?code=`, should a chat app have moved it), read once. */
  const [fromUrl] = useState(() => pairingCodeFrom(`${location.search}${location.hash}`));
  const [step, setStep] = useState<Step>(fromUrl ? 'checking' : 'intro');
  const [code, setCode] = useState<string | null>(fromUrl);
  const [typed, setTyped] = useState('');
  const [typedShort, setTypedShort] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [preview, setPreview] = useState<PhonePairingPreview | null>(null);
  const [paired, setPaired] = useState<EnrolledDevice | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const [pin, setPinState] = useState('');
  const entered = useRef('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinFailure, setPinFailure] = useState<'wrong' | 'locked' | null>(null);
  const [attempts, setAttempts] = useState(0);

  /**
   * A browser that is the venue's floor tablet is not paired over (QA, staff
   * phone): pairing writes a phone's device token where the tablet's was, and
   * the tablet would stay live on the server with nobody holding it. A
   * tablet cannot unenrol itself either — revoking it is a manager's, in the
   * console — so the screen refuses and says how, rather than offering a
   * confirm it could not carry out properly.
   */
  //
  // Once this screen has sent a PIN it is pairing this browser itself, and
  // the session passes through "signed in, device not read yet" on the way:
  // that is not a reason to stop and check.
  const [pairing, setPairing] = useState(false);
  const guard = pairing
    ? null
    : enrolledTablet === 'unknown'
      ? 'checkingDevice'
      : enrolledTablet
        ? 'tablet'
        : null;

  const heading = useRef<HTMLHeadingElement>(null);
  // Each step's heading takes focus, so a screen reader hears where it is
  // and a keyboard starts from the top of it.
  useEffect(() => {
    heading.current?.focus();
  }, [step, guard]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** The preview's answer: "is this you?". */
  function previewed(found: PhonePairingPreview): void {
    if (!alive.current) return;
    setPreview(found);
    setStep('preview');
  }

  /** The preview's refusal: back where the code came from, saying why. */
  function previewFailed(error: unknown, from: 'intro' | 'code'): void {
    if (!alive.current) return;
    setFailure(failureOf(error));
    setStep(from);
  }

  function check(raw: string, from: 'intro' | 'code'): void {
    const normalized = pairingCodeFrom(raw);
    if (!normalized || !staffSession) {
      setFailure('invalid');
      setStep(from);
      return;
    }
    setCode(normalized);
    setFailure(null);
    setStep('checking');
    staffSession
      .previewPairing(normalized)
      .then(previewed, (error: unknown) => previewFailed(error, from));
  }

  // The code from the address, wiped from it at once so it is not left in the
  // history. The screen starts on "checking" for it, so nothing is set here
  // before the server answers.
  const arrivedWithCode = /[#?&]code=/u.test(`${location.search}${location.hash}`);
  useEffect(() => {
    if (arrivedWithCode) navigate(location.pathname, { replace: true });
    if (!fromUrl || !staffSession) return;
    staffSession
      .previewPairing(fromUrl)
      .then(previewed, (error: unknown) => previewFailed(error, 'intro'));
    // Once, on arrival: the two handlers only set state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl]);

  function onScanned(text: string): void {
    const found = pairingCodeFrom(text);
    if (!found) {
      setScanNote(t('phone.pair.notPairing'));
      return;
    }
    setScanNote(null);
    check(found, 'intro');
  }

  function setPin(next: string): void {
    entered.current = next;
    setPinState(next);
  }

  async function submitPin(digits: string): Promise<void> {
    // Never over a floor tablet's token: the guard below draws instead of the
    // keypad, and this holds the line should a keypad be up as it is learnt.
    if (!staffSession || !code || guard) return;
    setPinBusy(true);
    setPinFailure(null);
    setPairing(true);
    try {
      // The English name for History and an older console, and the same as
      // parts, which the console words in its reader's language.
      const self = thisDevice();
      const device = await staffSession.pairPhone({
        code,
        pin: digits,
        deviceName: self.name,
        platform: self.platform,
        browser: self.browser,
      });
      const identity = staffSession.getSnapshot().identity;
      if (identity) {
        await staffDeviceStore.rememberStaff({
          staffMemberId: identity.staffMemberId,
          fullName: identity.fullName,
        });
      }
      if (!alive.current) return;
      setPin('');
      setPaired(device);
      setStep('done');
    } catch (error) {
      if (!alive.current) return;
      setPin('');
      setPairing(false);
      if (error instanceof PinLockedError) {
        setPinFailure('locked');
      } else if (error instanceof PinRejectedError) {
        setAttempts((count) => count + 1);
        setPinFailure('wrong');
      } else {
        // The code itself failed between the preview and the PIN: expired,
        // used by somebody else, the person moved. Back to the start, saying so.
        setFailure(failureOf(error));
        setPreview(null);
        setStep(failureOf(error) === 'offline' ? 'pin' : 'intro');
      }
    } finally {
      if (alive.current) setPinBusy(false);
    }
  }

  function press(digit: string): void {
    if (pinBusy || pinFailure === 'locked') return;
    const next = (entered.current + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submitPin(next);
  }

  function startOver(): void {
    setStep('intro');
    setCode(null);
    setPreview(null);
    setTyped('');
    setPin('');
    setAttempts(0);
    setPinFailure(null);
  }

  const failureText = failure ? t(`phone.pair.error.${failure}`) : null;
  const failureNote = failureText ? (
    <p className="ph-pair-error" role="alert">
      {failureText}
    </p>
  ) : null;

  const title = (text: string, className = 'ph-pair-title') => (
    <h1 id={headingId} className={className} tabIndex={-1} ref={heading}>
      {text}
    </h1>
  );

  let body: ReactNode;
  switch (step) {
    case 'intro':
      body = (
        <main className="ph-pair-main" aria-labelledby={headingId}>
          {title(t('phone.pair.title'))}
          <p className="ph-pair-lead">{t('phone.pair.lead')}</p>
          <ol className="ph-pair-steps" aria-label={t('phone.pair.steps')}>
            {[t('phone.pair.step1'), t('phone.pair.step2'), t('phone.pair.step3')].map(
              (text, index) => (
                <li key={index}>
                  <b aria-hidden="true">{index + 1}</b>
                  <span>{text}</span>
                </li>
              ),
            )}
          </ol>
          {isIos() && !isStandalone() ? (
            <p className="ph-pair-note" role="note">
              {t('phone.pair.iosFirst')}
            </p>
          ) : null}
          {failureNote}
          <span className="ph-pair-grow" />
          <button
            type="button"
            className="ph-pair-btn is-primary"
            onClick={() => {
              setFailure(null);
              setScanNote(null);
              setStep('scan');
            }}
          >
            <ScanIcon />
            {t('phone.pair.scan')}
          </button>
          <button
            type="button"
            className="ph-pair-btn"
            onClick={() => {
              setFailure(null);
              setStep('code');
            }}
          >
            {t('phone.pair.typeCode')}
          </button>
          <p className="ph-pair-tablet">
            {t('phone.pair.tablet')}{' '}
            <button type="button" className="ph-pair-link" onClick={onTablet}>
              {t('phone.pair.tabletLink')}
            </button>
          </p>
        </main>
      );
      break;

    case 'scan':
      body = (
        <main className="ph-pair-main is-dark" aria-labelledby={headingId}>
          {title(t('phone.pair.scanTitle'), 'visually-hidden')}
          <QrScanner onText={onScanned} note={scanNote} />
          <div className="ph-pair-actions">
            <button
              type="button"
              className="ph-pair-btn is-outline-light"
              onClick={() => setStep('code')}
            >
              {t('phone.pair.typeCode')}
            </button>
            <button
              type="button"
              className="ph-pair-btn is-outline-light"
              onClick={() => setStep('intro')}
            >
              {t('phone.pair.back')}
            </button>
          </div>
        </main>
      );
      break;

    case 'code': {
      const clean = normalizeEnrolmentCode(typed);
      body = (
        <main className="ph-pair-main" aria-labelledby={headingId}>
          {title(t('phone.pair.codeTitle'))}
          <form
            className="ph-pair-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (clean.length !== ENROLMENT_CODE_LENGTH) {
                setTypedShort(true);
                return;
              }
              setTypedShort(false);
              check(clean, 'code');
            }}
          >
            <label htmlFor={fieldId}>{t('phone.pair.codeLabel')}</label>
            <input
              id={fieldId}
              className="ph-pair-code"
              value={formatPairingCode(typed)}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              maxLength={11}
              placeholder="XXXXX-XXXXX"
              aria-describedby={`${fieldId}-help`}
              aria-invalid={typedShort || failure === 'invalid' ? true : undefined}
              onChange={(event) => {
                setTyped(normalizeEnrolmentCode(event.target.value));
                setTypedShort(false);
              }}
            />
            <small id={`${fieldId}-help`}>
              {typedShort ? t('phone.pair.codeShort') : t('phone.pair.codeHelp')}
            </small>
            {failureNote}
            <span className="ph-pair-grow" />
            <button type="submit" className="ph-pair-btn is-primary">
              {t('phone.pair.codeContinue')}
            </button>
            <button type="button" className="ph-pair-btn" onClick={() => setStep('intro')}>
              {t('phone.pair.back')}
            </button>
          </form>
        </main>
      );
      break;
    }

    case 'checking':
      body = (
        <main className="ph-pair-main" aria-labelledby={headingId} aria-busy="true">
          {title(t('phone.pair.checking'))}
          <p className="ph-pair-lead" role="status">
            {code ? formatPairingCode(code) : null}
          </p>
        </main>
      );
      break;

    case 'preview':
      body = preview ? (
        <main className="ph-pair-main" aria-labelledby={headingId}>
          {title(t('phone.pair.isThisYou'))}
          <div className="ph-pair-person">
            <span className="ph-pair-face" aria-hidden="true">
              {initialsOf(preview.fullName, locale)}
            </span>
            <span className="ph-pair-who">
              <b>{preview.fullName}</b>
              <span>
                {t('phone.pair.whoLine', {
                  role: t(`pin.role.${preview.role}`),
                  venue: preview.venueName,
                  branch: preview.branchName,
                })}
              </span>
            </span>
          </div>
          <p className="ph-pair-lead">{t('phone.pair.onlyYours')}</p>
          <span className="ph-pair-grow" />
          <button type="button" className="ph-pair-btn is-primary" onClick={() => setStep('pin')}>
            {t('phone.pair.yes')}
          </button>
          <button type="button" className="ph-pair-btn" onClick={startOver}>
            {t('phone.pair.no')}
          </button>
        </main>
      ) : null;
      break;

    case 'pin': {
      const remaining = Math.max(0, ASSUMED_MAX_ATTEMPTS - attempts);
      body = (
        <main className="ph-pair-main is-centred" aria-labelledby={headingId}>
          {title(t('phone.pair.pinTitle'))}
          <p className="ph-pair-sub">{t('phone.pair.pinSub')}</p>
          <PhoneKeypad
            tone="light"
            length={pin.length}
            wrong={pinFailure === 'wrong'}
            disabled={pinBusy || pinFailure === 'locked'}
            onDigit={press}
            onDelete={() => setPin(entered.current.slice(0, -1))}
          />
          <div className="ph-pair-msg">
            {pinBusy ? (
              <p>{t('phone.pair.pairing')}</p>
            ) : pinFailure === 'locked' ? (
              <p className="is-error" role="alert">
                {t('pin.locked')} {t('pin.askManager')}
              </p>
            ) : pinFailure === 'wrong' ? (
              <p className="is-error" role="alert">
                {t('phone.pin.wrong')}
                {remaining > 0 && remaining < ASSUMED_MAX_ATTEMPTS
                  ? ` · ${t('pin.attemptsLeft', { count: remaining })}`
                  : ''}
              </p>
            ) : failure === 'offline' ? (
              <p className="is-error" role="alert">
                {t('phone.pair.error.offline')}
              </p>
            ) : null}
          </div>
          <button type="button" className="ph-pair-link is-centred" onClick={startOver}>
            {t('phone.pair.startOver')}
          </button>
        </main>
      );
      break;
    }

    case 'done': {
      const who = paired?.boundStaffMember?.fullName ?? preview?.fullName ?? '';
      body = (
        <main className="ph-pair-main" aria-labelledby={headingId}>
          <div className="ph-pair-done" role="status">
            {title(t('phone.pair.doneTitle'), 'ph-pair-done-title')}
            <span>
              {t('phone.pair.doneBody', {
                name: who.split(/\s+/u)[0] ?? who,
                venue: paired?.venueName || preview?.venueName || '',
                branch: paired?.branchName || preview?.branchName || '',
              })}
            </span>
          </div>
          <span className="ph-pair-grow" />
          <button
            type="button"
            className="ph-pair-btn is-primary"
            onClick={() => setStep('install')}
          >
            {t('phone.pair.continue')}
          </button>
        </main>
      );
      break;
    }

    case 'install':
      body = (
        <main className="ph-pair-main is-scroll" aria-labelledby={headingId}>
          {title(t('phone.install.title'))}
          <PhoneInstall onboarding onStart={onFinish} />
        </main>
      );
      break;
  }

  if (guard === 'checkingDevice') {
    body = (
      <main className="ph-pair-main" aria-labelledby={headingId} aria-busy="true">
        {title(t('phone.pair.checkingDevice'))}
        <span className="ph-pair-grow" />
        {onRecheck ? (
          <button type="button" className="ph-pair-btn" onClick={onRecheck}>
            {t('phone.pair.tryAgain')}
          </button>
        ) : null}
        {onCancel ? (
          <button type="button" className="ph-pair-btn" onClick={onCancel}>
            {t('phone.pair.back')}
          </button>
        ) : null}
      </main>
    );
  } else if (guard === 'tablet' && enrolledTablet && enrolledTablet !== 'unknown') {
    body = (
      <main className="ph-pair-main" aria-labelledby={headingId}>
        {title(t('phone.pair.tabletGuard.title'))}
        <p className="ph-pair-lead">
          {t('phone.pair.tabletGuard.body', {
            venue: enrolledTablet.venueName,
            branch: enrolledTablet.branchName,
          })}
        </p>
        <p className="ph-pair-note" role="note">
          {t('phone.pair.tabletGuard.how')}
        </p>
        <span className="ph-pair-grow" />
        {onCancel ? (
          <button type="button" className="ph-pair-btn is-primary" onClick={onCancel}>
            {t('phone.pair.tabletGuard.cancel')}
          </button>
        ) : null}
      </main>
    );
  }

  return (
    <div className="ph-pair" data-surface="staff" data-step={guard ?? step}>
      <header className="ph-pair-top">
        <Wordmark />
      </header>
      {body}
    </div>
  );
}

function initialsOf(name: string, locale: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase(locale))
    .join('');
}

function ScanIcon() {
  return (
    <svg
      className="ph-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8" />
    </svg>
  );
}
