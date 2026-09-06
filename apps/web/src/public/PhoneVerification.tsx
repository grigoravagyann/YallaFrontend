import { verificationFailureCopy, type PhoneChallenge, type VerifiedPhone } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Phone verification, asked for at the point of reserving and nowhere earlier.
 *
 * The same two steps the phone app runs, against the same anonymous endpoints,
 * with the same failure mapping — `verificationFailureCopy` lives in
 * `@yalla/api` precisely so a wrong code is refused with the same sentence on
 * both surfaces, in all three languages. What differs here is only the markup.
 *
 * Nothing is stored. The token the exchange returns lives in memory for as long
 * as the tab is open; see `gateways.ts`.
 */

const DEFAULT_PREFIX = '+374';
const CODE_LENGTH = 6;

export interface PhoneVerificationProps {
  readonly onVerified: (verified: VerifiedPhone) => void;
}

export function PhoneVerification({ onVerified }: PhoneVerificationProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const gateway = useGateway();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [localNumber, setLocalNumber] = useState('');
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [code, setCode] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  const phoneE164 = `${prefix}${localNumber.replace(/\D/gu, '')}`;

  const requestCode = useMutation({
    mutationFn: (value: string) => gateway.requestPhoneCode(value),
    retry: false,
  });
  const verifyCode = useMutation({
    mutationFn: (input: { challengeId: string; code: string }) => gateway.verifyPhoneCode(input),
    retry: false,
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  /** One message per failure — never one generic error. Shared with the app. */
  const describe = useCallback(
    (error: unknown): string => {
      const line = verificationFailureCopy(error, locale);
      return t(line.key, line.params);
    },
    [t, locale],
  );

  const send = useCallback(async () => {
    setErrorText(null);
    try {
      const issued = await requestCode.mutateAsync(phoneE164);
      setChallenge(issued);
      setStep('code');
      setCode('');
      setSecondsLeft(
        Math.max(
          0,
          Math.round((new Date(issued.resendAvailableAtUtc).getTime() - Date.now()) / 1000),
        ),
      );
      setTimeout(() => codeInput.current?.focus(), 50);
    } catch (error) {
      setErrorText(describe(error));
    }
  }, [phoneE164, requestCode, describe]);

  const submitCode = useCallback(
    async (value: string) => {
      if (!challenge) return;
      setErrorText(null);
      try {
        onVerified(
          await verifyCode.mutateAsync({ challengeId: challenge.challengeId, code: value }),
        );
      } catch (error) {
        setCode('');
        setErrorText(describe(error));
      }
    },
    [challenge, verifyCode, onVerified, describe],
  );

  const busy = requestCode.isPending || verifyCode.isPending;
  const numberLongEnough = localNumber.replace(/\D/gu, '').length >= 6;

  if (step === 'phone') {
    return (
      <form
        className="pub-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <h3>{t('verify.phoneTitle')}</h3>
        {/* Says why, not just what. Somebody is being asked for their number by
            a page they reached from a stranger's message. */}
        <p className="pub-muted">{t('verify.phoneBody')}</p>

        <div className="pub-phone-row">
          {/*
            Armenian numbers are the common case and the tourist is the whole
            reason this page exists, so the prefix is an editable field rather
            than a fixed `+374`. `inputMode="tel"` gets the phone keypad without
            `type="tel"`'s autofill guessing at a country.
          */}
          <input
            className="pub-input pub-input-prefix"
            value={prefix}
            onChange={(event) => setPrefix(event.currentTarget.value)}
            inputMode="tel"
            autoComplete="tel-country-code"
            maxLength={5}
            aria-label="Country code"
          />
          <input
            className="pub-input"
            value={localNumber}
            onChange={(event) => setLocalNumber(event.currentTarget.value)}
            placeholder={t('verify.phonePlaceholder')}
            inputMode="tel"
            autoComplete="tel-national"
            aria-label={t('verify.phoneLabel')}
          />
        </div>

        {errorText ? <p className="pub-error">{errorText}</p> : null}

        <button
          type="submit"
          className="pub-button pub-button-primary"
          disabled={busy || !numberLongEnough}
        >
          {busy ? t('net.loading') : t('verify.sendCode')}
        </button>
      </form>
    );
  }

  return (
    <form
      className="pub-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submitCode(code);
      }}
    >
      <h3>{t('verify.codeTitle')}</h3>
      <p className="pub-muted">{t('verify.codeBody', { phone: phoneE164 })}</p>

      {/*
        Dev only, and double-gated: the backend returns `devCode` outside
        production, and this render is behind `import.meta.env.DEV`, so a
        production bundle cannot print it even against a misconfigured server.
      */}
      {import.meta.env.DEV && challenge?.devCode ? (
        <p className="pub-dev-code">{t('verify.devBanner', { code: challenge.devCode })}</p>
      ) : null}

      <input
        ref={codeInput}
        className="pub-input pub-input-code num"
        value={code}
        onChange={(event) => {
          const digits = event.currentTarget.value.replace(/\D/gu, '').slice(0, CODE_LENGTH);
          setCode(digits);
          // Submit on the sixth digit; no extra button to hunt for, and the
          // one-time-code autofill fills all six at once on iOS.
          if (digits.length === CODE_LENGTH) void submitCode(digits);
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        autoFocus
        aria-label={t('verify.codeTitle')}
      />

      {errorText ? <p className="pub-error">{errorText}</p> : null}

      <div className="pub-actions">
        <button
          type="button"
          className="pub-button pub-button-quiet"
          disabled={secondsLeft > 0 || busy}
          onClick={() => void send()}
        >
          {secondsLeft > 0 ? t('verify.resendIn', { seconds: secondsLeft }) : t('verify.resend')}
        </button>
        <button
          type="button"
          className="pub-button pub-button-quiet"
          onClick={() => {
            setStep('phone');
            setCode('');
            setErrorText(null);
          }}
        >
          {t('verify.changeNumber')}
        </button>
      </div>
    </form>
  );
}
