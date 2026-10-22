import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  Image,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RoomPhoto, TablePhotoMarker } from '../../places/model';
import { photoBox } from '../../places/rooms';
import { actionIcon, colors, radius, space, typography } from '../../theme';
import { IconButton } from '../IconButton';
import { PhotoImage } from '../PhotoImage';
import { Text } from '../Text';
import { TABLE_INFO_BAR_CLEARANCE, TableInfoBar } from './TableInfoBar';
import { TableLegend } from './TableLegend';
import { TableMarker, usePinRefusalText } from './TableMarker';

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.5;

/**
 * The frame's proportions. Every photo is drawn whole inside it, and its pins
 * on the box it is actually drawn in (`photoBox`), so a room photo of any shape
 * keeps its pins on its tables.
 */
export const TABLE_PHOTO_ASPECT = 4 / 3;

/** A finger that moves this far is dragging the photo, not tapping a table. */
const DRAG_THRESHOLD = 6;

export interface TablePhotoViewProps {
  /** One photo of a room, with the tables pinned on it. */
  readonly photo: RoomPhoto;
  readonly selectedTableId: string | null;
  /** `null` when the diner taps the photo away from any table. */
  readonly onSelect: (tableId: string | null) => void;
  /**
   * Book a free table from the info bar. Without it there is no info bar: the
   * screen acts on the selection itself.
   */
  readonly onBook?: ((table: TablePhotoMarker) => void) | undefined;
  /**
   * False where the venue takes no app bookings: the info bar still shows the
   * selected table and says so, with no Book on it.
   */
  readonly canBook?: boolean | undefined;
  /**
   * The party being booked for: a pin the slot will not give it cannot be
   * picked, and says why. Without it every pin can be tapped.
   */
  readonly partySize?: number | undefined;
  /** Told whenever the zoom leaves or returns to 1×, so a pager can stop swiping. */
  readonly onZoomedChange?: ((zoomed: boolean) => void) | undefined;
  /**
   * The larger view inside the fullscreen modal: no expand button, no corner
   * radius, and the Book press closes the modal first.
   */
  readonly fullscreen?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/** How far the zoomed photo may be dragged before its edge shows. */
function panBounds(zoom: number, frame: { width: number; height: number }) {
  return {
    x: Math.max(0, ((zoom - 1) * frame.width) / 2),
    y: Math.max(0, ((zoom - 1) * frame.height) / 2),
  };
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

type Size = { width: number; height: number };

/**
 * The photo's size: stored with it, or measured for one stored before sizes
 * were — asked of the image first and, should that fail, read off the photo
 * as it loads. `size` is `null` until known; `unknown` once neither way gave
 * one, so the frame can say why it has no pins.
 */
function usePhotoSize(photo: RoomPhoto): {
  size: Size | null;
  unknown: boolean;
  onLoad: (size: Size | null) => void;
} {
  const stored = photo.width && photo.height ? { width: photo.width, height: photo.height } : null;
  // Each keyed by the url it is about, so a recycled view starts over.
  const [measured, setMeasured] = useState<{ url: string; size: Size | null } | null>(null);
  const [loaded, setLoaded] = useState<{ url: string; size: Size | null } | null>(null);
  useEffect(() => {
    if (stored) return;
    let live = true;
    Image.getSize(
      photo.url,
      (width, height) => {
        if (live) setMeasured({ url: photo.url, size: { width, height } });
      },
      () => {
        if (live) setMeasured({ url: photo.url, size: null });
      },
    );
    return () => {
      live = false;
    };
    // `stored` is derived from these two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.url, photo.width, photo.height]);
  const url = photo.url;
  // The same answer again keeps the same state: a load must not re-render for nothing.
  const onLoad = useCallback(
    (size: Size | null) =>
      setLoaded((current) =>
        current?.url === url &&
        current.size?.width === size?.width &&
        current.size?.height === size?.height
          ? current
          : { url, size },
      ),
    [url],
  );

  const asked = measured?.url === url ? measured : null;
  const seen = loaded?.url === url ? loaded : null;
  const size = stored ?? asked?.size ?? seen?.size ?? null;
  return { size, unknown: !size && asked !== null && seen !== null, onLoad };
}

/**
 * A room photo with the live table pins on it.
 *
 * Zoom is the +/- pair bottom-right (1× to 3× in half steps) and scales the
 * photo and its markers together, so a marker never drifts off its table. Once
 * zoomed, the photo drags: a finger moving more than a few points pans it,
 * clamped so the frame is never empty, while a still finger on a marker is a
 * tap. The expand button opens the same view in a fullscreen modal; a selected
 * table slides the dark info bar over the bottom edge.
 */
export function TablePhotoView({
  photo,
  selectedTableId,
  onSelect,
  onBook,
  canBook = true,
  partySize,
  onZoomedChange,
  fullscreen = false,
  style,
}: TablePhotoViewProps) {
  const { t } = useTranslation('diner');
  const tables = photo.tables;
  const photoSize = usePhotoSize(photo);
  const box = photoBox(photoSize.size, TABLE_PHOTO_ASPECT);
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [scale] = useState(() => new Animated.Value(ZOOM_MIN));
  const [pan] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [expanded, setExpanded] = useState(false);

  // Where the photo currently sits, in JS, so a new drag starts from it and a
  // zoom-out can pull it back inside the bounds.
  const offset = useRef({ x: 0, y: 0 });
  const frame = useRef({ width: 0, height: 0 });
  const zoomRef = useRef(ZOOM_MIN);
  // What the pager was last told: only a change is reported, so a page that
  // mounts at 1× says nothing, and one unmounted while zoomed says it is not.
  const reportedZoomed = useRef(false);
  useEffect(() => {
    zoomRef.current = zoom;
    const zoomed = zoom > ZOOM_MIN;
    if (zoomed === reportedZoomed.current) return;
    reportedZoomed.current = zoomed;
    onZoomedChange?.(zoomed);
  }, [zoom, onZoomedChange]);
  const onZoomedChangeRef = useRef(onZoomedChange);
  useEffect(() => {
    onZoomedChangeRef.current = onZoomedChange;
  }, [onZoomedChange]);
  useEffect(
    () => () => {
      if (reportedZoomed.current) onZoomedChangeRef.current?.(false);
    },
    [],
  );

  const settle = useCallback(
    (next: { x: number; y: number }, animated: boolean) => {
      offset.current = next;
      if (!animated) {
        pan.setValue(next);
        return;
      }
      Animated.spring(pan, {
        toValue: next,
        bounciness: 2,
        speed: 16,
        useNativeDriver: true,
      }).start();
    },
    [pan],
  );

  useEffect(() => {
    Animated.spring(scale, {
      toValue: zoom,
      bounciness: 2,
      speed: 16,
      useNativeDriver: true,
    }).start();
    // Zooming out shrinks the room to move in; pull the photo back inside it.
    const bounds = panBounds(zoom, frame.current);
    settle({ x: clamp(offset.current.x, bounds.x), y: clamp(offset.current.y, bounds.y) }, true);
  }, [scale, zoom, settle]);

  const onFrameLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    frame.current = { width, height };
  }, []);

  // Taps fall through to the markers and the photo; only a real drag, and
  // only once zoomed, is taken.
  const shouldPan = useCallback(
    (_: unknown, gesture: PanResponderGestureState) =>
      zoomRef.current > ZOOM_MIN &&
      (Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD),
    [],
  );
  const dragged = useCallback((gesture: PanResponderGestureState) => {
    const bounds = panBounds(zoomRef.current, frame.current);
    return {
      x: clamp(offset.current.x + gesture.dx, bounds.x),
      y: clamp(offset.current.y + gesture.dy, bounds.y),
    };
  }, []);
  const onMove = useCallback(
    (_: unknown, gesture: PanResponderGestureState) => pan.setValue(dragged(gesture)),
    [pan, dragged],
  );
  const onRelease = useCallback(
    (_: unknown, gesture: PanResponderGestureState) => {
      offset.current = dragged(gesture);
      pan.setValue(offset.current);
    },
    [pan, dragged],
  );
  const responder = useMemo(
    () =>
      // `create` only stores the handlers; they read the refs when a finger
      // moves, never during render — which is the case the rule guards against.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onMoveShouldSetPanResponder: shouldPan,
        onPanResponderMove: onMove,
        onPanResponderRelease: onRelease,
        onPanResponderTerminationRequest: () => false,
      }),
    [shouldPan, onMove, onRelease],
  );

  const zoomBy = useCallback((delta: number) => {
    setZoom((current) =>
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((current + delta) * 10) / 10)),
    );
  }, []);

  const selected = tables.find((table) => table.tableId === selectedTableId) ?? null;

  // Why the pin just tapped cannot be had, on the photo itself: a sighted
  // diner gets the same reason the screen reader says (QA 20261016T2 B3).
  const refusalText = usePinRefusalText();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleMarker = useCallback(
    (table: TablePhotoMarker) => {
      const refused = refusalText(table, partySize);
      // Not this party's table: nothing to pick, but say why.
      if (refused) {
        setNotice(refused);
        return;
      }
      setNotice(null);
      onSelect(table.tableId === selectedTableId ? null : table.tableId);
    },
    [onSelect, selectedTableId, partySize, refusalText],
  );

  const handleBook = useCallback(
    (table: TablePhotoMarker) => {
      setExpanded(false);
      onBook?.(table);
    },
    [onBook],
  );

  const controlsBottom = selected && onBook ? TABLE_INFO_BAR_CLEARANCE + space.md : space.md;
  const transform = [{ translateX: pan.x }, { translateY: pan.y }, { scale }];

  return (
    <>
      <View
        onLayout={onFrameLayout}
        style={[styles.frame, fullscreen && styles.frameFull, style]}
        {...responder.panHandlers}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { transform }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('tables.photo')}
            accessibilityHint={t('tables.clearSelection')}
            onPress={() => {
              setNotice(null);
              onSelect(null);
            }}
            style={StyleSheet.absoluteFill}
          >
            <PhotoImage
              source={photo.url}
              resizeMode="contain"
              onLoad={photoSize.onLoad}
              style={[StyleSheet.absoluteFill, styles.photo]}
            />
          </Pressable>
        </Animated.View>

        {fullscreen ? null : (
          <IconButton
            icon={actionIcon.expand}
            accessibilityLabel={t('tables.fullscreen')}
            variant="translucent"
            size="sm"
            onPress={() => setExpanded(true)}
            style={styles.expand}
          />
        )}

        <View style={[styles.zoom, { bottom: controlsBottom }]}>
          <IconButton
            icon={actionIcon.zoomIn}
            accessibilityLabel={t('tables.zoomIn')}
            variant="translucent"
            size="sm"
            disabled={zoom >= ZOOM_MAX}
            onPress={() => zoomBy(ZOOM_STEP)}
          />
          <IconButton
            icon={actionIcon.zoomOut}
            accessibilityLabel={t('tables.zoomOut')}
            variant="translucent"
            size="sm"
            disabled={zoom <= ZOOM_MIN}
            onPress={() => zoomBy(-ZOOM_STEP)}
          />
        </View>

        {/*
          The pins on their own layer, moved with the photo and drawn over the
          buttons: a table by the right edge, or one panned under the zoom
          pair, is still the thing a finger lands on (QA 20261016T2 B6).
        */}
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transform }]}>
          {box ? (
            // The box the photo is drawn in: pins at fractions of the photo,
            // never of the frame and its bars.
            <View
              pointerEvents="box-none"
              style={[
                styles.box,
                {
                  left: `${box.left}%`,
                  top: `${box.top}%`,
                  width: `${box.width}%`,
                  height: `${box.height}%`,
                },
              ]}
            >
              {tables.map((table) => (
                <TableMarker
                  key={table.tableId}
                  table={table}
                  selected={table.tableId === selectedTableId}
                  onPress={handleMarker}
                  partySize={partySize}
                />
              ))}
            </View>
          ) : null}
        </Animated.View>

        {photoSize.unknown ? (
          // No size, no honest place for a pin: say so rather than show a
          // room with no tables in it.
          <View pointerEvents="none" style={styles.unmeasured}>
            <Text style={styles.unmeasuredText}>{t('tables.unmeasured')}</Text>
          </View>
        ) : notice ? (
          <View pointerEvents="none" style={[styles.unmeasured, { bottom: controlsBottom }]}>
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.unmeasuredText}
            >
              {notice}
            </Text>
          </View>
        ) : null}

        {onBook ? (
          <TableInfoBar
            table={selected}
            photo={photo.thumbUrl}
            onBook={handleBook}
            canBook={canBook}
          />
        ) : null}
      </View>

      {fullscreen ? null : (
        <FullscreenTables
          visible={expanded}
          onClose={() => setExpanded(false)}
          photo={photo}
          selectedTableId={selectedTableId}
          onSelect={onSelect}
          onBook={onBook ? handleBook : undefined}
          canBook={canBook}
          partySize={partySize}
        />
      )}
    </>
  );
}

interface FullscreenTablesProps extends Omit<
  TablePhotoViewProps,
  'fullscreen' | 'style' | 'onZoomedChange'
> {
  readonly visible: boolean;
  readonly onClose: () => void;
}

/** The same view, as large as the screen allows, on a dark ground. */
function FullscreenTables({ visible, onClose, ...view }: FullscreenTablesProps) {
  const { t } = useTranslation('diner');
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // As wide as the screen, unless 4:3 of that would not fit between the bars.
  const maxHeight = height - insets.top - insets.bottom - FULLSCREEN_CHROME;
  const frameWidth = Math.min(width, Math.floor(maxHeight * TABLE_PHOTO_ASPECT));

  return (
    <>
      {/* Light on the dark ground while the modal is up; the stack hands the
          bar back to the screen underneath when it closes. Mounted beside the
          modal rather than in it, so the style is set as the modal opens. */}
      {visible ? <StatusBar style="light" /> : null}
      <Modal
        visible={visible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onClose}
        presentationStyle="fullScreen"
      >
        <View style={[styles.modal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.modalHeader}>
            <Text numberOfLines={1} style={styles.modalTitle}>
              {t('tables.title')}
            </Text>
            <IconButton
              icon={actionIcon.close}
              accessibilityLabel={t('tables.close')}
              variant="translucent"
              onPress={onClose}
            />
          </View>
          <View style={styles.modalBody}>
            <TablePhotoView {...view} fullscreen style={{ width: frameWidth }} />
          </View>
          <TableLegend tone="dark" style={styles.modalLegend} />
        </View>
      </Modal>
    </>
  );
}

/** How long the line saying why a pin cannot be picked stays up. */
const NOTICE_MS = 4000;

/** Keeps the "can't show tables" line clear of the zoom buttons. */
const UNMEASURED_CLEARANCE = 48;

/** Header row + legend row inside the fullscreen modal. */
const FULLSCREEN_CHROME = 120;

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: TABLE_PHOTO_ASPECT,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.skeleton,
  },
  frameFull: { borderRadius: 0, backgroundColor: colors.surfaceDark },
  photo: { backgroundColor: 'transparent' },
  box: { position: 'absolute' },
  expand: { position: 'absolute', top: space.md, right: space.md },
  zoom: { position: 'absolute', right: space.md, gap: space.sm },
  // Bottom-left: the counter has the top-left corner, the zoom pair the right.
  unmeasured: {
    position: 'absolute',
    bottom: space.md,
    left: space.md,
    right: space.md + UNMEASURED_CLEARANCE,
    alignItems: 'flex-start',
  },
  unmeasuredText: {
    ...typography.caption,
    color: colors.onImage,
    backgroundColor: colors.glass,
    borderRadius: radius.small,
    overflow: 'hidden',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  modal: { flex: 1, backgroundColor: colors.surfaceDark },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  modalTitle: { ...typography.h3, color: colors.onImage, flexShrink: 1 },
  modalBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalLegend: { justifyContent: 'center', paddingHorizontal: space.lg, paddingVertical: space.md },
});
