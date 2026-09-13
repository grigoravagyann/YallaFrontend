import { verificationFailureCopy } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { describeAccountFailure, type AccountField } from '../../src/auth/accountErrors';
import {
  isValidPassword,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeUsername,
} from '../../src/auth/validation';
import { AuthScaffold } from '../../src/components/auth/AuthScaffold';
import { Field, FieldInput, PasswordInput } from '../../src/components/auth/Field';
import { useAuthFinish, type AuthRouteParams } from '../../src/components/auth/useAuthFinish';
import { Button } from '../../src/components/Button';
import { Text } from '../../src/components/Text';
import { useRegisterDiner } from '../../src/data/accountQueries';
import { useSession } from '../../src/stores/session';
import { colors, space, typography } from '../../src/theme';

const DEFAULT_PREFIX = '+374';

type Touched = Record<'name' | 'username' | 'email' | 'phone' | 'password', boolean>;
type ServerErrors = Partial<Record<AccountField, string>>;

const ALL_TOUCHED: Touched = {
  name: true,
  username: true,
  email: true,
  phone: true,
  password: true,
};

/**
 * Create account: name, username, email, phone and password, in one form.
 *
 * The number is not verified by registering; the profile offers "Verify"
 * afterwards. A number that already has an account is offered the SMS log in
 * instead, right under the phone field.
 */
export default function SignupScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const params = useLocalSearchParams<AuthRouteParams>();
  const { finish, switchTo, leave } = useAuthFinish(params);
  const register = useRegisterDiner();
  const rememberedName = useSession((s) => s.guestName);
  const rememberedEmail = useSession((s) => s.email);

  const [name, setName] = useState(rememberedName ?? '');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(rememberedEmail ?? '');
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [localNumber, setLocalNumber] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<Touched>({
    name: false,
    username: false,
    email: false,
    phone: false,
    password: false,
  });
  const [serverErrors, setServerErrors] = useState<ServerErrors>({});
  const [phoneInUse, setPhoneInUse] = useState(false);

  const tidyName = normalizeName(name);
  const tidyUsername = normalizeUsername(username);
  const tidyEmail = normalizeEmail(email);
  const phoneE164 = normalizePhone(prefix, localNumber);
  const passwordOk = isValidPassword(password);

  const touch = (field: keyof Touched) => setTouched((prev) => ({ ...prev, [field]: true }));
  /** Typing in a field clears what the server said about it. */
  const edited = (field: AccountField) => {
    setServerErrors((prev) => {
      if (!(field in prev) && !('form' in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      delete next.form;
      return next;
    });
    if (field === 'phone') setPhoneInUse(false);
  };

  // Field errors appear once a field has been left, not while it is typed in.
  const nameError =
    serverErrors.name ?? (touched.name && !tidyName ? t('auth.error.nameRequired') : null);
  const usernameError =
    serverErrors.username ??
    (touched.username && !tidyUsername ? t('auth.error.usernameInvalid') : null);
  const emailError =
    serverErrors.email ?? (touched.email && !tidyEmail ? t('auth.error.emailInvalid') : null);
  const phoneError =
    serverErrors.phone ?? (touched.phone && !phoneE164 ? t('auth.error.phoneInvalid') : null);
  const passwordError =
    serverErrors.password ??
    (touched.password && !passwordOk ? t('auth.error.passwordInvalid') : null);

  const canSubmit =
    !register.isPending &&
    tidyName !== null &&
    tidyUsername !== null &&
    tidyEmail !== null &&
    phoneE164 !== null &&
    passwordOk;

  const submit = async () => {
    if (!tidyName || !tidyUsername || !tidyEmail || !phoneE164 || !passwordOk) {
      setTouched(ALL_TOUCHED);
      return;
    }
    if (register.isPending) return;
    setServerErrors({});
    setPhoneInUse(false);
    try {
      await register.mutateAsync({
        displayName: tidyName,
        username: tidyUsername,
        email: tidyEmail,
        phoneE164,
        password,
        localeCode: locale,
      });
      finish();
    } catch (error) {
      const failure = describeAccountFailure(error);
      if (failure.key === 'auth.error.phoneInUse') setPhoneInUse(true);
      if (failure.key) {
        setServerErrors({ [failure.field]: t(failure.key) });
      } else {
        const line = verificationFailureCopy(error, locale);
        setServerErrors({ form: t(line.key, line.params) });
      }
    }
  };

  return (
    <AuthScaffold
      title={t('auth.signup.title')}
      body={t('auth.account.signupBody')}
      onBack={leave}
      footer={{
        prompt: t('auth.signup.haveAccount'),
        action: t('auth.logIn'),
        onPress: () => switchTo('/auth/login'),
      }}
    >
      <Field label={t('auth.nameLabel')} error={nameError}>
        <FieldInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            edited('name');
          }}
          onBlur={() => touch('name')}
          placeholder={t('auth.namePlaceholder')}
          autoCapitalize="words"
          textContentType="name"
          autoComplete="name"
          autoFocus
          invalid={nameError !== null}
          accessibilityLabel={t('auth.nameLabel')}
          maxLength={100}
        />
      </Field>
      <Field label={t('auth.usernameLabel')} hint={t('auth.usernameHint')} error={usernameError}>
        <FieldInput
          value={username}
          onChangeText={(v) => {
            setUsername(v.toLowerCase());
            edited('username');
          }}
          onBlur={() => touch('username')}
          placeholder={t('auth.usernamePlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username-new"
          invalid={usernameError !== null}
          accessibilityLabel={t('auth.usernameLabel')}
          maxLength={30}
        />
      </Field>
      <Field label={t('auth.emailFieldLabel')} error={emailError}>
        <FieldInput
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            edited('email');
          }}
          onBlur={() => touch('email')}
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
          invalid={emailError !== null}
          accessibilityLabel={t('auth.emailFieldLabel')}
          maxLength={320}
        />
      </Field>
      <View>
        <Field label={t('verify.phoneLabel')} error={phoneError}>
          <View style={styles.phoneRow}>
            <FieldInput
              style={styles.prefix}
              value={prefix}
              onChangeText={(v) => {
                setPrefix(v);
                edited('phone');
              }}
              onBlur={() => touch('phone')}
              keyboardType="phone-pad"
              tabular
              accessibilityLabel={t('verify.countryCode')}
              maxLength={5}
            />
            <FieldInput
              style={styles.number}
              value={localNumber}
              onChangeText={(v) => {
                setLocalNumber(v);
                edited('phone');
              }}
              onBlur={() => touch('phone')}
              placeholder={t('verify.phonePlaceholder')}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              tabular
              invalid={phoneError !== null}
              accessibilityLabel={t('verify.phoneLabel')}
            />
          </View>
        </Field>
        {phoneInUse ? (
          <Button
            label={t('auth.codeInstead')}
            variant="text"
            fullWidth={false}
            onPress={() => switchTo('/auth/code')}
          />
        ) : null}
      </View>
      <Field label={t('auth.passwordLabel')} hint={t('auth.passwordHint')} error={passwordError}>
        <PasswordInput
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            edited('password');
          }}
          onBlur={() => touch('password')}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          invalid={passwordError !== null}
          accessibilityLabel={t('auth.passwordLabel')}
          showLabel={t('auth.showPassword')}
          hideLabel={t('auth.hidePassword')}
          maxLength={128}
        />
      </Field>
      {serverErrors.form ? (
        <Text style={styles.error} accessibilityRole="alert">
          {serverErrors.form}
        </Text>
      ) : null}
      <Button
        label={t('auth.createAccount')}
        size="large"
        disabled={!canSubmit}
        onPress={() => void submit()}
        style={styles.primary}
      />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  phoneRow: { flexDirection: 'row', gap: space.sm },
  prefix: { width: 92 },
  number: { flex: 1 },
  error: { ...typography.body, color: colors.error },
  primary: { marginTop: space.lg },
});
