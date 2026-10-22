import {
  ENROLMENT_CODE_ALPHABET,
  ENROLMENT_CODE_LENGTH,
  EnrolmentCodeExpiredError,
  EnrolmentCodeSpentError,
  describeFailure,
  normalizeEnrolmentCode,
  type EnrolledDevice,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, useRef, useState, type FormEvent } from 'react';
import { staffSession } from './staffSession';
import { Wordmark } from '../../components/Wordmark';

/**
 * Enrolling a browser as a tablet. Once, during onboarding.
 *
 * A manager generates a code in the console and reads it out; somebody types it
 * here and names the device. From then on this browser has a credential and
 * never sees this screen again unless it is revoked.
 *
 * Laid out like the PIN screen it leads to (floor tablet canvas, "Պլանշետի
 * միացում"): the dark side says where the code comes from and what it is good
 * for, the light side takes it.
 *
 * Two things it deliberately does not have:
 *
 * - **No email field, and no link to one.** This is the screen a waiter might
 *   see if they open the app before a manager has enrolled the tablet, and the
 *   whole staff model is that they never type an address. A sign-in form here
 *   would be the shortest path to a shared owner account on the counter.
 * - **No retry loop on a spent or expired code.** Retyping either never works;
 *   the answer is a new code, so that is what it says.
 */
export interface EnrolDeviceScreenProps {
  /** Why the tablet is here, when it has been here before. */
  readonly reason: 'never' | 'revoked';
  /**
   * The device this screen just enrolled. The session is already `locked` by
   * then; the route keeps this screen up until the staff tap through, so the
   * venue and branch are read once before the keypad takes over.
   */
  readonly enrolled?: EnrolledDevice | null;
  readonly onContinue?: () => void;
}

/** Names a floor actually uses. A preset is one tap; the field takes anything else. */
const PRESETS = ['hall1', 'hall2', 'terrace', 'kitchen', 'bar'] as const;

type Failure = 'wrong' | 'spent' | 'expired' | 'offline' | 'failed';

/** The code as the staff read it off the console: two groups of five. */
function grouped(code: string): string {
  return code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

function failureOf(error: unknown): Failure {
  if (error instanceof EnrolmentCodeSpentError) return 'spent';
  if (error instanceof EnrolmentCodeExpiredError) return 'expired';
  const kind = describeFailure(error);
  if (kind === 'offline') return 'offline';
  if (kind === 'unauthorized' || kind === 'invalid' || kind === 'notFound') return 'wrong';
  return 'failed';
}

export function EnrolDeviceScreen({ reason, enrolled, onContinue }: EnrolDeviceScreenProps) {
  const { t } = useTranslation(['staff', 'common']);
  const titleId = useId();
  const codeTitleId = useId();
  const codeMetaId = useId();
  const codeErrorId = useId();
  const nameLabelId = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  /** The last character typed that no code contains, to say why it vanished. */
  const [skipped, setSkipped] = useState<string | null>(null);
  /**
   * Empty on purpose. The old default ("Counter · Win32") named every tablet
   * the same; a manager revoking one needs to tell them apart.
   */
  const [deviceName, setDeviceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const full = code.length === ENROLMENT_CODE_LENGTH;
  const named = deviceName.trim().length > 0;
  const codeFailed = failure === 'wrong' || failure === 'spent' || failure === 'expired';

  function typeCode(raw: string) {
    const dropped = Array.from(raw.toUpperCase()).filter(
      (c) => /[A-Z0-9]/.test(c) && !ENROLMENT_CODE_ALPHABET.includes(c),
    );
    setSkipped(dropped.at(-1) ?? null);
    setCode(normalizeEnrolmentCode(raw));
    // A new character is a new attempt; the old refusal no longer describes it.
    setFailure(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!staffSession || busy || !full || !named) return;
    setBusy(true);
    setFailure(null);
    try {
      // The route sees the session go `locked` and keeps this screen up with
      // `enrolled` set; nothing to do here on success.
      await staffSession.enrol({ code, deviceName: deviceName.trim() });
    } catch (error) {
      const next = failureOf(error);
      setFailure(next);
      // Selected, so the next code replaces this one rather than appending to
      // it. Offline keeps the caret where it was: that code was never refused.
      if (next === 'wrong' || next === 'spent' || next === 'expired') {
        codeRef.current?.focus();
        codeRef.current?.select();
      }
    } finally {
      setBusy(false);
    }
  }

  // Step 1 is behind the staff once a code is being typed; the first unfinished
  // step is the one they are on.
  const steps = [
    { key: 'ask', done: Boolean(enrolled) || code.length > 0 },
    { key: 'type', done: Boolean(enrolled) || full },
    { key: 'name', done: Boolean(enrolled) || (full && named) },
  ] as const;
  const current = steps.findIndex((s) => !s.done);

  const message = failure
    ? { title: t(`enrol.failure.${failure}`), help: t(`enrol.failure.${failure}Help`) }
    : null;

  return (
    <div className="staff-gate ft-gate ft-enrol" data-surface="staff">
      <main className="ft-pin" aria-labelledby={titleId}>
        <div className="ft-pin-left">
          <span className="ft-pin-brand">
            <Wordmark />
          </span>
          <h1 id={titleId} className="ft-enrol-title">
            {reason === 'revoked' && !enrolled ? t('enrol.titleRevoked') : t('enrol.title')}
          </h1>
          {/* A revoked tablet lands here too, and being told plainly why is the
              difference between a manager fixing it in a minute and somebody
              reinstalling the app. Never a redirect back to the keypad: that is
              the loop this screen exists to avoid. */}
          {reason === 'revoked' && !enrolled ? (
            <p className="ft-enrol-why">{t('enrol.revoked')}</p>
          ) : null}
          <ol className="ft-enrol-steps">
            {steps.map((step, index) => (
              <li
                key={step.key}
                className={step.done ? 'is-done' : index === current ? 'is-current' : undefined}
                aria-current={index === current ? 'step' : undefined}
              >
                <span className="ft-enrol-step-mark" aria-hidden="true">
                  {step.done ? <CheckIcon size={16} /> : index + 1}
                </span>
                <span className="ft-enrol-step-text">
                  {step.done ? (
                    <span className="visually-hidden">{t('enrol.stepDone')} </span>
                  ) : null}
                  <b>{t(`enrol.steps.${step.key}`)}</b>
                  {step.key === 'ask' ? (
                    <span className="ft-enrol-path">{t('enrol.steps.where')}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          <p className="ft-pin-note ft-enrol-rule">
            <ClockIcon />
            <span>{t('enrol.rule')}</span>
          </p>
        </div>

        <div className="ft-enrol-right">
          {enrolled ? (
            <div className="ft-enrol-done" role="status">
              <span className="ft-enrol-ok" aria-hidden="true">
                <CheckIcon size={48} />
              </span>
              <h2>{t('enrol.done.title')}</h2>
              <p className="ft-enrol-where">
                {enrolled.venueName} · {enrolled.branchName}
              </p>
              <p>{t('enrol.done.body', { name: enrolled.deviceName })}</p>
              {/* Focused: the one thing left to do, and a keyboard user is
                  otherwise stranded on a form that is no longer there. */}
              <button
                type="button"
                className="floor-button big ft-enrol-continue"
                autoFocus
                onClick={onContinue}
              >
                {t('enrol.done.continue')}
              </button>
            </div>
          ) : (
            <form className="ft-enrol-form" onSubmit={(event) => void submit(event)} noValidate>
              <h2 id={codeTitleId}>{t('enrol.code')}</h2>
              <div className="ft-enrol-field">
                <input
                  ref={codeRef}
                  className="ft-enrol-code"
                  value={grouped(code)}
                  placeholder="XXXXX-XXXXX"
                  aria-labelledby={codeTitleId}
                  aria-describedby={codeFailed ? `${codeMetaId} ${codeErrorId}` : codeMetaId}
                  aria-invalid={codeFailed || undefined}
                  autoFocus
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  enterKeyHint="next"
                  onChange={(event) => typeCode(event.target.value)}
                />
                <div className="ft-enrol-meta" id={codeMetaId}>
                  <span className={skipped ? 'is-warning' : undefined}>
                    {skipped ? t('enrol.codeSkipped', { char: skipped }) : t('enrol.codeHelp')}
                  </span>
                  <span>
                    {t('enrol.codeCount', { count: code.length, total: ENROLMENT_CODE_LENGTH })}
                  </span>
                </div>
                {codeFailed && message ? (
                  <p className="ft-enrol-msg is-error" id={codeErrorId} role="alert">
                    <AlertIcon />
                    <span>
                      {message.title}
                      <small>{message.help}</small>
                    </span>
                  </p>
                ) : null}
              </div>

              <div className="ft-enrol-field">
                <span className="ft-enrol-label" id={nameLabelId}>
                  {t('enrol.deviceName')}
                </span>
                <div className="ft-enrol-presets" role="group" aria-labelledby={nameLabelId}>
                  {PRESETS.map((preset) => {
                    const label = t(`enrol.presets.${preset}`);
                    return (
                      <button
                        key={preset}
                        type="button"
                        className="ft-enrol-preset"
                        aria-pressed={deviceName === label}
                        onClick={() => setDeviceName(label)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <input
                  className="ft-enrol-name"
                  value={deviceName}
                  aria-label={t('enrol.deviceNameOwn')}
                  placeholder={t('enrol.deviceNamePlaceholder')}
                  enterKeyHint="go"
                  maxLength={100}
                  onChange={(event) => setDeviceName(event.target.value)}
                />
                <span className="ft-enrol-hint">{t('enrol.deviceNameWhy')}</span>
              </div>

              {!codeFailed && message ? (
                <p
                  className={`ft-enrol-msg ${failure === 'offline' ? 'is-offline' : 'is-error'}`}
                  role="alert"
                >
                  <AlertIcon />
                  <span>
                    {message.title}
                    <small>{message.help}</small>
                  </span>
                </p>
              ) : null}

              {/* Never `disabled`: a disabled button cannot be focused, and its
                  label is what tells the staff what is still missing. */}
              <button
                type="submit"
                className="floor-button big full ft-enrol-submit"
                aria-disabled={!full || !named || busy}
                aria-busy={busy || undefined}
              >
                {busy ? <span className="ft-enrol-spin" aria-hidden="true" /> : null}
                {busy
                  ? t('enrol.working')
                  : !full
                    ? t('enrol.remaining', { count: ENROLMENT_CODE_LENGTH - code.length })
                    : !named
                      ? t('enrol.needName')
                      : t('enrol.submit')}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size > 20 ? 2.6 : 3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}
