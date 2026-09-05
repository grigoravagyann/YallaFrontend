import { MOCK_DEMO_TABLES, formatTableCode } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { openSettings } from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput } from '../../src/components/Text';
import { usingMockData } from '../../src/data/gateway';
import { useJoinByCode } from '../../src/hooks/useJoinByCode';

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
  const [permission, requestPermission] = useCameraPermissions();
  const { submit, failure, clearFailure, isWorking } = useJoinByCode();

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
      return () => setFocused(false);
    }, []),
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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.title}>{t('scan.title')}</Text>
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
          <View style={styles.card}>
            <Text style={styles.cardBody}>{t('scan.why')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void requestPermission()}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>{t('scan.allow')}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Denied is not a dead end: there is a printed code under every QR. */}
        {possible && permanentlyDenied ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('scan.deniedTitle')}</Text>
            <Text style={styles.cardBody}>{t('scan.deniedBody')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void openSettings()}
              style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>{t('scan.openSettings')}</Text>
            </Pressable>
          </View>
        ) : null}

        {!possible ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('scan.unavailableTitle')}</Text>
            <Text style={styles.cardBody}>{t('scan.unavailableBody')}</Text>
          </View>
        ) : null}

        {/* Manual entry is always one tap away, not only after a denial. */}
        {manualOpen || !possible || permanentlyDenied ? (
          <View style={styles.card}>
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
              placeholderTextColor={color.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={16}
              returnKeyType="go"
              onSubmitEditing={submitTyped}
              accessibilityLabel={t('scan.manualTitle')}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isWorking, busy: isWorking }}
              disabled={isWorking}
              onPress={submitTyped}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.primaryPressed,
                isWorking && styles.disabled,
              ]}
            >
              <Text style={styles.primaryText}>{t('scan.manualSubmit')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setManualOpen(true)}
            style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
          >
            <Text style={styles.linkText}>{t('scan.manualToggle')}</Text>
          </Pressable>
        )}

        {isWorking ? (
          <View style={styles.working}>
            <ActivityIndicator color={color.primary} />
            <Text style={styles.workingText}>{t('scan.working')}</Text>
          </View>
        ) : null}

        {failure ? <Text style={styles.error}>{t(failure.key, failure.params ?? {})}</Text> : null}

        <DemoCodes onPick={(code) => setTyped(code)} />
      </ScrollView>
    </SafeAreaView>
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
          style={styles.devRow}
        >
          <Text style={styles.devCode}>{formatTableCode(demo.code)}</Text>
          <Text style={styles.devWhat}>{t(`scan.dev.outcome.${demo.outcome}`)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  body: { padding: space.lg, paddingBottom: space.xxxl, gap: space.sm },
  title: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  lead: { fontSize: fontSize.md, lineHeight: lineHeight.md, color: color.mutedForeground },
  noAccount: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.success,
    fontWeight: fontWeight.medium,
    marginBottom: space.sm,
  },
  viewfinder: {
    height: 320,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: color.foreground,
  },
  reticle: {
    position: 'absolute',
    top: '18%',
    left: '14%',
    right: '14%',
    bottom: '18%',
    borderWidth: 3,
    borderColor: color.primaryForeground,
    borderRadius: radius.card,
  },
  aiming: { fontSize: fontSize.sm, color: color.mutedForeground, textAlign: 'center' },
  card: {
    marginTop: space.sm,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
  cardBody: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  input: {
    minHeight: touchTarget.minimum,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.paper,
    color: color.foreground,
    fontSize: fontSize.lg,
    letterSpacing: 2,
  },
  primary: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  primaryPressed: { backgroundColor: color.primaryPressed },
  primaryText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.primaryForeground,
  },
  secondary: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
  },
  secondaryPressed: { backgroundColor: color.greenTint },
  secondaryText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.foreground },
  disabled: { opacity: 0.6 },
  linkRow: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: space.sm,
  },
  linkRowPressed: { opacity: 0.6 },
  linkText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.primaryPressed },
  working: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  workingText: { fontSize: fontSize.sm, color: color.mutedForeground },
  error: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.danger,
  },
  dev: {
    marginTop: space.xl,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.warning,
    gap: space.xs,
  },
  devTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: color.warning },
  devRow: {
    minHeight: touchTarget.minimum - 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  devCode: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: color.foreground,
    letterSpacing: 1,
  },
  devWhat: { fontSize: fontSize.xs, color: color.mutedForeground },
});
