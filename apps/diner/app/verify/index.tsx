import { verificationFailureCopy, type PhoneChallenge } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../src/components/Text';
import { useRequestPhoneCode, useVerifyPhoneCode } from '../../src/data/queries';
import { useSession } from '../../src/stores/session';

const DEFAULT_PREFIX = '+374';
const CODE_LENGTH = 6;

/**
 * Phone verification, reached only at the point of reserving.
 *
 * Two steps in one route so that stepping back from the code entry returns to
 * the number entry rather than abandoning the flow. Both the branch screen and
 * its selected table stay mounted underneath, so Android back at any point
 * lands the diner back on their table.
 */
export default function VerifyScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const forward = useLocalSearchParams<{
    branchId: string;
    venueId?: string;
    tableId: string;
    slotUtc: string;
    partySize: string;
  }>();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [localNumber, setLocalNumber] = useState('');
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [code, setCode] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const setVerified = useSession((s) => s.setVerified);
  const requestCode = useRequestPhoneCode();
  const verifyCode = useVerifyPhoneCode();
  const codeInput = useRef<TextInput>(null);

  const phoneE164 = `${prefix}${localNumber.replace(/\D/gu, '')}`;

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

  const send = useCallback(async () => {
    setErrorText(null);
    try {
      // The diner's language, so the SMS arrives in it.
      const issued = await requestCode.mutateAsync({ phoneE164, localeCode: locale });
      setChallenge(issued);
      setStep('code');
      setCode('');
      setSecondsLeft(
        Math.max(
          0,
          Math.round((new Date(issued.resendAvailableAtUtc).getTime() - Date.now()) / 1000),
        ),
      );
      setTimeout(() => codeInput.current?.focus(), 250);
    } catch (error) {
      setErrorText(describe(error));
    }
  }, [phoneE164, requestCode, describe, locale]);

  const submitCode = useCallback(
    async (value: string) => {
      if (!challenge) return;
      setErrorText(null);
      try {
        const verified = await verifyCode.mutateAsync({
          challengeId: challenge.challengeId,
          code: value,
          localeCode: locale,
        });
        // The number is what the booking is made under, and the token does not
        // carry it, so it is remembered here.
        setVerified({ phoneE164: verified.phoneE164 });

        // Replace, not push: the verification steps must not sit in the back
        // stack between the table and its confirmation. Reached with no table
        // in hand — from "My bookings" — it goes back to where it came from.
        if (forward.tableId) {
          router.replace({ pathname: '/reserve/confirm', params: forward });
        } else {
          router.back();
        }
      } catch (error) {
        setCode('');
        setErrorText(describe(error));
      }
    },
    [challenge, verifyCode, setVerified, router, forward, describe, locale],
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

  const busy = requestCode.isPending || verifyCode.isPending;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      {step === 'phone' ? (
        <View style={styles.body}>
          <Text style={styles.title}>{t('verify.phoneTitle')}</Text>
          {/* Considerate framing: says why, not just what. */}
          <Text style={styles.blurb}>{t('verify.phoneBody')}</Text>

          <Text style={styles.label}>{t('verify.phoneLabel')}</Text>
          <View style={styles.phoneRow}>
            {/* Armenian numbers are the common case; tourists still need any
                international prefix, so this is editable rather than fixed. */}
            <TextInput
              style={styles.prefix}
              value={prefix}
              onChangeText={setPrefix}
              keyboardType="phone-pad"
              accessibilityLabel="Country code"
              maxLength={5}
            />
            <TextInput
              style={styles.number}
              value={localNumber}
              onChangeText={setLocalNumber}
              placeholder={t('verify.phonePlaceholder')}
              placeholderTextColor={color.mutedForeground}
              keyboardType="phone-pad"
              autoFocus
              accessibilityLabel={t('verify.phoneLabel')}
            />
          </View>

          {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={busy || localNumber.replace(/\D/gu, '').length < 6}
            onPress={() => void send()}
            style={({ pressed }) => [
              styles.primary,
              pressed && styles.primaryPressed,
              (busy || localNumber.replace(/\D/gu, '').length < 6) && styles.primaryDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={color.primaryForeground} />
            ) : (
              <Text style={styles.primaryText}>{t('verify.sendCode')}</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.title}>{t('verify.codeTitle')}</Text>
          <Text style={styles.blurb}>{t('verify.codeBody', { phone: phoneE164 })}</Text>

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
              real auto-advance, without six refs fighting each other. */}
          <Pressable onPress={() => codeInput.current?.focus()} style={styles.codeRow}>
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <View key={i} style={[styles.codeCell, code.length === i && styles.codeCellActive]}>
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
            autoComplete="sms-otp"
            maxLength={CODE_LENGTH}
            autoFocus
            accessibilityLabel={t('verify.codeTitle')}
          />

          {verifyCode.isPending ? <ActivityIndicator color={color.primaryInk} /> : null}
          {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={secondsLeft > 0 || busy}
            onPress={() => void send()}
            style={styles.secondary}
          >
            <Text style={[styles.secondaryText, secondsLeft > 0 && styles.secondaryTextMuted]}>
              {secondsLeft > 0
                ? t('verify.resendIn', { seconds: secondsLeft })
                : t('verify.resend')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setStep('phone');
              setErrorText(null);
              setCode('');
            }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>{t('verify.changeNumber')}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  body: { flex: 1, padding: space.xl, gap: space.sm },
  title: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  blurb: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: color.mutedForeground,
    marginBottom: space.md,
  },
  label: { fontSize: fontSize.sm, color: color.mutedForeground },
  phoneRow: { flexDirection: 'row', gap: space.sm },
  prefix: {
    width: 84,
    minHeight: touchTarget.minimum,
    paddingHorizontal: space.md,
    borderRadius: radius.soft,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    color: color.foreground,
    fontSize: fontSize.md,
  },
  number: {
    flex: 1,
    minHeight: touchTarget.minimum,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    color: color.foreground,
    fontSize: fontSize.md,
  },
  codeRow: { flexDirection: 'row', gap: space.sm, marginVertical: space.lg },
  codeCell: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  codeCellActive: { borderColor: color.primaryInk },
  codeDigit: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  devBanner: {
    padding: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.warning,
    backgroundColor: color.surface,
  },
  devBannerText: { fontSize: fontSize.sm, color: color.warning, fontWeight: fontWeight.medium },
  error: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.danger,
    marginTop: space.xs,
  },
  primary: {
    marginTop: space.xl,
    minHeight: touchTarget.minimum + 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  primaryPressed: { backgroundColor: color.primaryPressed },
  primaryDisabled: { opacity: 0.45 },
  primaryText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.primaryForeground,
  },
  secondary: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: fontSize.md, color: color.primaryInk },
  secondaryTextMuted: { color: color.mutedForeground },
});
