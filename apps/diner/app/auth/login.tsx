import { verificationFailureCopy } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { describeAccountFailure } from '../../src/auth/accountErrors';
import { AuthScaffold } from '../../src/components/auth/AuthScaffold';
import { Field, FieldInput, PasswordInput } from '../../src/components/auth/Field';
import { useAuthFinish, type AuthRouteParams } from '../../src/components/auth/useAuthFinish';
import { Button } from '../../src/components/Button';
import { Text } from '../../src/components/Text';
import { useLoginDiner } from '../../src/data/accountQueries';
import { colors, space, typography } from '../../src/theme';

/**
 * Log in with a username or an email and a password. "Log in with a code
 * instead" is the SMS flow, in this screen's place, with the same booking.
 */
export default function LoginScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const params = useLocalSearchParams<AuthRouteParams>();
  const { finish, switchTo, leave } = useAuthFinish(params);
  const login = useLoginDiner();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const tidyIdentifier = identifier.trim();
  const canSubmit = !login.isPending && tidyIdentifier.length > 0 && password.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setErrorText(null);
    try {
      await login.mutateAsync({ identifier: tidyIdentifier, password, localeCode: locale });
      finish();
    } catch (error) {
      // Every refusal is one line under the form: which half was wrong is not
      // something the server says, on purpose.
      const failure = describeAccountFailure(error);
      if (failure.key) {
        setErrorText(t(failure.key));
      } else {
        const line = verificationFailureCopy(error, locale);
        setErrorText(t(line.key, line.params));
      }
    }
  };

  return (
    <AuthScaffold
      title={t('auth.login.title')}
      body={t('auth.account.loginBody')}
      onBack={leave}
      footer={{
        prompt: t('auth.login.noAccount'),
        action: t('auth.login.createOne'),
        onPress: () => switchTo('/auth/signup'),
      }}
    >
      <Field label={t('auth.identifierLabel')}>
        <FieldInput
          value={identifier}
          onChangeText={(v) => {
            setIdentifier(v);
            setErrorText(null);
          }}
          placeholder={t('auth.identifierPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="username"
          autoFocus
          accessibilityLabel={t('auth.identifierLabel')}
        />
      </Field>
      <Field label={t('auth.passwordLabel')}>
        <PasswordInput
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setErrorText(null);
          }}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          accessibilityLabel={t('auth.passwordLabel')}
          showLabel={t('auth.showPassword')}
          hideLabel={t('auth.hidePassword')}
          maxLength={128}
        />
      </Field>
      {errorText ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorText}
        </Text>
      ) : null}
      <Button
        label={t('auth.logIn')}
        size="large"
        disabled={!canSubmit}
        onPress={() => void submit()}
        style={styles.primary}
      />
      <Button
        label={t('auth.codeInstead')}
        variant="text"
        disabled={login.isPending}
        onPress={() => switchTo('/auth/code')}
      />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.body, color: colors.errorInk },
  primary: { marginTop: space.lg },
});
