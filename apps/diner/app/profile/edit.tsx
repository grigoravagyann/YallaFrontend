import { Ionicons } from '@expo/vector-icons';
import { verificationFailureCopy, type DinerPhotoFile, type DinerProfileView } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  describeAccountFailure,
  photoFailureKey,
  type AccountField,
} from '../../src/auth/accountErrors';
import {
  isValidPassword,
  normalizeEmail,
  normalizeName,
  normalizeUsername,
} from '../../src/auth/validation';
import { Field, FieldInput, PasswordInput } from '../../src/components/auth/Field';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ErrorState } from '../../src/components/ErrorState';
import { IconButton } from '../../src/components/IconButton';
import { PhotoImage } from '../../src/components/PhotoImage';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import {
  useDinerProfile,
  useRemoveDinerPhoto,
  useSetDinerPassword,
  useUpdateDinerProfile,
  useUploadDinerPhoto,
} from '../../src/data/accountQueries';
import { initialsOf } from '../../src/lib/initials';
import { useSession } from '../../src/stores/session';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  shadows,
  space,
  typography,
} from '../../src/theme';

const PHOTO = 120;
const BADGE = 40;

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
};

/**
 * Edit profile: the photo, the name / username / email, the password, and the
 * phone's verified state. Each section saves on its own.
 */
export default function EditProfileScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const signedIn = useSession((s) => s.signedIn);
  const profile = useSession((s) => s.profile);
  const query = useDinerProfile();

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  let content;
  if (profile) content = <EditForm profile={profile} />;
  else if (query.isError || !signedIn)
    content = <ErrorState onRetry={() => void query.refetch()} style={styles.state} />;
  else content = <ActivityIndicator color={colors.primary} style={styles.state} />;

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <IconButton
          icon={actionIcon.back}
          accessibilityLabel={t('floorPlan.back')}
          variant="ghost"
          onPress={back}
        />
        <Text display style={styles.headerTitle} accessibilityRole="header">
          {t('editProfile.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      {content}
    </Screen>
  );
}

function EditForm({ profile }: { readonly profile: DinerProfileView }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();

  const upload = useUploadDinerPhoto();
  const removePhoto = useRemoveDinerPhoto();
  const update = useUpdateDinerProfile();
  const setPassword = useSetDinerPassword();

  // --- Photo --------------------------------------------------------------
  const [sheetOpen, setSheetOpen] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const generic = (error: unknown) => {
    const line = verificationFailureCopy(error, locale);
    return t(line.key, line.params);
  };

  const pick = async (source: 'library' | 'camera') => {
    setSheetOpen(false);
    setPhotoError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPhotoError(t('editProfile.permission.camera'));
          return;
        }
      } else if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setPhotoError(t('editProfile.permission.library'));
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
          : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      // The web picker hands back a blob: URL; multipart there needs the bytes.
      const file: DinerPhotoFile =
        Platform.OS === 'web'
          ? await (await fetch(asset.uri)).blob()
          : { uri: asset.uri, name: 'avatar.jpg', type: asset.mimeType ?? 'image/jpeg' };
      await upload.mutateAsync(file);
    } catch (error) {
      const key = photoFailureKey(error);
      setPhotoError(key ? t(key) : t('editProfile.photoError.generic'));
    }
  };

  const remove = async () => {
    setSheetOpen(false);
    setPhotoError(null);
    try {
      await removePhoto.mutateAsync();
    } catch {
      setPhotoError(t('editProfile.photoError.generic'));
    }
  };

  const photoBusy = upload.isPending || removePhoto.isPending;

  // --- Details ------------------------------------------------------------
  const [name, setName] = useState(profile.displayName ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [detailErrors, setDetailErrors] = useState<Partial<Record<AccountField, string>>>({});
  const [saved, setSaved] = useState(false);

  const tidyName = normalizeName(name);
  const tidyUsername = normalizeUsername(username);
  const tidyEmail = normalizeEmail(email);
  // An account without a username or email yet may leave it empty.
  const usernameOk = tidyUsername !== null || (username.trim() === '' && !profile.username);
  const emailOk = tidyEmail !== null || (email.trim() === '' && !profile.email);

  const nameChanged = tidyName !== null && tidyName !== profile.displayName;
  const usernameChanged = tidyUsername !== null && tidyUsername !== profile.username;
  const emailChanged = tidyEmail !== null && tidyEmail !== profile.email;
  const changed = nameChanged || usernameChanged || emailChanged;
  const detailsValid = tidyName !== null && usernameOk && emailOk;
  const canSave = changed && detailsValid && !update.isPending;

  const nameError = detailErrors.name ?? (tidyName ? null : t('auth.error.nameRequired'));
  const usernameError =
    detailErrors.username ?? (usernameOk ? null : t('auth.error.usernameInvalid'));
  const emailError = detailErrors.email ?? (emailOk ? null : t('auth.error.emailInvalid'));

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(id);
  }, [saved]);

  const editDetail = (field: AccountField) => {
    setSaved(false);
    setDetailErrors((prev) => {
      if (!(field in prev) && !('form' in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      delete next.form;
      return next;
    });
  };

  const save = async () => {
    if (!canSave) return;
    setDetailErrors({});
    try {
      await update.mutateAsync({
        ...(nameChanged ? { displayName: tidyName } : {}),
        ...(usernameChanged ? { username: tidyUsername } : {}),
        ...(emailChanged ? { email: tidyEmail } : {}),
      });
      setSaved(true);
    } catch (error) {
      const failure = describeAccountFailure(error);
      setDetailErrors({ [failure.field]: failure.key ? t(failure.key) : generic(error) });
    }
  };

  // --- Password -----------------------------------------------------------
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<Partial<Record<AccountField, string>>>({});
  const [passwordDone, setPasswordDone] = useState<string | null>(null);

  const hasPassword = profile.hasPassword;
  const canChangePassword =
    isValidPassword(newPassword) &&
    (!hasPassword || currentPassword.length > 0) &&
    !setPassword.isPending;
  const newPasswordError =
    passwordErrors.password ??
    (newPassword.length > 0 && !isValidPassword(newPassword)
      ? t('auth.error.passwordInvalid')
      : null);

  const changePassword = async () => {
    if (!canChangePassword) return;
    setPasswordErrors({});
    setPasswordDone(null);
    const wasSet = hasPassword;
    try {
      await setPassword.mutateAsync({
        ...(wasSet ? { currentPassword } : {}),
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordDone(
        wasSet ? t('editProfile.password.changed') : t('editProfile.password.setDone'),
      );
    } catch (error) {
      const failure = describeAccountFailure(error);
      if (failure.key === 'auth.error.invalidCredentials') {
        setPasswordErrors({ currentPassword: t('editProfile.password.wrongCurrent') });
      } else {
        setPasswordErrors({ [failure.field]: failure.key ? t(failure.key) : generic(error) });
      }
    }
  };

  const displayName = profile.displayName ?? name;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Photo */}
        <View style={styles.photoBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('editProfile.changePhoto')}
            accessibilityState={{ busy: photoBusy, disabled: photoBusy }}
            disabled={photoBusy}
            onPress={() => setSheetOpen(true)}
            style={({ pressed }) => [styles.photoPress, pressed && styles.pressed]}
          >
            {profile.photo ? (
              <PhotoImage source={profile.photo.cardUrl} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.initialsWell]}>
                <Text display style={styles.initials}>
                  {initialsOf(displayName)}
                </Text>
              </View>
            )}
            {photoBusy ? (
              <View
                style={[styles.photo, styles.photoOverlay]}
                accessibilityLabel={t('editProfile.uploading')}
              >
                <ActivityIndicator color={colors.onPrimary} />
              </View>
            ) : null}
            <View style={styles.badge}>
              <Ionicons name="camera-outline" size={iconSize.md} color={colors.onPrimary} />
            </View>
          </Pressable>
          {photoError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {photoError}
            </Text>
          ) : null}
        </View>

        {/* Details */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('editProfile.details')}
          </Text>
          <Field label={t('auth.nameLabel')} error={nameError}>
            <FieldInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                editDetail('name');
              }}
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              invalid={nameError !== null}
              accessibilityLabel={t('auth.nameLabel')}
              maxLength={100}
            />
          </Field>
          <Field
            label={t('auth.usernameLabel')}
            hint={t('auth.usernameHint')}
            error={usernameError}
          >
            <FieldInput
              value={username}
              onChangeText={(v) => {
                setUsername(v.toLowerCase());
                editDetail('username');
              }}
              placeholder={t('auth.usernamePlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
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
                editDetail('email');
              }}
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
          {detailErrors.form ? (
            <Text style={styles.error} accessibilityRole="alert">
              {detailErrors.form}
            </Text>
          ) : null}
          {saved ? (
            <Text style={styles.success} accessibilityLiveRegion="polite">
              {t('editProfile.saved')}
            </Text>
          ) : null}
          <Button label={t('editProfile.save')} disabled={!canSave} onPress={() => void save()} />
        </Card>

        {/* Password */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('editProfile.password.title')}
          </Text>
          {hasPassword ? null : (
            <Text style={styles.muted}>{t('editProfile.password.setBody')}</Text>
          )}
          {hasPassword ? (
            <Field
              label={t('editProfile.password.current')}
              error={passwordErrors.currentPassword ?? null}
            >
              <PasswordInput
                value={currentPassword}
                onChangeText={(v) => {
                  setCurrentPassword(v);
                  setPasswordErrors({});
                  setPasswordDone(null);
                }}
                textContentType="password"
                autoComplete="current-password"
                invalid={passwordErrors.currentPassword !== undefined}
                accessibilityLabel={t('editProfile.password.current')}
                showLabel={t('auth.showPassword')}
                hideLabel={t('auth.hidePassword')}
                maxLength={128}
              />
            </Field>
          ) : null}
          <Field
            label={t('editProfile.password.new')}
            hint={t('auth.passwordHint')}
            error={newPasswordError}
          >
            <PasswordInput
              value={newPassword}
              onChangeText={(v) => {
                setNewPassword(v);
                setPasswordErrors({});
                setPasswordDone(null);
              }}
              textContentType="newPassword"
              autoComplete="new-password"
              invalid={newPasswordError !== null}
              accessibilityLabel={t('editProfile.password.new')}
              showLabel={t('auth.showPassword')}
              hideLabel={t('auth.hidePassword')}
              maxLength={128}
            />
          </Field>
          {passwordErrors.form ? (
            <Text style={styles.error} accessibilityRole="alert">
              {passwordErrors.form}
            </Text>
          ) : null}
          {passwordDone ? (
            <Text style={styles.success} accessibilityLiveRegion="polite">
              {passwordDone}
            </Text>
          ) : null}
          <Button
            label={hasPassword ? t('editProfile.password.change') : t('editProfile.password.set')}
            variant="outline"
            disabled={!canChangePassword}
            onPress={() => void changePassword()}
          />
        </Card>

        {/* Phone */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('editProfile.phone.title')}
          </Text>
          <Text style={styles.phone}>{profile.phoneE164}</Text>
          {profile.phoneVerified ? (
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle-outline" size={iconSize.md} color={colors.success} />
              <Text style={styles.verified}>{t('editProfile.phone.verified')}</Text>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <Text style={styles.unverified}>{t('profile.notVerified')} ·</Text>
              <Button
                label={t('profile.verify')}
                variant="text"
                fullWidth={false}
                onPress={() => router.push('/auth/code')}
                style={styles.inlineButton}
              />
            </View>
          )}
        </Card>
      </ScrollView>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetOpen(false)}
      >
        <View style={styles.sheetRoot}>
          {/* The backdrop and the card are siblings: no button inside a button. */}
          <Pressable
            style={styles.backdrop}
            accessibilityRole="button"
            accessibilityLabel={t('editProfile.cancel')}
            onPress={() => setSheetOpen(false)}
          />
          <View style={styles.sheet}>
            <Button
              label={t('editProfile.chooseFromLibrary')}
              variant="secondary"
              icon="images-outline"
              onPress={() => void pick('library')}
            />
            {Platform.OS === 'web' ? null : (
              <Button
                label={t('editProfile.takePhoto')}
                variant="secondary"
                icon="camera-outline"
                onPress={() => void pick('camera')}
              />
            )}
            {profile.photo ? (
              <Button
                label={t('editProfile.removePhoto')}
                variant="destructive"
                icon="trash-outline"
                onPress={() => void remove()}
              />
            ) : null}
            <Button
              label={t('editProfile.cancel')}
              variant="text"
              onPress={() => setSheetOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  headerTitle: { ...typography.heading, color: colors.text, flex: 1, textAlign: 'center' },
  headerSpacer: { width: layout.touchTarget, height: layout.touchTarget },
  state: { marginTop: space.xl },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  photoBlock: { alignItems: 'center', gap: space.sm },
  photoPress: { width: PHOTO, height: PHOTO, borderRadius: radius.pill },
  pressed: { opacity: 0.85 },
  photo: { width: PHOTO, height: PHOTO, borderRadius: radius.pill },
  initialsWell: {
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { ...typography.title, color: colors.primary },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: colors.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: BADGE,
    height: BADGE,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: space.md },
  sectionTitle: { ...typography.h3, color: colors.text },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.error, textAlign: 'center' },
  success: { ...typography.body, color: colors.success, fontWeight: fontWeight.medium },
  phone: { ...typography.bodyLg, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  verified: { ...typography.body, color: colors.success },
  unverified: { ...typography.body, color: colors.warning },
  inlineButton: { paddingHorizontal: space.xs },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlayDark,
  },
  sheet: {
    margin: space.lg,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...shadows.float,
  },
});
