import {
  TelegramUnavailableError,
  approvalCountdown,
  verificationFailureCopy,
  type PhoneChallenge,
  type VerifiedPhone,
} from '@yalla/api';
import { queryKeys, useGateway, useNow, useTelegramVerification } from '@yalla/api/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons';
import { formatPhone } from './phone';
import { isSmsUnavailable, usePhoneProofDoors } from './phoneProof';
import { SheetNote } from './SheetParts';

/**
 * Phone verification, asked for at the point of reserving and nowhere earlier.
 *
 * The same two doors the phone app has, against the same anonymous endpoints,
 * with the same failure mapping — `verificationFailureCopy` lives in
 * `@yalla/api` precisely so a wrong code is refused with the same sentence on
 * both surfaces, in all three languages. What differs here is only the markup.
 *
 * **Telegram first** (public-page HANDOFF §3): no number typed and no code, the
 * bot learns the number. The bot opens in a new tab and this page polls until
 * it has confirmed, then lands on the same `onVerified` the code does. The SMS
 * code second, and only where the backend sends SMS (`usePhoneProofDoors`):
 * production has Telegram only until an SMS provider is chosen. A door the
 * backend refuses once — `TelegramUnavailableError`, `SmsUnavailableError` —
 * closes, and the other stays.
 *
 * The step is the Book sheet's to hold (its head shows the step's title and
 * Back), and so is the number, so going back to the table keeps it.
 *
 * Nothing is stored. The token the exchange returns lives in memory for as long
 * as the tab is open; see `gateways.ts`.
 */

const CODE_LENGTH = 6;

export type VerifyStep = 'phone' | 'telegram' | 'code';

/** The number as typed: the editable country code and the rest. */
export interface PhoneDraft {
  readonly prefix: string;
  readonly local: string;
}

export const EMPTY_PHONE: PhoneDraft = { prefix: '+374', local: '' };

/** The doors the backend refused during this visit to the sheet. */
export interface ClosedDoors {
  readonly sms: boolean;
  readonly telegram: boolean;
}

export const NO_CLOSED_DOORS: ClosedDoors = { sms: false, telegram: false };

export interface PhoneVerificationProps {
  readonly step: VerifyStep;
  readonly onStepChange: (step: VerifyStep) => void;
  readonly number: PhoneDraft;
  readonly onNumberChange: (number: PhoneDraft) => void;
  readonly onVerified: (verified: VerifiedPhone) => void;
  /**
   * Held by the sheet, so a refused door stays closed through Back to the
   * table and Continue, which unmount this step (review N2).
   */
  readonly closedDoors: ClosedDoors;
  readonly onDoorClosed: (door: keyof ClosedDoors) => void;
}

/** An error said under its field, on the step it belongs to. */
interface FieldError {
  readonly step: VerifyStep;
  readonly text: string;
  /**
   * The field already had the focus, so moving it there announces nothing:
   * said as an alert instead. Otherwise the focus moves to the field, which
   * reads it through `aria-describedby` — once, not twice (review N1).
   */
  readonly live: boolean;
}

export function PhoneVerification({
  step,
  onStepChange,
  number,
  onNumberChange,
  onVerified,
  closedDoors,
  onDoorClosed,
}: PhoneVerificationProps) {
  const { t } = useTranslation('diner');
  const { t: tp } = useTranslation('public');
  const { locale } = useLocale();
  const gateway = useGateway();
  const queryClient = useQueryClient();
  const doors = usePhoneProofDoors();
  const numberId = useId();
  const codeId = useId();
  const errorId = useId();

  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [code, setCode] = useState('');
  /** Said under the field it is about: the number, or the code. */
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  /** Said on the step, about a door: Telegram refused, SMS off. */
  const [stepError, setStepError] = useState<string | null>(null);
  /** Set when a door has closed under the visitor: the focus needs a new home (review S2). */
  const focusAfterDoor = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [telegramExpiry, setTelegramExpiry] = useState<{
    readonly challengeId: string;
    readonly expiresAtUtc: string;
  } | null>(null);
  const numberInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const telegramButton = useRef<HTMLButtonElement>(null);
  const stepErrorLine = useRef<HTMLParagraphElement>(null);

  // A door's line belongs to the phone step: gone once the visitor moves on.
  const [shownStep, setShownStep] = useState(step);
  if (shownStep !== step) {
    setShownStep(step);
    if (step !== 'phone') setStepError(null);
  }

  const sms = doors.sms && !closedDoors.sms;
  const telegram = doors.telegram && !closedDoors.telegram;
  /** This step's field error, if it has one. */
  const error = fieldError?.step === step ? fieldError : null;

  /** Say `text` under the field `input` is, on `at`, once (see `FieldError`). */
  const sayOnField = useCallback((at: VerifyStep, text: string, input: HTMLInputElement | null) => {
    const live = input !== null && document.activeElement === input;
    setFieldError({ step: at, text, live });
    if (!live) input?.focus();
  }, []);
  const phoneE164 = `${number.prefix}${number.local.replace(/\D/gu, '')}`;

  // The visitor's language, so the SMS arrives in it and the account keeps it.
  const requestCode = useMutation({
    mutationFn: (value: string) => gateway.requestPhoneCode(value, { localeCode: locale }),
    retry: false,
  });
  const verifyCode = useMutation({
    mutationFn: (input: { challengeId: string; code: string }) =>
      gateway.verifyPhoneCode({ ...input, localeCode: locale }),
    retry: false,
  });
  const {
    start: startTelegramChallenge,
    status: telegramStatus,
    deepLinkUrl: telegramUrl,
    reset: resetTelegram,
  } = useTelegramVerification({ localeCode: locale, onVerified });

  /*
   * Leaving the Telegram wait — the sheet's Back, "Get a code instead" — ends
   * the challenge: a bot confirming it later must not book under a number the
   * visitor has moved away from (review S5).
   */
  useEffect(() => {
    if (step !== 'telegram') resetTelegram();
  }, [step, resetTelegram]);

  // A door closed under the visitor took the focused button with it.
  useEffect(() => {
    if (!focusAfterDoor.current) return;
    focusAfterDoor.current = false;
    (telegramButton.current ?? numberInput.current ?? stepErrorLine.current)?.focus();
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  /** How long the bot's link still works, ticking only while it is waited on. */
  const now = useNow(step === 'telegram' ? 1000 : 60_000);
  const linkLeft = telegramExpiry
    ? approvalCountdown(telegramExpiry.expiresAtUtc, now, locale)
    : null;

  /** One message per failure — never one generic error. Shared with the app. */
  const describe = useCallback(
    (error: unknown): string => {
      const line = verificationFailureCopy(error, locale);
      return t(line.key, line.params);
    },
    [t, locale],
  );

  const send = useCallback(async () => {
    setFieldError(null);
    setStepError(null);
    if (number.local.replace(/\D/gu, '').length < 6) {
      // Said under the field, before anything is sent (Book artboard).
      sayOnField('phone', tp('sheet.phone.short'), numberInput.current);
      return;
    }
    try {
      const issued = await requestCode.mutateAsync(phoneE164);
      setChallenge(issued);
      setCode('');
      onStepChange('code');
      setSecondsLeft(
        Math.max(
          0,
          Math.round((new Date(issued.resendAvailableAtUtc).getTime() - Date.now()) / 1000),
        ),
      );
      setTimeout(() => codeInput.current?.focus(), 50);
    } catch (error) {
      if (isSmsUnavailable(error)) {
        // No SMS on this backend: the door closes and Telegram stays.
        onDoorClosed('sms');
        onStepChange('phone');
        setStepError(tp('sheet.phone.smsOff'));
        focusAfterDoor.current = true;
        return;
      }
      // Said under the number, on the phone step — from the code step's
      // "Send a new code" too, which goes back there.
      onStepChange('phone');
      setFieldError({ step: 'phone', text: describe(error), live: false });
      setTimeout(() => numberInput.current?.focus(), 0);
    }
  }, [number.local, phoneE164, requestCode, describe, onStepChange, onDoorClosed, sayOnField, tp]);

  const submitCode = useCallback(
    async (value: string) => {
      if (!challenge || value.length !== CODE_LENGTH || verifyCode.isPending) return;
      setFieldError(null);
      try {
        onVerified(
          await verifyCode.mutateAsync({ challengeId: challenge.challengeId, code: value }),
        );
      } catch (error) {
        setCode('');
        sayOnField('code', describe(error), codeInput.current);
      }
    },
    [challenge, verifyCode, onVerified, describe, sayOnField],
  );

  const startTelegram = useCallback(() => {
    setStepError(null);
    setFieldError(null);
    // Opened now, in the click, and pointed at the bot once the server has
    // answered: a window opened after an `await` is what browsers block. One
    // that would not open (a blocker, no `window.open` at all) leaves the
    // link on the page to tap instead.
    const popup = typeof window.open === 'function' ? window.open('about:blank', '_blank') : null;
    if (popup) popup.opener = null;
    setTelegramExpiry(null);
    onStepChange('telegram');
    startTelegramChallenge()
      .then((issued) => {
        setTelegramExpiry({ challengeId: issued.challengeId, expiresAtUtc: issued.expiresAtUtc });
        if (popup && !popup.closed) popup.location.href = issued.deepLinkUrl;
      })
      .catch((error: unknown) => {
        popup?.close();
        // Off on this backend: the door closes and the code stays, where
        // there is one. Anything else is said on the phone step, where the
        // next try is.
        if (error instanceof TelegramUnavailableError) onDoorClosed('telegram');
        onStepChange('phone');
        setStepError(describe(error));
        focusAfterDoor.current = true;
      });
  }, [startTelegramChallenge, describe, onStepChange, onDoorClosed]);

  /** The bot may have confirmed while this tab slept: ask now, not at the next poll. */
  const checkNow = () => {
    if (!telegramExpiry) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.telegramClaim(telegramExpiry.challengeId),
    });
  };

  const busy = requestCode.isPending || verifyCode.isPending || telegramStatus === 'starting';

  if (step === 'telegram') {
    const expired = telegramStatus === 'expired';
    return (
      <div className="pub-sheet-step">
        <div className="pub-sheet-body">
          <div className="pub-wait">
            {expired ? null : <div className="pub-ring" aria-hidden="true" />}
            {/* The wait ending is announced; the seconds are not. */}
            <h3 aria-live="polite">
              {expired ? t('verify.telegramExpired') : t('verify.telegramWaitingTitle')}
            </h3>
            {expired ? null : <p className="pub-muted">{tp('sheet.telegram.body')}</p>}
            {!expired && linkLeft && !linkLeft.expired ? (
              <p className="pub-muted" role="timer">
                {tp('sheet.telegram.left', { time: linkLeft.label })}
              </p>
            ) : null}
          </div>
        </div>
        <div className="pub-sheet-foot">
          {expired ? (
            <button
              type="button"
              className="pub-button pub-button-telegram"
              onClick={startTelegram}
            >
              {t('verify.telegramTryAgain')}
            </button>
          ) : telegramUrl ? (
            <a
              className="pub-button pub-button-telegram"
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('verify.telegramOpenAgain')}
              <span aria-hidden="true">↗</span>
            </a>
          ) : null}
          {/* Only once there is a link, and so a challenge, to ask about (N6). */}
          {expired || !telegramExpiry ? null : (
            <button type="button" className="pub-button" onClick={checkNow}>
              {tp('sheet.telegram.checkNow')}
            </button>
          )}
          {sms ? (
            <button
              type="button"
              className="pub-button pub-button-ghost"
              onClick={() => onStepChange('phone')}
            >
              {tp('sheet.telegram.useCode')}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (step === 'code') {
    const ready = code.length === CODE_LENGTH;
    return (
      <form
        className="pub-sheet-step"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submitCode(code);
        }}
      >
        <div className="pub-sheet-body">
          <p className="pub-sheet-lead">
            {t('verify.codeBody', { phone: formatPhone(phoneE164) })}
          </p>

          {/*
            Dev only, and double-gated: the backend returns `devCode` outside
            production, and this render is behind `import.meta.env.DEV`, so a
            production bundle cannot print it even against a misconfigured server.
          */}
          {import.meta.env.DEV && challenge?.devCode ? (
            <p className="pub-dev-code">{t('verify.devBanner', { code: challenge.devCode })}</p>
          ) : null}

          <div className="pub-sheet-field">
            <label htmlFor={codeId}>{tp('sheet.code.label')}</label>
            <input
              id={codeId}
              ref={codeInput}
              className={
                error ? 'pub-input pub-input-code num is-bad' : 'pub-input pub-input-code num'
              }
              value={code}
              onChange={(event) => {
                const digits = event.currentTarget.value.replace(/\D/gu, '').slice(0, CODE_LENGTH);
                setCode(digits);
                setFieldError(null);
                // Submit on the sixth digit; the one-time-code autofill fills
                // all six at once on iOS, and the button below stays for anyone
                // who would rather press it.
                if (digits.length === CODE_LENGTH) void submitCode(digits);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error ? (
              <p className="pub-field-error" id={errorId} role={error.live ? 'alert' : undefined}>
                {error.text}
              </p>
            ) : null}
          </div>

          <div className="pub-sheet-links">
            <button
              type="button"
              className="pub-button pub-button-ghost"
              disabled={secondsLeft > 0 || busy}
              onClick={() => void send()}
            >
              {secondsLeft > 0
                ? t('verify.resendIn', { seconds: secondsLeft })
                : t('verify.resend')}
            </button>
            <button
              type="button"
              className="pub-button pub-button-ghost"
              onClick={() => {
                setCode('');
                onStepChange('phone');
              }}
            >
              {t('verify.changeNumber')}
            </button>
          </div>
        </div>
        <div className="pub-sheet-foot">
          <button
            type="submit"
            className="pub-button pub-button-primary"
            aria-disabled={!ready || busy || undefined}
          >
            {verifyCode.isPending ? t('net.loading') : tp('sheet.code.check')}
          </button>
        </div>
      </form>
    );
  }

  const noDoor = doors.known && !sms && !telegram;
  return (
    <form
      className="pub-sheet-step"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (sms && !busy) void send();
      }}
    >
      <div className="pub-sheet-body">
        {/* Says why, not just what. Somebody is being asked for their number by
            a page they reached from a stranger's message. */}
        <p className="pub-sheet-lead">{tp('sheet.phone.body')}</p>

        {doors.known ? null : (
          <p className="pub-muted" role="status">
            {tp('sheet.phone.loading')}
          </p>
        )}

        {sms ? (
          <div className="pub-sheet-field">
            <label htmlFor={numberId}>{t('verify.phoneLabel')}</label>
            <div className="pub-phone-row">
              {/*
                Armenian numbers are the common case and the tourist is the
                whole reason this page exists, so the prefix is an editable
                field rather than a fixed `+374`. `inputMode="tel"` gets the
                phone keypad without `type="tel"`'s autofill guessing at a
                country.
              */}
              <input
                className="pub-input pub-input-prefix"
                value={number.prefix}
                onChange={(event) =>
                  onNumberChange({ ...number, prefix: event.currentTarget.value })
                }
                inputMode="tel"
                autoComplete="tel-country-code"
                maxLength={5}
                aria-label={t('verify.countryCode')}
              />
              <input
                id={numberId}
                ref={numberInput}
                className={error ? 'pub-input is-bad' : 'pub-input'}
                value={number.local}
                onChange={(event) => {
                  onNumberChange({ ...number, local: event.currentTarget.value });
                  setFieldError(null);
                }}
                placeholder={t('verify.phonePlaceholder')}
                inputMode="tel"
                autoComplete="tel-national"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
            </div>
            {error ? (
              <p className="pub-field-error" id={errorId} role={error.live ? 'alert' : undefined}>
                {error.text}
              </p>
            ) : null}
          </div>
        ) : null}

        {telegram ? (
          <SheetNote tone="blue">
            {/* "Fastest" only beside a slower door. */}
            {sms ? tp('sheet.phone.telegramNote') : tp('sheet.phone.telegramOnly')}
          </SheetNote>
        ) : null}

        {/* Announced, unless it is where the focus went (no door left). */}
        {stepError ? (
          <p
            className="pub-field-error"
            role={sms || telegram ? 'alert' : undefined}
            tabIndex={-1}
            ref={stepErrorLine}
          >
            {stepError}
          </p>
        ) : null}
        {noDoor && !stepError ? (
          <p className="pub-field-error" role="alert">
            {tp('sheet.phone.noDoors')}
          </p>
        ) : null}
      </div>

      {sms || telegram ? (
        <div className="pub-sheet-foot">
          {/* First: no number to type, no code to wait for. */}
          {telegram ? (
            <button
              type="button"
              ref={telegramButton}
              className="pub-button pub-button-telegram"
              disabled={busy}
              onClick={startTelegram}
            >
              <Icon name="send" />
              {tp('sheet.phone.telegram')}
            </button>
          ) : null}
          {sms ? (
            <button type="submit" className="pub-button" disabled={busy}>
              {requestCode.isPending ? t('net.loading') : tp('sheet.phone.sms')}
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
