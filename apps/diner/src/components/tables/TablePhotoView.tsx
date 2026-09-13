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
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TablePhotoMarker } from '../../places/model';
import { actionIcon, colors, radius, space, typography } from '../../theme';
import { IconButton } from '../IconButton';
import { PhotoImage } from '../PhotoImage';
import { Text } from '../Text';
import { TABLE_INFO_BAR_CLEARANCE, TableInfoBar } from './TableInfoBar';
import { TableLegend } from './TableLegend';
import { TableMarker } from './TableMarker';

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.5;

/** Photo proportions: the markers' `x`/`y` are normalised on a 4:3 frame. */
export const TABLE_PHOTO_ASPECT = 4 / 3;

/** A finger that moves this far is dragging the photo, not tapping a table. */
const DRAG_THRESHOLD = 6;

export interface TablePhotoViewProps {
  /** The first photo of the place — the one the markers are placed on. */
  readonly photo: string;
  readonly tables: readonly TablePhotoMarker[];
  readonly selectedTableId: string | null;
  /** `null` when the diner taps the photo away from any table. */
  readonly onSelect: (tableId: string | null) => void;
  readonly onBook: (table: TablePhotoMarker) => void;
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

/**
 * The interior photo with the live table markers on it.
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
  tables,
  selectedTableId,
  onSelect,
  onBook,
  fullscreen = false,
  style,
}: TablePhotoViewProps) {
  const { t } = useTranslation('diner');
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [scale] = useState(() => new Animated.Value(ZOOM_MIN));
  const [pan] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [expanded, setExpanded] = useState(false);

  // Where the photo currently sits, in JS, so a new drag starts from it and a
  // zoom-out can pull it back inside the bounds.
  const offset = useRef({ x: 0, y: 0 });
  const frame = useRef({ width: 0, height: 0 });
  const zoomRef = useRef(ZOOM_MIN);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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

  const handleMarker = useCallback(
    (table: TablePhotoMarker) => onSelect(table.tableId === selectedTableId ? null : table.tableId),
    [onSelect, selectedTableId],
  );

  const handleBook = useCallback(
    (table: TablePhotoMarker) => {
      setExpanded(false);
      onBook(table);
    },
    [onBook],
  );

  const controlsBottom = selected ? TABLE_INFO_BAR_CLEARANCE + space.md : space.md;

  return (
    <>
      <View
        onLayout={onFrameLayout}
        style={[styles.frame, fullscreen && styles.frameFull, style]}
        {...responder.panHandlers}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] },
          ]}
        >
          <Pressable
            accessibilityLabel={t('tables.subtitle')}
            onPress={() => onSelect(null)}
            style={StyleSheet.absoluteFill}
          >
            <PhotoImage source={photo} style={StyleSheet.absoluteFill} />
          </Pressable>
          {tables.map((table) => (
            <TableMarker
              key={table.tableId}
              table={table}
              selected={table.tableId === selectedTableId}
              onPress={handleMarker}
            />
          ))}
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

        <TableInfoBar table={selected} photo={photo} onBook={handleBook} />
      </View>

      {fullscreen ? null : (
        <FullscreenTables
          visible={expanded}
          onClose={() => setExpanded(false)}
          photo={photo}
          tables={tables}
          selectedTableId={selectedTableId}
          onSelect={onSelect}
          onBook={handleBook}
        />
      )}
    </>
  );
}

interface FullscreenTablesProps extends Omit<TablePhotoViewProps, 'fullscreen' | 'style'> {
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
  );
}

/** Header row + legend row inside the fullscreen modal. */
const FULLSCREEN_CHROME = 120;

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: TABLE_PHOTO_ASPECT,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  frameFull: { borderRadius: 0, backgroundColor: colors.surfaceDark },
  expand: { position: 'absolute', top: space.md, right: space.md },
  zoom: { position: 'absolute', right: space.md, gap: space.sm },
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
