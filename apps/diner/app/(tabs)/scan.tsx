import { Ionicons } from '@expo/vector-icons';
import { MOCK_DEMO_TABLES, formatTableCode, resetBrowserMockWorlds } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { openSettings } from 'expo-linking';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { IconButton } from '../../src/components/IconButton';
import { SheetModal } from '../../src/components/motion/SheetModal';
import { usePressScale } from '../../src/components/motion/usePressScale';
import { useNavClearance } from '../../src/components/Screen';
import { Text, TextInput } from '../../src/components/Text';
import { usingMockData } from '../../src/data/gateway';
import { useJoinByCode } from '../../src/hooks/useJoinByCode';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  tabularNumbers,
  typography,
} from '../../src/theme';

/** The viewfinder: a square a table card fits in at arm's length. */
const FRAME = 240;
const FRAME_RADIUS = 26;
const CORNER = 34;
const CORNER_WIDTH = 3;
/** One sweep of the scan line, top to bottom; the way back takes as long. */
const SWEEP_MS = 1200;
/** Room kept for the two lines under the frame. */
const CAPTION_HEIGHT = 64;
/** Fewer characters than this is never a code, so "Join" stays dim until then. */
const MIN_CODE_LENGTH = 4;
/** The manual code field: taller than a form field, it is the whole sheet. */
const CODE_FIELD_HEIGHT = 60;

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
 * How much of the bottom of the screen the iOS keyboard covers. Android
 * resizes a modal's window for the keyboard by itself, so there it stays 0.
 */
function useKeyboardInset(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Scan — one tap from the tab bar, because someone sitting down with a coffee
 * should not have to hunt for it.
 *
 * Nothing on this screen asks who you are. Scanning needs no account, no phone
 * number and no password; that is the whole point of the flow, and any prompt
 * to register here would be the wrong screen.
 *
 * A dark stage: the camera full-bleed, darkened everywhere but the square the
 * code goes in, and a line sweeping that square while it looks. Typing the code
 * is one press away at the bottom, in a sheet — for a camera that is off,
 * denied, or simply not there.
 */
export default function ScanScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Clear of the floating nav and of the Scan button rising out of it.
  const bottomInset = useNavClearance() + space.lg;
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
  const [torch, setTorch] = useState(false);
  // The torch is for this visit: leaving the tab turns it off, so coming back
  // does not light the room before anyone asked. A navigation event rather
  // than the focus effect's cleanup, which also runs on unrelated re-renders.
  const navigation = useNavigation();
  useEffect(() => navigation.addListener('blur', () => setTorch(false)), [navigation]);
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null);
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
    void submit(typed).then((result) => {
      if (result) setManualOpen(false);
    });
  }, [submit, typed]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.navigate('/');
  }, [router]);

  const framed = possible && granted;
  const showCamera = framed && focused && !manualOpen;
  const noCamera = !possible || permanentlyDenied;
  const saidSomething = isWorking || failure !== null || signInNeeded || verifyNeeded;

  // Where the frame sits: centred in what the top row and the bottom button
  // leave of the stage, with its caption under it.
  const topEdge = insets.top + space.xl + layout.touchTarget;
  const bottomEdge = stage ? stage.height - bottomInset - layout.controlHeightLarge - space.lg : 0;
  const frameTop = stage
    ? topEdge + Math.max(space.lg, (bottomEdge - topEdge - FRAME - space.xxl - CAPTION_HEIGHT) / 2)
    : 0;
  const frameLeft = stage ? (stage.width - FRAME) / 2 : 0;

  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage((prev) =>
      prev?.width === width && prev.height === height ? prev : { width, height },
    );
  }, []);

  const outcome = (
    <Outcome
      isWorking={isWorking}
      failureText={failure ? t(failure.key, failure.params ?? {}) : null}
      signInNeeded={signInNeeded}
      verifyNeeded={verifyNeeded}
      onConfirmNumber={confirmNumber}
      onVerifyNumber={verifyNumber}
    />
  );

  return (
    <View style={styles.stage} onLayout={onStageLayout}>
      {showCamera ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={isWorking ? undefined : onBarcode}
        />
      ) : null}

      {framed && stage ? (
        <>
          {/* The dark outside, in four bands round the frame: a hole cut in
              one view is not something every platform draws. */}
          <View
            pointerEvents="none"
            style={[styles.shade, { top: 0, left: 0, right: 0, height: frameTop }]}
          />
          <View
            pointerEvents="none"
            style={[styles.shade, { top: frameTop + FRAME, left: 0, right: 0, bottom: 0 }]}
          />
          <View
            pointerEvents="none"
            style={[styles.shade, { top: frameTop, height: FRAME, left: 0, width: frameLeft }]}
          />
          <View
            pointerEvents="none"
            style={[styles.shade, { top: frameTop, height: FRAME, right: 0, width: frameLeft }]}
          />
          <Viewfinder top={frameTop} left={frameLeft} sweeping={showCamera} />
          {saidSomething ? null : (
            <View
              pointerEvents="none"
              style={[styles.caption, { top: frameTop + FRAME + space.xxl }]}
            >
              <Text style={styles.aiming}>{t('scan.aiming')}</Text>
              <Text style={styles.aimingHint}>{t('scan.lead')}</Text>
            </View>
          )}
        </>
      ) : null}

      {/* No camera to show: the reason, in the middle of the stage. */}
      {!framed && stage ? (
        <View
          style={[
            styles.stateWrap,
            {
              top: topEdge + space.lg,
              bottom: bottomInset + layout.controlHeightLarge + space.lg,
            },
          ]}
        >
          <CameraState
            possible={possible}
            permanentlyDenied={permanentlyDenied}
            asking={permission === null}
            onAllow={() => void requestPermission()}
          />
        </View>
      ) : null}

      <View style={[styles.topRow, { top: insets.top + space.xl }]}>
        <IconButton
          icon={actionIcon.close}
          accessibilityLabel={t('action.close', { ns: 'common' })}
          variant="translucent"
          onPress={close}
        />
        <Text display style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {t('scan.title')}
        </Text>
        {showCamera ? (
          <TorchToggle on={torch} label={t('scan.torch')} onToggle={() => setTorch((v) => !v)} />
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>

      <View style={[styles.bottom, { bottom: bottomInset }]}>
        {manualOpen ? null : outcome}
        {/* Manual entry is always one press away, not only after a denial —
            and with no camera it is the way in, so it is the brand fill. */}
        <Button
          label={t('scan.manualToggle')}
          icon="keypad-outline"
          size="large"
          variant={noCamera ? 'primary' : 'secondary'}
          onPress={() => {
            clearFailure();
            setManualOpen(true);
          }}
        />
      </View>

      {/* A sheet is a window over the whole app: it must not follow the diner
          to the screen a code sent them to, so it shows only on this tab. */}
      <ManualEntrySheet
        visible={manualOpen && focused}
        typed={typed}
        onType={(next) => {
          setTyped(next);
          clearFailure();
        }}
        onSubmit={submitTyped}
        onClose={() => setManualOpen(false)}
        isWorking={isWorking}
        outcome={manualOpen ? outcome : null}
      />
    </View>
  );
}

/** The square the code goes in: four cream corners and, while looking, a sweeping amber line. */
function Viewfinder({
  top,
  left,
  sweeping,
}: {
  readonly top: number;
  readonly left: number;
  readonly sweeping: boolean;
}) {
  const reduced = useReducedMotion();
  const [sweep] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    // Asked for less motion: the line holds still across the middle.
    if (!sweeping || reduced) {
      sweep.setValue(0.5);
      return;
    }
    sweep.setValue(0);
    const ease = Easing.inOut(Easing.ease);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: SWEEP_MS,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: SWEEP_MS,
          easing: ease,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweeping, reduced, sweep]);

  const translateY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [FRAME * 0.06, FRAME * 0.92],
  });

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { top, left }]}
    >
      <View style={[styles.corner, styles.cornerTopLeft]} />
      <View style={[styles.corner, styles.cornerTopRight]} />
      <View style={[styles.corner, styles.cornerBottomLeft]} />
      <View style={[styles.corner, styles.cornerBottomRight]} />
      {sweeping ? (
        <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
      ) : null}
    </View>
  );
}

/** The torch, as a toggle that says whether it is on. */
function TorchToggle({
  on,
  label,
  onToggle,
}: {
  readonly on: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}) {
  const press = usePressScale();
  // `aria-pressed` is what a browser reads on a toggle button. React Native
  // has no such prop; "selected" is what VoiceOver and TalkBack say instead.
  const toggleState: object =
    Platform.OS === 'web' ? { 'aria-pressed': on } : { accessibilityState: { selected: on } };
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        {...toggleState}
        onPress={onToggle}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.round, on ? styles.torchOn : styles.torchOff]}
      >
        <Ionicons
          name="flashlight-outline"
          size={iconSize.md}
          color={on ? colors.onFill : colors.onImage}
        />
      </Pressable>
    </Animated.View>
  );
}

/** Why there is no viewfinder, and what to do about it. */
function CameraState({
  possible,
  permanentlyDenied,
  asking,
  onAllow,
}: {
  readonly possible: boolean;
  readonly permanentlyDenied: boolean;
  readonly asking: boolean;
  readonly onAllow: () => void;
}) {
  const { t } = useTranslation('diner');

  if (!possible) {
    return (
      <View style={styles.stateCard}>
        <Ionicons name="camera-outline" size={iconSize.xl} color={colors.primary} />
        <Text style={styles.stateTitle}>{t('scan.unavailableTitle')}</Text>
        <Text style={styles.stateBody}>{t('scan.unavailableBody')}</Text>
      </View>
    );
  }

  // Denied is not a dead end: there is a printed code under every QR.
  if (permanentlyDenied) {
    return (
      <View style={styles.stateCard}>
        <Ionicons name="camera-outline" size={iconSize.xl} color={colors.primary} />
        <Text style={styles.stateTitle}>{t('scan.deniedTitle')}</Text>
        <Text style={styles.stateBody}>{t('scan.deniedBody')}</Text>
        <Button
          label={t('scan.openSettings')}
          variant="secondary"
          fullWidth={false}
          onPress={() => void openSettings()}
          style={styles.stateAction}
        />
      </View>
    );
  }

  // Still finding out what the phone allows: nothing to explain yet.
  if (asking) return <ActivityIndicator color={colors.primary} />;

  // Explain before asking. A permission sheet that appears with no preceding
  // sentence is the single most common reason someone denies a camera they
  // would otherwise have allowed.
  return (
    <View style={styles.stateCard}>
      <Ionicons name="scan-outline" size={iconSize.xl} color={colors.primary} />
      <Text style={styles.stateBody}>{t('scan.why')}</Text>
      <Button label={t('scan.allow')} onPress={onAllow} style={styles.stateAction} />
    </View>
  );
}

/** What the last code did: still working, refused, or waiting on a verified number. */
function Outcome({
  isWorking,
  failureText,
  signInNeeded,
  verifyNeeded,
  onConfirmNumber,
  onVerifyNumber,
}: {
  readonly isWorking: boolean;
  readonly failureText: string | null;
  readonly signInNeeded: boolean;
  readonly verifyNeeded: boolean;
  readonly onConfirmNumber: () => void;
  readonly onVerifyNumber: () => void;
}) {
  const { t } = useTranslation('diner');
  return (
    <>
      {isWorking ? (
        <View style={styles.working} accessibilityRole="progressbar">
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.workingText}>{t('scan.working')}</Text>
        </View>
      ) : null}

      {failureText ? (
        <View style={styles.error} accessibilityRole="alert">
          <Text style={styles.errorText}>{failureText}</Text>
        </View>
      ) : null}

      {/* A booking code is the one code with an account behind it. The way to
          verification is offered here rather than taken automatically: what
          was typed may just as easily have been a mistyped table code, and
          this screen promises no sign-up and no phone number. */}
      {signInNeeded ? <Button label={t('scan.confirmNumber')} onPress={onConfirmNumber} /> : null}
      {verifyNeeded ? (
        <Button label={t('confirm.verifyMyNumber')} onPress={onVerifyNumber} />
      ) : null}
    </>
  );
}

/** Typing the code: the one under the QR, a booking code, or a host's link. */
function ManualEntrySheet({
  visible,
  typed,
  onType,
  onSubmit,
  onClose,
  isWorking,
  outcome,
}: {
  readonly visible: boolean;
  readonly typed: string;
  readonly onType: (next: string) => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
  readonly isWorking: boolean;
  readonly outcome: ReactNode;
}) {
  const { t } = useTranslation('diner');
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const ready = typed.trim().length >= MIN_CODE_LENGTH;
  const closeLabel = t('action.close', { ns: 'common' });

  return (
    <SheetModal
      visible={visible}
      onRequestClose={onClose}
      closeLabel={closeLabel}
      accessibilityLabel={t('scan.manualTitle')}
      style={styles.sheet}
    >
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sheetHead}>
          <Text display style={styles.sheetTitle} accessibilityRole="header">
            {t('scan.manualTitle')}
          </Text>
          <IconButton
            icon={actionIcon.close}
            accessibilityLabel={closeLabel}
            variant="ghost"
            onPress={onClose}
          />
        </View>
        <Text style={styles.sheetLabel}>{t('scan.manualBody')}</Text>
        <TextInput
          style={styles.codeInput}
          value={typed}
          onChangeText={onType}
          placeholder={t('scan.manualPlaceholder')}
          placeholderTextColor={colors.textSubtle}
          // Not "characters": an invite token is case-sensitive, and a table
          // code is uppercased by the gateway whatever is typed.
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          autoFocus
          // Room for a pasted invite link, not only a six-character code.
          maxLength={128}
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          accessibilityLabel={t('scan.manualTitle')}
        />
        {outcome}
        <Button
          label={t('scan.manualSubmit')}
          size="large"
          onPress={onSubmit}
          disabled={isWorking || !ready}
          busy={isWorking}
        />
        <DemoCodes onPick={onType} />
      </ScrollView>
      {keyboard > 0 ? <View style={{ height: Math.max(0, keyboard - insets.bottom) }} /> : null}
    </SheetModal>
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
      {typeof window !== 'undefined' && typeof document !== 'undefined' ? (
        // The web build keeps the mock world across a reload (QA F2); this
        // forgets it and starts from the fixture.
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            resetBrowserMockWorlds();
            window.location.reload();
          }}
          style={({ pressed }) => [styles.devRow, pressed && styles.devRowPressed]}
        >
          <Text style={styles.devWhat}>{t('scan.dev.reset')}</Text>
        </Pressable>
      ) : null}
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
  stage: { flex: 1, backgroundColor: colors.surfaceDark, overflow: 'hidden' },
  shade: { position: 'absolute', backgroundColor: colors.overlayDark },
  frame: { position: 'absolute', width: FRAME, height: FRAME },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: colors.onPrimary,
  },
  cornerTopLeft: {
    top: -2,
    left: -2,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: FRAME_RADIUS,
  },
  cornerTopRight: {
    top: -2,
    right: -2,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: FRAME_RADIUS,
  },
  cornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: FRAME_RADIUS,
  },
  cornerBottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: FRAME_RADIUS,
  },
  scanLine: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  caption: {
    position: 'absolute',
    left: space.xxl,
    right: space.xxl,
    alignItems: 'center',
    gap: space.xs + 2,
  },
  aiming: {
    ...typography.bodyLg,
    fontWeight: fontWeight.medium,
    color: colors.text,
    textAlign: 'center',
  },
  aimingHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  stateWrap: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stateCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.hero,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stateTitle: { ...typography.h3, color: colors.text, textAlign: 'center' },
  stateBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  stateAction: { alignSelf: 'center', marginTop: space.xs },
  topRow: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
  },
  title: { ...typography.h3, color: colors.text, flex: 1, textAlign: 'center' },
  topSpacer: { width: layout.touchTarget, height: layout.touchTarget },
  round: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchOff: { backgroundColor: colors.glass },
  torchOn: { backgroundColor: colors.text },
  bottom: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    gap: space.sm + 2,
    paddingBottom: space.sm,
  },
  working: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  workingText: { ...typography.body, color: colors.textMuted },
  error: {
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.errorSoft,
  },
  errorText: { ...typography.body, color: colors.errorInk },
  sheet: { maxHeight: '88%' },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetBody: { gap: space.md + 2 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...typography.h3, color: colors.text, flex: 1 },
  sheetLabel: { ...typography.caption, color: colors.textMuted },
  codeInput: {
    minHeight: CODE_FIELD_HEIGHT,
    paddingHorizontal: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    ...typography.h3,
    letterSpacing: 1,
    textAlign: 'center',
  },
  dev: {
    marginTop: space.sm,
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
