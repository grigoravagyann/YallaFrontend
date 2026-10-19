import {
  SmsUnavailableError,
  ValidationError,
  type DinerProfileView,
  type VerifiedPhone,
} from '@yalla/api';
import { useGateway, useNow } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Button } from '../components/Button';
import { Field, FieldInput, PasswordInput } from '../components/auth/Field';
import { SheetModal } from '../components/motion/SheetModal';
import { Text } from '../components/Text';
import { accountKeys } from '../data/accountQueries';
import {
  usePhoneProofChannels,
  useRequestPhoneCode,
  useTelegramVerification,
} from '../data/queries';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { PHONE_PROOF_WINDOW_MS, useSession } from '../stores/session';
import { colors, layout, radius, space, tabularNumbers, typography } from '../theme';
import { deleteAccountErrorKey } from './deleteAccountError';

export interface DeleteAccountSheetProps {
  readonly visible: boolean;
  readonly profile: DinerProfileView;
  readonly onClose: () => void;
  /** The server deleted the account; every session it had is already over. */
  readonly onDeleted: () => void;
}

/**
 * "Delete your account?" — what goes, what the venues keep, and one proof that
 * it is really the owner asking (K2).
 *
 * An account with a password confirms with it. One made by phone code, with
 * none, asks for a fresh code for its own number, and says how to set a
 * password instead when no code arrives. Either way the server checks, and a
 * wrong answer deletes nothing.
 *
 * Where the backend has no SMS (Telegram only, decided 2026-10-20) there is no
 * code to ask for. The account without a password proves its number with the
 * Telegram bot instead: the claim signs the same account in again, and the new
 * access token carries the phone proof, so the deletion goes with nothing in
 * its body for the next ten minutes. A sign-in on this phone that already
 * proved the number in those ten minutes counts too — which is also what
 * covers the bot's "back to Yalla" button resuming the challenge on the
 * verify route rather than here. A phone proof never stands in for a password.
 */
export function DeleteAccountSheet({
  visible,
  profile,
  onClose,
  onDeleted,
}: DeleteAccountSheetProps) {
  // A fresh form every time the sheet opens — no half-typed password from the
  // last attempt — while the one on screen stays drawn as the sheet slides away.
  const [opened, setOpened] = useState({ visible, count: 0 });
  if (opened.visible !== visible) {
    setOpened({ visible, count: visible ? opened.count + 1 : opened.count });
  }
  return (
    <DeleteForm
      key={opened.count}
      visible={visible}
      profile={profile}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}

/** The share of the screen the sheet may take before its form scrolls. */
const MAX_HEIGHT = 0.9;

/**
 * How the account confirms. `loading` while the backend has not yet said
 * which doors are open — neither is offered until it has — and `none` when
 * it has neither: then setting a password is the way.
 */
type Proof = 'password' | 'loading' | 'code' | 'telegram' | 'none';

function DeleteForm({ visible, profile, onClose, onDeleted }: DeleteAccountSheetProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const gateway = useGateway();
  const keyboard = useKeyboardInset();
  const { height } = useWindowDimensions();
  const [secret, setSecret] = useState('');
  const queryClient = useQueryClient();
  const setVerified = useSession((s) => s.setVerified);
  const markPhoneProved = useSession((s) => s.markPhoneProved);
  const provedAtMs = useSession((s) => s.phoneProvedAtMs);
  const now = useNow();
  /** Telegram confirmed a number that is not this account's. */
  const [otherNumber, setOtherNumber] = useState(false);
  const [telegramNotInstalled, setTelegramNotInstalled] = useState(false);
  /** A proof the server refused as too old: not offered as one again. */
  const [refusedProofAtMs, setRefusedProofAtMs] = useState<number | null>(null);

  const withPassword = profile.hasPassword;
  const requestCode = useRequestPhoneCode();
  const channels = usePhoneProofChannels();
  const telegram = useTelegramVerification({
    localeCode: locale,
    onVerified: (verified: VerifiedPhone) => {
      // What a Telegram log-in does after the bot (PhoneAuthFlow's
      // `afterVerified`): the claim signed the account in again, so the
      // stored session follows it, and the proof's time is what makes the
      // empty deletion acceptable.
      setVerified({ phoneE164: verified.phoneE164 });
      markPhoneProved(Date.now());
      void queryClient.invalidateQueries({ queryKey: accountKeys.profile });
      setOtherNumber(verified.phoneE164 !== profile.phoneE164);
    },
  });

  // A code refused for want of SMS closes that door, as the channels read
  // would have; a failed read offers the code, whose own refusal then does.
  const smsRefused = requestCode.error instanceof SmsUnavailableError;
  const proof: Proof = withPassword
    ? 'password'
    : channels.isPending
      ? 'loading'
      : channels.data?.sms !== false && !smsRefused
        ? 'code'
        : channels.data?.telegram !== false && telegram.status !== 'unavailable'
          ? 'telegram'
          : 'none';
  // `now` lags by up to its interval; a proof stamped after it still counts.
  const proofInHand =
    proof === 'telegram' &&
    !otherNumber &&
    provedAtMs !== null &&
    provedAtMs !== refusedProofAtMs &&
    now.getTime() - provedAtMs <= PHONE_PROOF_WINDOW_MS;

  const deletion = useMutation({
    mutationFn: (byTelegram: boolean) =>
      gateway.deleteDinerAccount(
        withPassword ? { password: secret } : byTelegram ? {} : { code: secret.trim() },
      ),
    onSuccess: onDeleted,
    onError: (error, byTelegram) => {
      // The proof was older than this phone thought: back to the button.
      if (byTelegram && error instanceof ValidationError && error.field === 'code') {
        setRefusedProofAtMs(provedAtMs);
        telegram.reset();
      }
    },
  });
  const busy = deletion.isPending;
  const canConfirm =
    !busy && (proof === 'telegram' ? proofInHand : proof !== 'none' && secret.trim().length > 0);
  const failure =
    deletion.error ??
    (smsRefused ? null : requestCode.error) ??
    (telegram.status === 'failed' ? telegram.error : null);

  /** Hand the diner to Telegram; without it installed, the link stays on screen. */
  const openTelegram = (url: string) => {
    setTelegramNotInstalled(false);
    Linking.openURL(url).catch(() => setTelegramNotInstalled(true));
  };
  const startTelegram = () => {
    deletion.reset();
    setOtherNumber(false);
    telegram
      .start()
      .then((issued) => openTelegram(issued.deepLinkUrl))
      // `status` and `error` already say what went wrong.
      .catch(() => undefined);
  };
  /*
   * No SMS is sent anywhere yet: Development hands the code back instead. Shown
   * the way the code screen shows it, and only in a dev build, so a production
   * bundle cannot print a code even if a misconfigured server returns one.
   */
  const devCode = __DEV__ ? requestCode.data?.devCode : undefined;

  return (
    <SheetModal
      visible={visible}
      // The veil closes it, except while the deletion is in flight.
      {...(busy ? {} : { onRequestClose: onClose })}
      closeLabel={t('profile.deleteAccount.cancel')}
      accessibilityLabel={t('profile.deleteAccount.title')}
      // Stands on the iOS keyboard, so the password is never typed blind.
      style={{ bottom: keyboard, maxHeight: height * MAX_HEIGHT - keyboard }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Text display style={styles.title} accessibilityRole="header">
          {t('profile.deleteAccount.title')}
        </Text>
        <Text style={styles.text}>{t('profile.deleteAccount.body')}</Text>

        {withPassword ? (
          <Field label={t('profile.deleteAccount.passwordLabel')}>
            <PasswordInput
              value={secret}
              onChangeText={(value) => {
                deletion.reset();
                setSecret(value);
              }}
              showLabel={t('auth.showPassword')}
              hideLabel={t('auth.hidePassword')}
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel={t('profile.deleteAccount.passwordLabel')}
              editable={!busy}
            />
          </Field>
        ) : proof === 'loading' ? (
          <ActivityIndicator color={colors.primary} />
        ) : proof === 'none' ? (
          <Text style={styles.text}>{t('profile.deleteAccount.noProofHint')}</Text>
        ) : proof === 'telegram' ? (
          <>
            {otherNumber ? (
              <Text style={styles.error} accessibilityRole="alert">
                {t('profile.deleteAccount.otherNumber')}
              </Text>
            ) : null}
            {proofInHand ? (
              <Text style={styles.proved} role="status" accessibilityLiveRegion="polite">
                {t('profile.deleteAccount.telegramConfirmed')}
              </Text>
            ) : telegram.status === 'pending' ? (
              <>
                <View style={styles.waiting}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.text, styles.waitingText]}>
                    {t('verify.telegramWaitingBody')}
                  </Text>
                </View>
                {/* No app to hand over to: the https link works in any browser. */}
                {telegramNotInstalled && telegram.deepLinkUrl ? (
                  <>
                    <Text style={styles.error} accessibilityRole="alert">
                      {t('verify.telegramNotInstalled')}
                    </Text>
                    <Text selectable style={styles.link}>
                      {telegram.deepLinkUrl}
                    </Text>
                  </>
                ) : null}
                {telegram.deepLinkUrl ? (
                  <Button
                    label={t('verify.telegramOpenAgain')}
                    variant="outline"
                    disabled={busy}
                    onPress={() => openTelegram(telegram.deepLinkUrl!)}
                  />
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.text}>
                  {t(
                    telegram.status === 'expired'
                      ? 'verify.telegramExpired'
                      : 'profile.deleteAccount.telegramBody',
                  )}
                </Text>
                <Button
                  label={t(
                    telegram.status === 'expired'
                      ? 'verify.telegramTryAgain'
                      : 'verify.telegramButton',
                  )}
                  variant="outline"
                  busy={telegram.status === 'starting'}
                  disabled={telegram.status === 'starting' || busy}
                  onPress={startTelegram}
                />
              </>
            )}
          </>
        ) : (
          <>
            <Button
              label={t('profile.deleteAccount.sendCode')}
              variant="outline"
              busy={requestCode.isPending}
              disabled={requestCode.isPending || busy}
              onPress={() => {
                deletion.reset();
                requestCode.mutate({ phoneE164: profile.phoneE164, localeCode: locale });
              }}
            />
            {requestCode.isSuccess ? (
              <Text style={styles.text}>
                {t('profile.deleteAccount.codeSent', { phone: profile.phoneE164 })}
              </Text>
            ) : null}
            {devCode ? (
              <Text style={styles.text}>{t('verify.devBanner', { code: devCode })}</Text>
            ) : null}
            <Text style={styles.text}>{t('profile.deleteAccount.noCodeHint')}</Text>
            <Field label={t('profile.deleteAccount.codeLabel')}>
              <FieldInput
                value={secret}
                onChangeText={(value) => {
                  deletion.reset();
                  setSecret(value.replace(/\D/gu, ''));
                }}
                keyboardType="number-pad"
                maxLength={6}
                tabular
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                accessibilityLabel={t('profile.deleteAccount.codeLabel')}
                editable={!busy}
              />
            </Field>
          </>
        )}

        {failure ? (
          <Text style={styles.error} accessibilityRole="alert">
            {t(deleteAccountErrorKey(failure, withPassword, proof === 'telegram'))}
          </Text>
        ) : null}

        {/* The way out first, in the fill; the deletion as a soft red pill. */}
        <View style={styles.actions}>
          <Button
            label={t('profile.deleteAccount.cancel')}
            size="large"
            disabled={busy}
            onPress={onClose}
          />
          <Button
            label={t('profile.deleteAccount.confirm')}
            variant="destructive"
            busy={busy}
            disabled={!canConfirm}
            onPress={() => deletion.mutate(proof === 'telegram')}
            style={styles.destructive}
          />
        </View>
      </ScrollView>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  title: { ...typography.h3, fontSize: 19, color: colors.text },
  text: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.errorInk },
  proved: { ...typography.body, color: colors.successInk },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  waitingText: { flex: 1 },
  link: { ...typography.body, ...tabularNumbers, color: colors.primary },
  actions: { gap: space.sm, marginTop: space.sm },
  // A soft red pill under the label, so the red still reads as a button.
  destructive: {
    minHeight: layout.touchTarget + 6,
    justifyContent: 'center',
    backgroundColor: colors.errorSoft,
    borderRadius: radius.pill,
  },
});
