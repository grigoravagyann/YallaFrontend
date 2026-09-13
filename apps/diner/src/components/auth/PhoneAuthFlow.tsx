import { verificationFailureCopy, type PhoneChallenge } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { isValidEmail, normalizeName, normalizePhone } from '../../auth/validation';
import { useRequestPhoneCode, useVerifyPhoneCode } from '../../data/queries';
import { useSession } from '../../stores/session';
import {
  actionIcon,
  colors,
  fontWeight,
  layout,
  radius,
  space,
  tabularNumbers,
  typography,
} from '../../theme';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Screen } from '../Screen';
import { Text, TextInput } from '../Text';
import { Field, FieldInput } from './Field';

const DEFAULT_PREFIX = '+374';
const CODE_LENGTH = 6;
/** The resend wait is never shown as more than this, whatever the server says. */
const MAX_RESEND_WAIT_SECONDS = 120;

export type AuthMode = 'login' | 'signup';

/**
 * What the auth routes are opened with.
 *
 * The booking keys are the reservation the diner was in the middle of making
 * (see `book/[placeId]`); they are carried through untouched and handed to
 * `/reserve/confirm` once the number is verified. `from` says the welcome
 * screen pushed this one, so finishing has two screens to leave, not one.
 */
export type AuthRouteParams = {
  branchId?: string;
  venueId?: string;
  tableId?: string;
  slotUtc?: string;
  partySize?: string;
  requests?: string;
  from?: string;
};

/** The value of `from` when the welcome screen is underneath. */
export const FROM_WELCOME = 'welcome';

const BOOKING_KEYS = [
  'branchId',
  'venueId',
  'tableId',
  'slotUtc',
  'partySize',
  'requests',
] as const;

type BookingKey = (typeof BOOKING_KEYS)[number];

/** The booking being made, and nothing else — what `/reserve/confirm` expects. */
function bookingParams(params: {
  readonly [K in BookingKey]?: string | undefined;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of BOOKING_KEYS) {
    const value = params[key];
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}

/** Seconds until the server lets a code be resent: whole, non-negative, capped. */
function secondsUntil(isoUtc: string): number {
  const ms = new Date(isoUtc).getTime() - Date.now();
  return Number.isFinite(ms)
    ? Math.min(MAX_RESEND_WAIT_SECONDS, Math.max(0, Math.round(ms / 1000)))
    : 0;
}

type Step = 'details' | 'phone' | 'code' | 'name';

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
 */
export function PhoneAuthFlow({ mode, params }: PhoneAuthFlowProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const navigation = useNavigation();
  const { branchId, venueId, tableId, slotUtc, partySize, requests, from } = params;
  const forward = useMemo(
    () => bookingParams({ branchId, venueId, tableId, slotUtc, partySize, requests }),
    [branchId, venueId, tableId, slotUtc, partySize, requests],
  );

  const rememberedName = useSession((s) => s.guestName);
  const rememberedEmail = useSession((s) => s.email);
  const setVerified = useSession((s) => s.setVerified);
  const setProfile = useSession((s) => s.setProfile);

  const [step, setStep] = useState<Step>(mode === 'signup' ? 'details' : 'phone');
  const [name, setName] = useState(rememberedName ?? '');
  const [email, setEmail] = useState(rememberedEmail ?? '');
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [localNumber, setLocalNumber] = useState('');
  const [touched, setTouched] = useState({ name: false, phone: false, email: false });
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [code, setCode] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const requestCode = useRequestPhoneCode();
  const verifyCode = useVerifyPhoneCode();
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
  const nameError = touched.name && !tidyName ? t('auth.error.nameRequired') : null;
  const emailError = touched.email && !emailOk ? t('auth.error.emailInvalid') : null;

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
   *
   * Replace, not push: the verification steps must not sit in the back stack
   * between the table and its confirmation. Reached with no table in hand —
   * from the profile, the bookings tab — it goes back to where it came from,
   * which is two screens when the welcome screen is underneath. A stack too
   * short for that (a cold start straight into welcome → log in) has nowhere
   * to go back to, so the profile takes this screen's place.
   */
  const finish = useCallback(() => {
    finishing.current = true;
    if (forward.tableId) {
      router.replace({ pathname: '/reserve/confirm', params: forward });
      return;
    }
    const depth = navigation.getState()?.routes.length ?? 0;
    if (from === FROM_WELCOME) {
      if (depth >= 3) router.dismiss(2);
      else router.replace('/(tabs)/profile');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [router, navigation, forward, from]);

  /** Back from the code entry: the number entry again, the code forgotten. */
  const leaveCodeStep = useCallback(() => {
    setStep(mode === 'signup' ? 'details' : 'phone');
    setErrorText(null);
    setCode('');
  }, [mode]);

  /*
   * The system back — Android hardware, the iOS swipe, the browser — does what
   * the arrow on screen does: at the code step it returns to the number, at
   * the name step it skips (the number is already verified by then). Neither
   * pops to whatever is underneath. Once `finish` is leaving on purpose the
   * guard stands aside.
   */
  useEffect(() => {
    if (step !== 'code' && step !== 'name') return;
    return navigation.addListener('beforeRemove', (event) => {
      if (finishing.current) return;
      event.preventDefault();
      if (step === 'code') leaveCodeStep();
      else finish();
    });
  }, [navigation, step, leaveCodeStep, finish]);

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
        const verified = await verifyCode.mutateAsync({
          challengeId: challenge.challengeId,
          code: value,
          localeCode: locale,
        });
        // The number is what the booking is made under, and the token does not
        // carry it, so it is remembered here. The store compares it with the
        // number it already had: a different one drops the remembered name
        // and email, so one person's name is never shown for another's number.
        setVerified({ phoneE164: verified.phoneE164 });

        if (mode === 'signup') {
          // Both live only on this phone: there is no profile endpoint.
          setProfile({
            ...(tidyName ? { guestName: tidyName } : {}),
            email: tidyEmail.length > 0 ? tidyEmail : null,
          });
          if (alive.current) finish();
          return;
        }

        if (!alive.current) return;
        // Logging in on a phone that already knows the name: nothing to ask.
        if (useSession.getState().guestName) {
          finish();
          return;
        }
        setStep('name');
      } catch (error) {
        if (!alive.current) return;
        setCode('');
        setErrorText(describe(error));
      }
    },
    [
      challenge,
      verifyCode,
      setVerified,
      setProfile,
      mode,
      tidyName,
      tidyEmail,
      finish,
      describe,
      locale,
    ],
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

  const saveName = () => {
    if (!tidyName) {
      touch('name');
      return;
    }
    setProfile({ guestName: tidyName });
    finish();
  };

  const busy = requestCode.isPending || verifyCode.isPending;
  const canSend =
    !busy && phoneE164 !== null && (mode === 'login' || (tidyName !== null && emailOk));

  const back = () => {
    if (step === 'code') {
      leaveCodeStep();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const switchTo = (target: '/auth/login' | '/auth/signup') => {
    const carried = { ...forward, ...(from === FROM_WELCOME ? { from: FROM_WELCOME } : {}) };
    router.replace({ pathname: target, params: carried });
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

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          {/* No arrow at the name step: the number is verified, and "Skip for
              now" is the honest name for leaving. */}
          {step === 'name' ? (
            <View style={styles.headerSpacer} />
          ) : (
            <IconButton
              icon={actionIcon.back}
              accessibilityLabel={t('floorPlan.back')}
              variant="ghost"
              onPress={back}
            />
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'phone' ? (
            <>
              <Text display style={styles.title} accessibilityRole="header">
                {t('auth.login.title')}
              </Text>
              {/* Considerate framing: says why, not just what. */}
              <Text style={styles.blurb}>{t('auth.login.body')}</Text>
              {phoneField}
            </>
          ) : null}

          {step === 'details' ? (
            <>
              <Text display style={styles.title} accessibilityRole="header">
                {t('auth.signup.title')}
              </Text>
              <Text style={styles.blurb}>{t('auth.signup.body')}</Text>
              {nameField}
              {phoneField}
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
              {errorText ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {errorText}
                </Text>
              ) : null}
              <Button
                label={t('verify.sendCode')}
                size="large"
                disabled={!canSend}
                onPress={() => void send()}
                style={styles.primary}
              />
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
            </>
          ) : null}

          {step === 'code' ? (
            <>
              <Text display style={styles.title} accessibilityRole="header">
                {t('verify.codeTitle')}
              </Text>
              {/* The number the code actually went to, not whatever the field holds now. */}
              <Text style={styles.blurb}>
                {t('verify.codeBody', { phone: challenge?.phoneE164 ?? phoneE164 ?? '' })}
              </Text>

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

              {/* One grouped input with six boxes drawn over it: a single caret and
                  real auto-advance, without six refs fighting each other. The boxes
                  are decoration for sighted eyes; the input is the one control. */}
              <Pressable
                onPress={() => codeInput.current?.focus()}
                style={styles.codeRow}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              >
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <View
                    key={i}
                    style={[styles.codeCell, code.length === i && styles.codeCellActive]}
                  >
                    <Text style={styles.codeDigit}>{code[i] ?? ''}</Text>
                  </View>
                ))}
              </Pressable>
              <TextInput
                ref={codeInput}
                style={styles.hiddenInput}
                value={code}
                onChangeText={onCodeChange}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete={Platform.OS === 'web' ? 'one-time-code' : 'sms-otp'}
                maxLength={CODE_LENGTH}
                autoFocus
                editable={!verifyCode.isPending}
                accessibilityLabel={t('verify.codeTitle')}
                accessibilityValue={{ text: code }}
              />

              {verifyCode.isPending ? <ActivityIndicator color={colors.primary} /> : null}
              {errorText ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {errorText}
                </Text>
              ) : null}

              <Button
                label={
                  secondsLeft > 0
                    ? t('verify.resendIn', { seconds: secondsLeft })
                    : t('verify.resend')
                }
                variant="text"
                disabled={secondsLeft > 0 || busy}
                onPress={() => void send()}
                style={styles.secondary}
              />
              <Button label={t('verify.changeNumber')} variant="text" onPress={back} />
            </>
          ) : null}

          {step === 'name' ? (
            <>
              <Text display style={styles.title} accessibilityRole="header">
                {t('auth.nameStep.title')}
              </Text>
              <Text style={styles.blurb}>{t('auth.nameStep.body')}</Text>
              {nameField}
              <Button
                label={t('auth.continue')}
                size="large"
                disabled={!tidyName}
                onPress={saveName}
                style={styles.primary}
              />
              <Button
                label={t('auth.skipForNow')}
                variant="text"
                onPress={finish}
                style={styles.secondary}
              />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  headerSpacer: { width: layout.touchTarget, height: layout.touchTarget },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.md,
  },
  title: { ...typography.title, color: colors.text },
  blurb: { ...typography.body, color: colors.textMuted, marginBottom: space.sm },
  phoneRow: { flexDirection: 'row', gap: space.sm },
  prefix: { width: 92 },
  number: { flex: 1 },
  codeRow: { flexDirection: 'row', gap: space.sm, marginVertical: space.lg },
  codeCell: {
    flex: 1,
    height: layout.controlHeightLarge,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  codeCellActive: { borderColor: colors.primary },
  codeDigit: { ...typography.heading, ...tabularNumbers, color: colors.text },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  devBanner: {
    padding: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  devBannerText: { ...typography.caption, fontWeight: fontWeight.medium, color: colors.warning },
  error: { ...typography.body, color: colors.error },
  primary: { marginTop: space.lg },
  secondary: { marginTop: space.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.sm,
  },
  footerText: { ...typography.body, color: colors.textMuted },
});
