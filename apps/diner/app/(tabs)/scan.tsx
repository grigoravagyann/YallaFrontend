import { MOCK_DEMO_TABLES, formatTableCode } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { openSettings } from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Screen, useNavClearance } from '../../src/components/Screen';
import { Text, TextInput } from '../../src/components/Text';
import { usingMockData } from '../../src/data/gateway';
import { useJoinByCode } from '../../src/hooks/useJoinByCode';
import {
  colors,
  fontWeight,
  layout,
  radius,
  space,
  tabularNumbers,
  typography,
} from '../../src/theme';

/**
 * Can this device scan at all?
 *
 * On the web build the camera needs a secure context, so the app served over
 * plain http on a LAN address — exactly how it is tested — can never scan. That
 * is not a permission problem and must not be presented as one.
 */
function cameraIsPossible(): boolean {
  if (Platform.OS !== 'web') return true;
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Scan — one tap from the tab bar, because someone sitting down with a coffee
 * should not have to hunt for it.
 *
 * Nothing on this screen asks who you are. Scanning needs no account, no phone
 * number and no password; that is the whole point of the flow, and any prompt
 * to register here would be the wrong screen.
 */
export default function ScanScreen() {
  const { t } = useTranslation('diner');
  const paddingBottom = useNavClearance();
  const [permission, requestPermission] = useCameraPermissions();
  const {
    submit,
    resumeAfterSignIn,
    failure,
    signInNeeded,
    confirmNumber,
    verifyNeeded,
    verifyNumber,
    clearFailure,
    isWorking,
  } = useJoinByCode();

  const [manualOpen, setManualOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [focused, setFocused] = useState(false);
  /** One decode is enough; the camera fires this many times a second. */
  const handled = useRef(false);

  // Mount the camera only while this tab is actually on screen. A camera left
  // running behind another tab keeps the indicator light on and drains the
  // battery of a phone that is about to be used all evening.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      handled.current = false;
      // Back from verifying a number: finish the booking code that needed it,
      // rather than making them find and retype it.
      resumeAfterSignIn();
      return () => setFocused(false);
    }, [resumeAfterSignIn]),
  );

  const possible = cameraIsPossible();
  const granted = permission?.granted === true;
  const permanentlyDenied = permission !== null && !permission.granted && !permission.canAskAgain;

  const onBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (handled.current || isWorking) return;
      handled.current = true;
      void submit(data).then((result) => {
        // Only a success leaves this screen; a failure has to allow another go.
        if (!result) handled.current = false;
      });
    },
    [submit, isWorking],
  );

  const submitTyped = useCallback(() => {
    void submit(typed);
  }, [submit, typed]);

  const showCamera = possible && granted && focused && !manualOpen;

  return (
    <Screen>
      <ScrollView
        // The floating nav owns the bottom of the screen; the viewfinder and
        // the last card end above it rather than under it.
        contentContainerStyle={[styles.body, { paddingBottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text display style={styles.title} accessibilityRole="header">
          {t('scan.title')}
        </Text>
        <Text style={styles.lead}>{t('scan.lead')}</Text>
        <Text style={styles.noAccount}>{t('scan.noAccount')}</Text>

        {showCamera ? (
          <View style={styles.viewfinder}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={isWorking ? undefined : onBarcode}
            />
            <View pointerEvents="none" style={styles.reticle} />
          </View>
        ) : null}

        {showCamera ? <Text style={styles.aiming}>{t('scan.aiming')}</Text> : null}

        {/* Explain before asking. A permission sheet that appears with no
            preceding sentence is the single most common reason someone denies
            a camera they would otherwise have allowed. */}
        {possible && !granted && !permanentlyDenied ? (
          <Card style={styles.card}>
            <Text style={styles.cardBody}>{t('scan.why')}</Text>
            <Button label={t('scan.allow')} onPress={() => void requestPermission()} />
          </Card>
        ) : null}

        {/* Denied is not a dead end: there is a printed code under every QR. */}
        {possible && permanentlyDenied ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('scan.deniedTitle')}</Text>
            <Text style={styles.cardBody}>{t('scan.deniedBody')}</Text>
            <Button
              label={t('scan.openSettings')}
              variant="secondary"
              onPress={() => void openSettings()}
            />
          </Card>
        ) : null}

        {!possible ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('scan.unavailableTitle')}</Text>
            <Text style={styles.cardBody}>{t('scan.unavailableBody')}</Text>
          </Card>
        ) : null}

        {/* Manual entry is always one tap away, not only after a denial. */}
        {manualOpen || !possible || permanentlyDenied ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('scan.manualTitle')}</Text>
            <Text style={styles.cardBody}>{t('scan.manualBody')}</Text>
            <TextInput
              style={styles.input}
              value={typed}
              onChangeText={(next) => {
                setTyped(next);
                clearFailure();
              }}
              placeholder={t('scan.manualPlaceholder')}
              placeholderTextColor={colors.textSubtle}
              // Not "characters": an invite token is case-sensitive, and a
              // table code is uppercased by the gateway whatever is typed.
              autoCapitalize="none"
              autoCorrect={false}
              // Room for a pasted invite link, not only a six-character code.
              maxLength={128}
              returnKeyType="go"
              onSubmitEditing={submitTyped}
              accessibilityLabel={t('scan.manualTitle')}
            />
            <Button label={t('scan.manualSubmit')} onPress={submitTyped} disabled={isWorking} />
          </Card>
        ) : (
          <Button
            label={t('scan.manualToggle')}
            variant="text"
            onPress={() => setManualOpen(true)}
            style={styles.manualToggle}
          />
        )}

        {isWorking ? (
          <View style={styles.working} accessibilityRole="progressbar">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.workingText}>{t('scan.working')}</Text>
          </View>
        ) : null}

        {failure ? (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{t(failure.key, failure.params ?? {})}</Text>
          </View>
        ) : null}

        {/* A booking code is the one code with an account behind it. The way to
            verification is offered here rather than taken automatically: what
            was typed may just as easily have been a mistyped table code, and
            this screen promises no sign-up and no phone number. */}
        {signInNeeded ? <Button label={t('scan.confirmNumber')} onPress={confirmNumber} /> : null}
        {verifyNeeded ? (
          <Button label={t('confirm.verifyMyNumber')} onPress={verifyNumber} />
        ) : null}

        <DemoCodes onPick={(code) => setTyped(code)} />
      </ScrollView>
    </Screen>
  );
}

/**
 * The codes needed to walk every scan outcome without a printer.
 *
 * Gated on `__DEV__` *and* on running against mock data, exactly as the SMS
 * code banner is. `__DEV__` is replaced with `false` by the production bundler
 * and this whole subtree is then dead code the minifier removes, so it is not
 * merely hidden in a release build — it is not in the bundle.
 */
function DemoCodes({ onPick }: { onPick: (code: string) => void }) {
  const { t } = useTranslation('diner');
  if (!__DEV__ || !usingMockData) return null;

  return (
    <View style={styles.dev}>
      <Text style={styles.devTitle}>{t('scan.dev.title')}</Text>
      {MOCK_DEMO_TABLES.map((demo) => (
        <Pressable
          key={demo.code}
          accessibilityRole="button"
          onPress={() => onPick(demo.code)}
          style={({ pressed }) => [styles.devRow, pressed && styles.devRowPressed]}
        >
          <Text style={styles.devCode}>{formatTableCode(demo.code)}</Text>
          <Text style={styles.devWhat}>{t(`scan.dev.outcome.${demo.outcome}`)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.screenPadding, paddingTop: space.lg, gap: space.sm },
  title: { ...typography.title, color: colors.text },
  lead: { ...typography.bodyLg, color: colors.textMuted },
  noAccount: {
    ...typography.body,
    fontWeight: fontWeight.medium,
    color: colors.successInk,
    marginBottom: space.sm,
  },
  viewfinder: {
    height: 320,
    borderRadius: radius.hero,
    overflow: 'hidden',
    backgroundColor: colors.surfaceDark,
  },
  reticle: {
    position: 'absolute',
    top: '18%',
    left: '14%',
    right: '14%',
    bottom: '18%',
    borderWidth: 3,
    borderColor: colors.onImage,
    borderRadius: radius.card,
  },
  aiming: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  card: { marginTop: space.sm, gap: space.md },
  cardTitle: { ...typography.h3, color: colors.text },
  cardBody: { ...typography.body, color: colors.textMuted },
  input: {
    minHeight: layout.controlHeight,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    ...typography.bodyLg,
    letterSpacing: 2,
  },
  manualToggle: { marginTop: space.sm },
  working: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  workingText: { ...typography.body, color: colors.textMuted },
  error: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.errorSoft,
  },
  errorText: { ...typography.body, color: colors.errorInk },
  dev: {
    marginTop: space.xl,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.warning,
    gap: space.xs,
  },
  devTitle: { ...typography.caption, fontWeight: fontWeight.bold, color: colors.warningInk },
  devRow: {
    minHeight: layout.touchTarget - 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.small,
  },
  devRowPressed: { backgroundColor: colors.warningSoft },
  devCode: {
    ...typography.body,
    ...tabularNumbers,
    fontWeight: fontWeight.bold,
    color: colors.text,
    letterSpacing: 1,
  },
  devWhat: { ...typography.caption, color: colors.textMuted },
});
