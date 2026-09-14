import type { DinerProfileView } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Field, FieldInput, PasswordInput } from '../components/auth/Field';
import { Text } from '../components/Text';
import { useRequestPhoneCode } from '../data/queries';
import { colors, radius, shadows, space, typography } from '../theme';

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
 * An account with a password confirms with it. One made by SMS, with none,
 * asks for a fresh code sent to its own number. Either way the server checks,
 * and a wrong answer deletes nothing.
 */
export function DeleteAccountSheet({
  visible,
  profile,
  onClose,
  onDeleted,
}: DeleteAccountSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible ? <DeleteForm profile={profile} onClose={onClose} onDeleted={onDeleted} /> : null}
    </Modal>
  );
}

function DeleteForm({ profile, onClose, onDeleted }: Omit<DeleteAccountSheetProps, 'visible'>) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const gateway = useGateway();
  const insets = useSafeAreaInsets();
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
  const failed = deletion.isError || requestCode.isError;

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable
        style={styles.backdrop}
        accessibilityLabel={t('profile.deleteAccount.cancel')}
        onPress={busy ? undefined : onClose}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.grabber} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Text style={styles.title} accessibilityRole="header">
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

          {failed ? (
            <Text style={styles.error} accessibilityRole="alert">
              {t('profile.deleteAccount.error')}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={t('profile.deleteAccount.confirm')}
              variant="destructive"
              busy={busy}
              disabled={!canConfirm}
              onPress={() => deletion.mutate()}
              style={styles.destructive}
            />
            <Button
              label={t('profile.deleteAccount.cancel')}
              variant="secondary"
              disabled={busy}
              onPress={onClose}
            />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlayDark },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '90%',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.surface,
    ...shadows.float,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: space.sm,
  },
  body: { gap: space.md },
  title: { ...typography.h3, color: colors.text },
  text: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.errorInk },
  actions: { gap: space.sm, marginTop: space.sm },
  destructive: { borderWidth: 1, borderColor: colors.border },
});
