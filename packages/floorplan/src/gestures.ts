import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, type GestureResponderEvent, type PanResponderInstance } from 'react-native';
import { MAX_ZOOM, MIN_ZOOM } from './layout';

/** How far a single finger must travel before a drag counts as a pan, in px. */
const PAN_SLOP_PX = 6;

/** Two taps closer together than this, in ms, are a double tap. */
const DOUBLE_TAP_MS = 300;

export interface FloorViewport {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export const FITTED: FloorViewport = { zoom: MIN_ZOOM, panX: 0, panY: 0 };

export interface UseFloorGesturesOptions {
  /** Off for a plan that is decoration — the Overview map, a preview. */
  readonly enabled?: boolean;
  readonly onChange?: ((next: FloorViewport) => void) | undefined;
}

export interface FloorGestures {
  readonly viewport: FloorViewport;
  /** Spread onto the `View` that wraps the plan. */
  readonly panHandlers: PanResponderInstance['panHandlers'];
  readonly reset: () => void;
  readonly setZoom: (zoom: number) => void;
  /**
   * Jump to a zoom with the room centred, discarding any pan.
   *
   * Distinct from {@link setZoom}, which preserves pan because it is the
   * control a person drives. This is the one the component uses when it *opens*
   * a view — a fresh area at the scale its tap targets need — where carrying
   * the previous area's pan would land the diner in a corner of a room they
   * have not seen yet.
   */
  readonly openAt: (zoom: number) => void;
  /** True while a pinch or pan is in flight; renderers suppress taps then. */
  readonly isGesturing: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(event: GestureResponderEvent): number {
  const touches = event.nativeEvent.touches;
  const a = touches[0];
  const b = touches[1];
  if (!a || !b) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/**
 * Pinch to zoom, drag to pan, double-tap to reset.
 *
 * Lives in the package rather than in the screens for the reason every other
 * rule here does: three surfaces render this plan, and gesture handling written
 * three times would behave three ways.
 *
 * The responder is claimed as late as possible. A single finger is ignored
 * until the room is actually zoomed in and the finger has travelled past the
 * slop — otherwise this would swallow every scroll on the diner's branch
 * screen, where the plan sits inside a scroll view. Two fingers claim
 * immediately, because nothing else on these screens wants a pinch.
 *
 * Pan is not clamped here. `computeFloorLayout` owns that, because the bound
 * depends on the fitted size, which depends on the viewport and the area
 * filter — none of which a gesture handler should have to know.
 */
export function useFloorGestures(options: UseFloorGesturesOptions = {}): FloorGestures {
  const { enabled = true, onChange } = options;

  const [viewport, setViewport] = useState<FloorViewport>(FITTED);
  const [isGesturing, setIsGesturing] = useState(false);

  // Refs, not state: the responder callbacks are created once and must see the
  // current values without re-creating the responder on every frame.
  const current = useRef<FloorViewport>(FITTED);
  const gestureStart = useRef<FloorViewport>(FITTED);
  const pinchStartDistance = useRef(0);
  const lastTapAt = useRef(0);

  const apply = useCallback(
    (next: FloorViewport) => {
      current.current = next;
      setViewport(next);
      onChange?.(next);
    },
    [onChange],
  );

  const reset = useCallback(() => apply(FITTED), [apply]);

  const setZoom = useCallback(
    (zoom: number) => {
      const clamped = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
      // Zooming back out to the fit has one sensible pan: none. Leaving a stale
      // offset there would letterbox the room off-centre for no reason.
      apply(clamped === MIN_ZOOM ? FITTED : { ...current.current, zoom: clamped });
    },
    [apply],
  );

  const openAt = useCallback(
    (zoom: number) => apply({ zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM), panX: 0, panY: 0 }),
    [apply],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Never claim on touch-down: that is a tap on a table, and the SVG
        // hit rects have to receive it.
        onStartShouldSetPanResponder: () => false,

        // Runs even though the responder is refused, which is what makes a
        // double tap detectable without stealing single taps from the tables.
        onStartShouldSetPanResponderCapture: (event) => {
          if (!enabled) return false;
          if (event.nativeEvent.touches.length > 1) return false;
          const now = Date.now();
          if (now - lastTapAt.current < DOUBLE_TAP_MS) {
            lastTapAt.current = 0;
            reset();
          } else {
            lastTapAt.current = now;
          }
          return false;
        },

        onMoveShouldSetPanResponder: (event, gesture) => {
          if (!enabled) return false;
          if (event.nativeEvent.touches.length > 1) return true;
          // One finger only pans a room that has somewhere to go. At the fit,
          // the parent scroll view keeps the gesture.
          if (current.current.zoom <= MIN_ZOOM) return false;
          return Math.abs(gesture.dx) > PAN_SLOP_PX || Math.abs(gesture.dy) > PAN_SLOP_PX;
        },

        onPanResponderGrant: (event) => {
          gestureStart.current = current.current;
          pinchStartDistance.current =
            event.nativeEvent.touches.length > 1 ? touchDistance(event) : 0;
          setIsGesturing(true);
        },

        onPanResponderMove: (event, gesture) => {
          const start = gestureStart.current;

          if (event.nativeEvent.touches.length > 1) {
            const distance = touchDistance(event);
            if (pinchStartDistance.current === 0) {
              // The second finger landed mid-pan; treat this frame as the start
              // of the pinch rather than dividing by zero.
              pinchStartDistance.current = distance;
              gestureStart.current = current.current;
              return;
            }
            if (distance > 0) {
              apply({
                ...current.current,
                zoom: clamp(
                  (distance / pinchStartDistance.current) * start.zoom,
                  MIN_ZOOM,
                  MAX_ZOOM,
                ),
              });
            }
            return;
          }

          apply({
            ...current.current,
            panX: start.panX + gesture.dx,
            panY: start.panY + gesture.dy,
          });
        },

        onPanResponderEnd: () => {
          pinchStartDistance.current = 0;
          setIsGesturing(false);
        },
        onPanResponderTerminate: () => {
          pinchStartDistance.current = 0;
          setIsGesturing(false);
        },
        // The plan is not a scroll container; let a parent reclaim if it must.
        onPanResponderTerminationRequest: () => true,
      }),
    [enabled, apply, reset],
  );

  return {
    viewport,
    panHandlers: responder.panHandlers,
    reset,
    setZoom,
    openAt,
    isGesturing,
  };
}
