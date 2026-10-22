import { Ionicons } from '@expo/vector-icons';
import {
  SmsUnavailableError,
  TelegramUnavailableError,
  verificationFailureCopy,
  type PhoneChallenge,
  type VerifiedPhone,
} from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { describeAccountFailure } from '../../auth/accountErrors';
import {
  NAME_MAX_LENGTH,
  isValidEmail,
  isValidPassword,
  nameProblem,
  normalizeName,
  normalizePhone,
} from '../../auth/validation';
import {
  usePhoneProofChannels,
  useRequestPhoneCode,
  useTelegramVerification,
  useVerifyPhoneCode,
} from '../../data/queries';
import { useSession } from '../../stores/session';
import {
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  tabularNumbers,
  typography,
} from '../../theme';
import { Button } from '../Button';
import { Rise } from '../motion/Rise';
import { usePressScale } from '../motion/usePressScale';
import { Screen } from '../Screen';
import { Text, TextInput } from '../Text';
import { accountKeys, useSetDinerPassword } from '../../data/accountQueries';
import { AuthHeader } from './AuthHeader';
import { BookingSummary } from './BookingSummary';
import { Field, FieldInput, PasswordInput } from './Field';
import { FROM_START, FROM_WELCOME, useAuthFinish, type AuthRouteParams } from './useAuthFinish';

const DEFAULT_PREFIX = '+374';
const CODE_LENGTH = 6;
/** What the empty code field shows: one dot per digit to come. */
const CODE_PLACEHOLDER = '•'.repeat(CODE_LENGTH);
/** The code field and the paste tile beside it. */
const CODE_FIELD_HEIGHT = 60;
/** The resend wait is never shown as more than this, whatever the server says. */
const MAX_RESEND_WAIT_SECONDS = 120;

export type AuthMode = 'login' | 'signup';

export { FROM_START, FROM_WELCOME, type AuthRouteParams };

/** Seconds until the server lets a code be resent: whole, non-negative, capped. */
function secondsUntil(isoUtc: string): number {
  const ms = new Date(isoUtc).getTime() - Date.now();
  return Number.isFinite(ms)
    ? Math.min(MAX_RESEND_WAIT_SECONDS, Math.max(0, Math.round(ms / 1000)))
    : 0;
}

type Step = 'details' | 'phone' | 'code' | 'telegram' | 'newPassword' | 'name';

export interface PhoneAuthFlowProps {
  readonly mode: AuthMode;
  readonly params: AuthRouteParams;
}

/**
 * Sign up and log in, which are the same SMS verification with different
 * questions around it.
 *
 * The backend knows a diner by a verified phone number and nothing more, so
 * "create account" is the first verification of a number plus the name the
 * venue asks for at the door (and an optional email), both kept on this
 * phone; "log in" is a verification, and asks for the name only if this
 * phone has never remembered one.
 *
 * All the steps live in one route so that stepping back from the code entry
 * returns to the number entry rather than abandoning the flow — the system
 * back (hardware, swipe) is intercepted to do the same. Whatever was
 * underneath — a table with its slot selected, the profile — stays mounted,
 * so leaving at any point lands the diner where they left.
 *
 * "Forgot your password?" opens this with `reason: forgotPassword`, and there
 * the number being proved is the way back in: the server lets a sign-in that
 * proved the phone set a new password without the old one for ten minutes,
 * so a passed code (or the bot) leads straight to "Set a new password" and
 * only then finishes.
 *
 * The Telegram bot is the other way to prove a number: no digits typed, no
 * SMS. The app hands the diner to Telegram and polls until the bot has
 * confirmed, then runs exactly the tail a passed code runs. A backend with
 * Telegram switched off refuses the first start, after which the button is
 * gone and the code stays.
 *
 * Which doors are open is the backend's to say, and it is read before either
 * is offered (`usePhoneProofChannels`). With no SMS provider — production until
 * one is chosen, decided 2026-10-20 — there is no "Send code" and no number
 * field: the bot learns the number, so Telegram is the whole step. With neither
 * door open the step says so instead of offering a button that cannot work.
 * While the answer is on its way neither is shown, rather than a guess that
 * flips. A code request refused with `SmsUnavailableError` anyway (the read
 * failed, or is stale) closes the SMS door the way a refused start closes
 * Telegram's.
 */
export function PhoneAuthFlow({ mode, params }: PhoneAuthFlowProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const navigation = useNavigation();
  const { forward, finish: leaveFlow, switchTo } = useAuthFinish(params);
  const queryClient = useQueryClient();

  const rememberedName = useSession((s) => s.guestName);
  const rememberedEmail = useSession((s) => s.email);
  const setVerified = useSession((s) => s.setVerified);
  const setRemembered = useSession((s) => s.setRemembered);
  const markPhoneProved = useSession((s) => s.markPhoneProved);
  const forgotPassword = params.reason === 'forgotPassword';
  // An account verifying the number it already holds (the profile's "Verify")
  // arrives with that number filled in; a whole `+…` number is taken as is.
  const accountPhone = useSession((s) => (s.signedIn ? s.phoneE164 : null));

  const firstStepOf = mode === 'signup' ? 'details' : 'phone';
  // The phone step says what it is for: the profile's "Verify" while signed
  // in confirms a number, and "Forgot your password?" is a log-in by code.
  const phoneCopy = accountPhone
    ? ({
        title: 'auth.login.confirmTitle',
        body: 'auth.login.confirmBody',
        bodyTelegram: 'auth.login.confirmBodyTelegram',
      } as const)
    : params.reason === 'forgotPassword'
      ? ({
          title: 'auth.login.forgot',
          body: 'auth.login.forgotBody',
          bodyTelegram: 'auth.login.forgotBodyTelegram',
        } as const)
      : ({
          title: 'auth.login.title',
          body: 'auth.login.body',
          bodyTelegram: 'auth.login.bodyTelegram',
        } as const);
  // Sent back by the bot with a challenge in hand: straight to waiting.
  const [step, setStep] = useState<Step>(params.tg ? 'telegram' : firstStepOf);
  const [name, setName] = useState(rememberedName ?? '');
  const [email, setEmail] = useState(rememberedEmail ?? '');
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [localNumber, setLocalNumber] = useState(
    accountPhone?.startsWith(DEFAULT_PREFIX)
      ? accountPhone.slice(DEFAULT_PREFIX.length)
      : (accountPhone ?? ''),
  );
  const [touched, setTouched] = useState({ name: false, phone: false, email: false });
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [code, setCode] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [telegramHidden, setTelegramHidden] = useState(false);
  const [smsHidden, setSmsHidden] = useState(false);
  const [telegramNotInstalled, setTelegramNotInstalled] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordAgain, setNewPasswordAgain] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const setPassword = useSetDinerPassword();

  const requestCode = useRequestPhoneCode();
  const verifyCode = useVerifyPhoneCode();
  const channels = usePhoneProofChannels();
  // Unknown until the read answers. A failed read offers both, as before the
  // read existed: each door's own refusal then closes it after one try.
  const channelsKnown = !channels.isPending;
  const smsOn = channelsKnown && channels.data?.sms !== false && !smsHidden;
  const telegramOn = channelsKnown && channels.data?.telegram !== false && !telegramHidden;
  /** The door the first step leads with; `null` while the read is out. */
  const door = !channelsKnown ? null : smsOn ? 'sms' : telegramOn ? 'telegram' : 'none';
  const codeInput = useRef<TextInput>(null);
  const nameInput = useRef<TextInput>(null);
  const numberInput = useRef<TextInput>(null);

  /*
   * A send or a verify that resolves after the diner has left this screen —
   * or moved to another step meanwhile — must not navigate or change step
   * under them. `alive` is cleared on unmount; `stepRef` is what the step was
   * when a request went out.
   */
  const alive = useRef(true);
  const stepRef = useRef(step);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  /** Set once the flow is leaving on purpose, so the back guard lets it go. */
  const finishing = useRef(false);

  const phoneE164 = normalizePhone(prefix, localNumber);
  const tidyName = normalizeName(name);
  const tidyEmail = email.trim();
  const emailOk = tidyEmail.length === 0 || isValidEmail(tidyEmail);

  // Field errors appear once a field has been left, not while it is typed in.
  const phoneError =
    touched.phone && localNumber.trim().length > 0 && !phoneE164
      ? t('auth.error.phoneInvalid')
      : null;
  const nameIssue = touched.name ? nameProblem(name) : null;
  const nameError =
    nameIssue === 'tooLong'
      ? t('auth.error.nameTooLong', { max: NAME_MAX_LENGTH })
      : nameIssue
        ? t('auth.error.nameRequired')
        : null;
  const emailError = touched.email && !emailOk ? t('auth.error.emailInvalid') : null;
  // The house rule while typing; the server's refusal (or the mismatch) after.
  const newPasswordError =
    newPassword.length > 0 && !isValidPassword(newPassword)
      ? t('auth.error.passwordInvalid')
      : passwordError;

  const touch = (field: keyof typeof touched) => setTouched((prev) => ({ ...prev, [field]: true }));

  // Resend timer.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  /**
   * Map each failure to its own message — never one generic error.
   *
   * The mapping itself lives in `@yalla/api` so the public web page, which runs
   * exactly this verification, refuses a code with exactly this sentence.
   */
  const describe = useCallback(
    (error: unknown): string => {
      const line = verificationFailureCopy(error, locale);
      return t(line.key, line.params);
    },
    [t, locale],
  );

  /**
   * Done: the number is verified and whatever was asked for is remembered.
   * Where to go is the rule the password screens share — see `useAuthFinish`.
   */
  const finish = useCallback(() => {
    finishing.current = true;
    leaveFlow();
  }, [leaveFlow]);

  /** Back from the code entry: the number entry again, the code forgotten. */
  const leaveCodeStep = useCallback(() => {
    setStep(firstStepOf);
    setErrorText(null);
    setCode('');
  }, [firstStepOf]);

  /**
   * The number is proven, by whichever door. What follows is the same for a
   * passed code and a Telegram confirmation: remember the number, re-read the
   * profile, and either finish or ask for the name this phone has never had.
   */
  const afterVerified = useCallback(
    (verified: VerifiedPhone) => {
      // The number is what the booking is made under, and the token does not
      // carry it, so it is remembered here. The store compares it with the
      // number it already had: a different one drops the remembered name
      // and email, so one person's name is never shown for another's number.
      setVerified({ phoneE164: verified.phoneE164 });
      // This sign-in proved the phone: for the next ten minutes it may set a
      // new password without the old one (Edit profile reads this too).
      markPhoneProved(Date.now());
      // The account behind the number is now verified, or new: read it
      // again so the profile says so.
      void queryClient.invalidateQueries({ queryKey: accountKeys.profile });

      if (mode === 'signup') {
        setRemembered({
          ...(tidyName ? { guestName: tidyName } : {}),
          email: tidyEmail.length > 0 ? tidyEmail : null,
        });
        if (alive.current) finish();
        return;
      }

      if (!alive.current) return;
      // Here because the password was forgotten: setting a new one is what
      // this sign-in is for, so it comes before anything else.
      if (forgotPassword) {
        setStep('newPassword');
        return;
      }
      // Logging in on a phone that already knows the name: nothing to ask.
      if (useSession.getState().guestName) {
        finish();
        return;
      }
      setStep('name');
    },
    [
      setVerified,
      markPhoneProved,
      setRemembered,
      queryClient,
      mode,
      tidyName,
      tidyEmail,
      finish,
      forgotPassword,
    ],
  );

  const {
    start: startTelegramChallenge,
    resume: resumeTelegramChallenge,
    status: telegramStatus,
    deepLinkUrl: telegramUrl,
    reset: resetTelegram,
  } = useTelegramVerification({ localeCode: locale, onVerified: afterVerified });

  /** Hand the diner to Telegram; without it installed, the link stays on screen. */
  const openTelegram = useCallback((url: string) => {
    setTelegramNotInstalled(false);
    Linking.openURL(url).catch(() => {
      if (alive.current) setTelegramNotInstalled(true);
    });
  }, []);

  const startTelegram = useCallback(() => {
    setErrorText(null);
    setStep('telegram');
    startTelegramChallenge()
      .then((issued) => {
        if (!alive.current || stepRef.current !== 'telegram') return;
        openTelegram(issued.deepLinkUrl);
      })
      .catch((error: unknown) => {
        if (!alive.current) return;
        // Off on this backend: the button goes and the code stays. Anything
        // else is said on the first step, where the next try is.
        if (error instanceof TelegramUnavailableError) setTelegramHidden(true);
        setStep(firstStepOf);
        setErrorText(describe(error));
      });
  }, [startTelegramChallenge, openTelegram, firstStepOf, describe]);

  // The bot's button carries the challenge; polling it is all that is left.
  const resumeId = params.tg;
  useEffect(() => {
    if (resumeId) resumeTelegramChallenge(resumeId);
  }, [resumeId, resumeTelegramChallenge]);

  /** Back from waiting on Telegram: the first step again, the challenge dropped. */
  const leaveTelegramStep = useCallback(() => {
    resetTelegram();
    setTelegramNotInstalled(false);
    setStep(firstStepOf);
    setErrorText(null);
  }, [resetTelegram, firstStepOf]);

  /*
   * The system back — Android hardware, the iOS swipe, the browser — does what
   * the arrow on screen does: at the code step it returns to the number, at
   * the name step it skips (the number is already verified by then). Neither
   * pops to whatever is underneath. Once `finish` is leaving on purpose the
   * guard stands aside.
   */
  const guardsBack =
    step === 'code' || step === 'name' || step === 'telegram' || step === 'newPassword';
  useEffect(() => {
    if (!guardsBack) return;
    return navigation.addListener('beforeRemove', (event) => {
      if (finishing.current) return;
      event.preventDefault();
      if (step === 'code') leaveCodeStep();
      else if (step === 'telegram') leaveTelegramStep();
      else finish();
    });
  }, [navigation, guardsBack, step, leaveCodeStep, leaveTelegramStep, finish]);

  const send = useCallback(async () => {
    if (!phoneE164) return;
    const stepAtSend = stepRef.current;
    setErrorText(null);
    try {
      // The diner's language, so the SMS arrives in it.
      const issued = await requestCode.mutateAsync({ phoneE164, localeCode: locale });
      // Left, or stepped elsewhere while the request was out: this answer is stale.
      if (!alive.current || stepRef.current !== stepAtSend) return;
      setChallenge(issued);
      setStep('code');
      setCode('');
      setSecondsLeft(secondsUntil(issued.resendAvailableAtUtc));
      setTimeout(() => codeInput.current?.focus(), 250);
    } catch (error) {
      if (!alive.current) return;
      // No SMS on this backend after all: the code door closes, and the
      // sentence points to Telegram (or says neither works, below).
      if (error instanceof SmsUnavailableError) setSmsHidden(true);
      setErrorText(describe(error));
    }
  }, [phoneE164, requestCode, describe, locale]);

  const submitCode = useCallback(
    async (value: string) => {
      // One verification in flight at a time: auto-submit fires on the sixth
      // digit, and a second paste must not post the same code twice.
      if (!challenge || verifyCode.isPending) return;
      setErrorText(null);
      try {
        afterVerified(
          await verifyCode.mutateAsync({
            challengeId: challenge.challengeId,
            code: value,
            localeCode: locale,
          }),
        );
      } catch (error) {
        if (!alive.current) return;
        setCode('');
        setErrorText(describe(error));
      }
    },
    [challenge, verifyCode, afterVerified, describe, locale],
  );

  const onCodeChange = useCallback(
    (raw: string) => {
      const digits = raw.replace(/\D/gu, '').slice(0, CODE_LENGTH);
      setCode(digits);
      // Auto-submit on the sixth digit; no extra button to hunt for.
      if (digits.length === CODE_LENGTH) void submitCode(digits);
    },
    [submitCode],
  );

  /**
   * After a code or the bot, with no current password: the server takes this
   * sign-in's phone proof instead. Its refusal goes under the field — a
   * password equal to the username, or a proof the server no longer accepts.
   */
  const saveNewPassword = async () => {
    if (!isValidPassword(newPassword) || setPassword.isPending) return;
    if (newPassword !== newPasswordAgain) {
      setPasswordError(t('auth.newPassword.mismatch'));
      return;
    }
    setPasswordError(null);
    try {
      await setPassword.mutateAsync({ newPassword });
      if (!alive.current) return;
      // Then whatever a code log-in would have asked: the name, if this phone
      // has never had one.
      if (useSession.getState().guestName) finish();
      else setStep('name');
    } catch (error) {
      if (!alive.current) return;
      const failure = describeAccountFailure(error);
      setPasswordError(failure.key ? t(failure.key) : describe(error));
    }
  };

  const saveName = () => {
    if (!tidyName) {
      touch('name');
      return;
    }
    setRemembered({ guestName: tidyName });
    finish();
  };

  const busy = requestCode.isPending || verifyCode.isPending || telegramStatus === 'starting';
  const canSend =
    !busy && phoneE164 !== null && (mode === 'login' || (tidyName !== null && emailOk));
  // No number needed for Telegram — the bot learns it — but a sign-up still
  // needs the name and a well-formed email before the flow can finish.
  const canTelegram = !busy && (mode === 'login' || (tidyName !== null && emailOk));

  const back = () => {
    if (step === 'code') {
      leaveCodeStep();
      return;
    }
    if (step === 'telegram') {
      leaveTelegramStep();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const nameField = (
    <Field label={t('auth.nameLabel')} error={nameError}>
      <FieldInput
        ref={nameInput}
        value={name}
        onChangeText={setName}
        onBlur={() => touch('name')}
        placeholder={t('auth.namePlaceholder')}
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        autoFocus
        returnKeyType={step === 'name' ? 'done' : 'next'}
        onSubmitEditing={step === 'name' ? saveName : () => numberInput.current?.focus()}
        invalid={nameError !== null}
        accessibilityLabel={t('auth.nameLabel')}
        maxLength={60}
      />
    </Field>
  );

  const phoneField = (
    <Field label={t('verify.phoneLabel')} error={phoneError}>
      <View style={styles.phoneRow}>
        {/* Armenian numbers are the common case; tourists still need any
            international prefix, so this is editable rather than fixed. A
            number pasted or auto-filled with its own country code is taken
            whole, and this prefix is ignored for it. */}
        <FieldInput
          style={styles.prefix}
          value={prefix}
          onChangeText={setPrefix}
          onBlur={() => touch('phone')}
          keyboardType="phone-pad"
          tabular
          accessibilityLabel={t('verify.countryCode')}
          maxLength={5}
        />
        <FieldInput
          ref={numberInput}
          style={styles.number}
          value={localNumber}
          onChangeText={setLocalNumber}
          onBlur={() => touch('phone')}
          placeholder={t('verify.phonePlaceholder')}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          returnKeyType="send"
          onSubmitEditing={() => {
            if (canSend) void send();
          }}
          tabular
          invalid={phoneError !== null}
          autoFocus={mode === 'login'}
          accessibilityLabel={t('verify.phoneLabel')}
        />
      </View>
    </Field>
  );

  const firstStep = step === 'phone' || step === 'details';
  const forBooking = Boolean(forward['tableId']);

  /** Fill the code from the clipboard: what Telegram or a message left there, digits only. */
  const pasteCode = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (alive.current && /\d/u.test(text)) onCodeChange(text);
    } catch {
      // Nothing to paste, or the browser said no: the field is still there.
    }
  }, [onCodeChange]);

  const headerTitle =
    step === 'details'
      ? t('auth.signup.title')
      : step === 'code'
        ? mode === 'signup'
          ? t('auth.signup.title')
          : t(phoneCopy.title)
        : step === 'telegram'
          ? telegramStatus === 'expired'
            ? t('verify.telegramExpired')
            : t('verify.telegramWaitingTitle')
          : step === 'newPassword'
            ? t('auth.newPassword.title')
            : step === 'name'
              ? t('auth.nameStep.title')
              : t(phoneCopy.title);

  const codeHint =
    code.length === 0
      ? t('verify.codeHint.empty')
      : code.length < CODE_LENGTH
        ? t('verify.codeHint.left', { count: CODE_LENGTH - code.length })
        : t('verify.codeHint.ready');

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {/* The iOS swipe back is a native removal: the native stack takes the
          screen away before `beforeRemove` can stop it, and the JS state is
          left holding a screen that is gone ("removed natively but didn't
          get removed from JS state", seen in Expo Go 2026-10-21). While the
          guard above is on, the swipe is off; the arrow on screen and
          Android's back go through JS and are guarded as before. */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !guardsBack }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* No arrow at the name or new-password step: the number is verified,
            and "Skip for now" is the honest name for leaving. */}
        <AuthHeader
          title={headerTitle}
          subline={forBooking ? t('verify.beforeBooking') : null}
          {...(step === 'name' || step === 'newPassword' ? {} : { onBack: back })}
        />

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {forBooking ? <BookingSummary booking={forward} /> : null}

          {/* Each step rises in on its own, so moving on reads as moving on. */}
          <Rise key={step} style={styles.step}>
            {step === 'phone' ? (
              <>
                {/* Considerate framing: says why, not just what — and by which
                    door. No number to type when the bot is the only one. */}
                {door === 'sms' || door === 'telegram' ? (
                  <Text style={styles.blurb}>
                    {t(door === 'sms' ? phoneCopy.body : phoneCopy.bodyTelegram)}
                  </Text>
                ) : null}
                {door === 'sms' ? phoneField : null}
              </>
            ) : null}

            {step === 'details' ? (
              <>
                {door === 'sms' || door === 'telegram' ? (
                  <Text style={styles.blurb}>
                    {t(door === 'sms' ? 'auth.signup.body' : 'auth.signup.bodyTelegram')}
                  </Text>
                ) : null}
                {nameField}
                {door === 'sms' ? phoneField : null}
                <Field label={t('auth.emailLabel')} hint={t('auth.emailHint')} error={emailError}>
                  <FieldInput
                    value={email}
                    onChangeText={setEmail}
                    onBlur={() => touch('email')}
                    placeholder={t('auth.emailPlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    autoComplete="email"
                    invalid={emailError !== null}
                    accessibilityLabel={t('auth.emailLabel')}
                  />
                </Field>
              </>
            ) : null}

            {firstStep ? (
              <>
                {/* Neither door open: one plain sentence, and no button that
                    cannot work. It says all the last refusal would have. */}
                {door === 'none' ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    {t('verify.unavailable')}
                  </Text>
                ) : errorText ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    {errorText}
                  </Text>
                ) : null}
                {door === null ? (
                  <ActivityIndicator color={colors.primary} style={styles.channelsPending} />
                ) : null}
                {smsOn ? (
                  <Button
                    label={t('verify.sendCode')}
                    icon="paper-plane-outline"
                    size="large"
                    disabled={!canSend}
                    busy={requestCode.isPending}
                    onPress={() => void send()}
                    style={styles.primary}
                  />
                ) : null}
                {telegramOn ? (
                  <>
                    {/* The second door beside the code; the only one without it. */}
                    <Button
                      label={t('verify.telegramButton')}
                      variant={smsOn ? 'secondary' : 'primary'}
                      size="large"
                      disabled={!canTelegram}
                      busy={telegramStatus === 'starting'}
                      onPress={startTelegram}
                      {...(smsOn ? {} : { style: styles.primary })}
                    />
                    <Text style={styles.hint}>{t('verify.telegramHint')}</Text>
                  </>
                ) : null}
                <WhyVerify />
                {/* Signed in already: confirming a number, not choosing an account. */}
                {accountPhone ? null : (
                  <View style={styles.footer}>
                    <Text style={styles.footerText}>
                      {mode === 'login' ? t('auth.login.noAccount') : t('auth.signup.haveAccount')}
                    </Text>
                    <Button
                      label={mode === 'login' ? t('auth.login.createOne') : t('auth.logIn')}
                      variant="text"
                      fullWidth={false}
                      disabled={busy}
                      onPress={() => switchTo(mode === 'login' ? '/auth/signup' : '/auth/login')}
                    />
                  </View>
                )}
              </>
            ) : null}

            {step === 'code' ? (
              <>
                {/* The number the code actually went to, not whatever the field holds now. */}
                <View style={styles.sent} role="status" accessibilityLiveRegion="polite" accessible>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={iconSize.md}
                    color={colors.successInk}
                  />
                  <Text style={styles.sentText}>
                    {t('verify.codeBody', { phone: challenge?.phoneE164 ?? phoneE164 ?? '' })}
                  </Text>
                </View>

                {/*
                  Dev-only. Double-gated: the backend returns `devCode` only outside
                  production, AND this render is behind __DEV__, so a production
                  bundle cannot show it even if a misconfigured server sends one.
                */}
                {__DEV__ && challenge?.devCode ? (
                  <View style={styles.devBanner}>
                    <Text style={styles.devBannerText}>
                      {t('verify.devBanner', { code: challenge.devCode })}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.codeField}>
                  <Text style={styles.label}>{t('verify.codeTitle')}</Text>
                  <View style={styles.codeRow}>
                    {/* One wide field rather than six boxes: one caret, a paste
                        that lands whole, and the phone's own code suggestion. */}
                    <TextInput
                      ref={codeInput}
                      style={styles.codeInput}
                      value={code}
                      onChangeText={onCodeChange}
                      placeholder={CODE_PLACEHOLDER}
                      placeholderTextColor={colors.textSubtle}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      textContentType="oneTimeCode"
                      autoComplete={Platform.OS === 'web' ? 'one-time-code' : 'sms-otp'}
                      autoFocus
                      editable={!verifyCode.isPending}
                      accessibilityLabel={t('verify.codeTitle')}
                      accessibilityHint={codeHint}
                      accessibilityValue={{ text: code }}
                    />
                    <PasteButton
                      label={t('verify.paste')}
                      disabled={verifyCode.isPending}
                      onPress={() => void pasteCode()}
                    />
                  </View>
                  {verifyCode.isPending ? (
                    <ActivityIndicator color={colors.primary} style={styles.pending} />
                  ) : (
                    <Text style={styles.hint} accessibilityLiveRegion="polite">
                      {codeHint}
                    </Text>
                  )}
                </View>

                {errorText ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    {errorText}
                  </Text>
                ) : null}

                {/* The sixth digit sends the code by itself; this is the same
                    press, for whoever looks for one. */}
                <Button
                  label={t('auth.continue')}
                  size="large"
                  disabled={code.length !== CODE_LENGTH || verifyCode.isPending}
                  busy={verifyCode.isPending}
                  onPress={() => void submitCode(code)}
                />

                <View style={styles.codeActions}>
                  <Button
                    label={
                      secondsLeft > 0
                        ? t('verify.resendIn', { seconds: secondsLeft })
                        : t('verify.resend')
                    }
                    variant="text"
                    size="small"
                    fullWidth={false}
                    disabled={secondsLeft > 0 || busy}
                    onPress={() => void send()}
                  />
                  <Button
                    label={t('verify.changeNumber')}
                    variant="text"
                    size="small"
                    fullWidth={false}
                    onPress={back}
                  />
                </View>
              </>
            ) : null}

            {step === 'telegram' ? (
              <>
                {telegramStatus === 'expired' ? null : (
                  <View style={styles.waiting}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={styles.waitingText}>{t('verify.telegramWaitingBody')}</Text>
                  </View>
                )}

                {/* No app to hand over to: the https link works in any browser. */}
                {telegramNotInstalled && telegramUrl ? (
                  <>
                    <Text style={styles.error} accessibilityRole="alert">
                      {t('verify.telegramNotInstalled')}
                    </Text>
                    <Text selectable style={styles.link}>
                      {telegramUrl}
                    </Text>
                  </>
                ) : null}

                {telegramStatus === 'expired' ? (
                  <Button
                    label={t('verify.telegramTryAgain')}
                    size="large"
                    onPress={startTelegram}
                    style={styles.primary}
                  />
                ) : telegramUrl ? (
                  <Button
                    label={t('verify.telegramOpenAgain')}
                    variant="secondary"
                    size="large"
                    onPress={() => openTelegram(telegramUrl)}
                  />
                ) : null}
                {/* No code to fall back on where SMS is off: the arrow is the way back. */}
                {smsOn ? (
                  <Button label={t('verify.telegramUseCode')} variant="text" onPress={back} />
                ) : null}
              </>
            ) : null}

            {step === 'newPassword' ? (
              <>
                <Text style={styles.blurb}>{t('auth.newPassword.body')}</Text>
                <Field
                  label={t('editProfile.password.new')}
                  hint={t('auth.passwordHint')}
                  error={newPasswordError}
                >
                  <PasswordInput
                    value={newPassword}
                    onChangeText={(value) => {
                      setNewPassword(value);
                      setPasswordError(null);
                    }}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    autoFocus
                    invalid={newPasswordError !== null}
                    accessibilityLabel={t('editProfile.password.new')}
                    showLabel={t('auth.showPassword')}
                    hideLabel={t('auth.hidePassword')}
                    maxLength={128}
                  />
                </Field>
                <Field label={t('auth.newPassword.confirmLabel')}>
                  <PasswordInput
                    value={newPasswordAgain}
                    onChangeText={(value) => {
                      setNewPasswordAgain(value);
                      setPasswordError(null);
                    }}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    returnKeyType="done"
                    onSubmitEditing={() => void saveNewPassword()}
                    accessibilityLabel={t('auth.newPassword.confirmLabel')}
                    showLabel={t('auth.showPassword')}
                    hideLabel={t('auth.hidePassword')}
                    maxLength={128}
                  />
                </Field>
                <Button
                  label={t('auth.newPassword.save')}
                  size="large"
                  disabled={!isValidPassword(newPassword) || setPassword.isPending}
                  onPress={() => void saveNewPassword()}
                  style={styles.primary}
                />
                {/* Signed in by the code already: the password can wait. */}
                <Button
                  label={t('auth.skipForNow')}
                  variant="text"
                  disabled={setPassword.isPending}
                  onPress={finish}
                />
              </>
            ) : null}

            {step === 'name' ? (
              <>
                <Text style={styles.blurb}>{t('auth.nameStep.body')}</Text>
                {nameField}
                <Button
                  label={t('auth.continue')}
                  size="large"
                  disabled={!tidyName}
                  onPress={saveName}
                  style={styles.primary}
                />
                <Button label={t('auth.skipForNow')} variant="text" onPress={finish} />
              </>
            ) : null}
          </Rise>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** "Why verify?" and, once asked, the answer under it. */
function WhyVerify() {
  const { t } = useTranslation('diner');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('verify.why')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.why, pressed && styles.whyPressed]}
      >
        <Text style={styles.whyText}>{t('verify.why')}</Text>
      </Pressable>
      {open ? (
        <Rise>
          <View style={styles.whyCard}>
            <Text style={styles.whyBody}>{t('verify.whyBody')}</Text>
          </View>
        </Rise>
      ) : null}
    </>
  );
}

/** The glass tile beside the code field that fills it from the clipboard. */
function PasteButton({
  label,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const press = usePressScale();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.paste,
          pressed && styles.pastePressed,
          disabled && styles.pasteDisabled,
        ]}
      >
        <Ionicons name="clipboard-outline" size={iconSize.md} color={colors.text} />
        <Text style={styles.pasteText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  step: { gap: space.md + 2 },
  blurb: { ...typography.body, color: colors.textMuted },
  hint: { ...typography.caption, color: colors.textMuted },
  phoneRow: { flexDirection: 'row', gap: space.sm },
  prefix: { width: 92 },
  number: { flex: 1 },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.successStrong,
    backgroundColor: colors.successSoft,
  },
  sentText: { ...typography.caption, color: colors.successInk, flex: 1 },
  codeField: { gap: space.xs + 2 },
  label: { ...typography.caption, fontWeight: fontWeight.medium, color: colors.textMuted },
  codeRow: { flexDirection: 'row', gap: space.sm },
  codeInput: {
    flex: 1,
    minWidth: 0,
    height: CODE_FIELD_HEIGHT,
    paddingHorizontal: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    ...typography.heading,
    ...tabularNumbers,
    letterSpacing: 10,
    textAlign: 'center',
  },
  paste: {
    height: CODE_FIELD_HEIGHT,
    minWidth: layout.touchTarget + space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs - 1,
  },
  pastePressed: { borderColor: colors.borderStrong, opacity: 0.7 },
  pasteDisabled: { opacity: 0.45 },
  pasteText: { ...typography.caption, color: colors.text },
  pending: { alignSelf: 'flex-start' },
  channelsPending: { alignSelf: 'center', marginTop: space.sm },
  codeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  waitingText: { ...typography.body, color: colors.textMuted, flex: 1 },
  why: {
    alignSelf: 'center',
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
  },
  whyPressed: { opacity: 0.7 },
  whyText: { ...typography.body, color: colors.primary },
  whyCard: {
    paddingVertical: space.md,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.tile,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  whyBody: { ...typography.caption, color: colors.textMuted },
  devBanner: {
    padding: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  devBannerText: { ...typography.caption, fontWeight: fontWeight.medium, color: colors.warningInk },
  error: { ...typography.body, color: colors.errorInk },
  link: { ...typography.body, ...tabularNumbers, color: colors.primary },
  primary: { marginTop: space.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  footerText: { ...typography.body, color: colors.textMuted },
});
