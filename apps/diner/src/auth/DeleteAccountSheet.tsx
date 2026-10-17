import type { DinerProfileView } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button } from '../components/Button';
import { Field, FieldInput, PasswordInput } from '../components/auth/Field';
import { SheetModal } from '../components/motion/SheetModal';
import { Text } from '../components/Text';
import { useRequestPhoneCode } from '../data/queries';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { colors, layout, radius, space, typography } from '../theme';
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

function DeleteForm({ visible, profile, onClose, onDeleted }: DeleteAccountSheetProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const gateway = useGateway();
  const keyboard = useKeyboardInset();
  const { height } = useWindowDimensions();
  const [secret, setSecret] = useState('');

  const withPassword = profile.hasPassword;
  const requestCode = useRequestPhoneCode();
  const deletion = useMutation({
    mutationFn: () =>
      gateway.deleteDinerAccount(withPassword ? { password: secret } : { code: secret.trim() }),
    onSuccess: onDeleted,
  });
  const busy = deletion.isPending;
  const canConfirm = secret.trim().length > 0 && !busy;
  const failure = deletion.error ?? requestCode.error;
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
            {t(deleteAccountErrorKey(failure, withPassword))}
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
            onPress={() => deletion.mutate()}
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
  actions: { gap: space.sm, marginTop: space.sm },
  // A soft red pill under the label, so the red still reads as a button.
  destructive: {
    minHeight: layout.touchTarget + 6,
    justifyContent: 'center',
    backgroundColor: colors.errorSoft,
    borderRadius: radius.pill,
  },
});
