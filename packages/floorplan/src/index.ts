export { FloorPlan } from './FloorPlan';
export type { FloorPlanProps } from './FloorPlan';

export { AreaSwitcher, OVERVIEW } from './AreaSwitcher';
export type { AreaSelection, AreaSwitcherProps } from './AreaSwitcher';

export { Legend } from './Legend';
export type { LegendProps } from './Legend';

export { floorAreas, hasUsableAreas, UNASSIGNED_AREA } from './areas';
export type { FloorAreaSummary } from './areas';

export { FITTED, useFloorGestures } from './gestures';
export type { FloorGestures, FloorViewport, UseFloorGesturesOptions } from './gestures';

export {
  computeFloorLayout,
  isTableSelectable,
  tapTargetFloorFor,
  estimateTextWidth,
  AREA_MODE_MAX_WIDTH_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  MIN_FONT_SIZE_PX,
  MIN_TAP_TARGET_PX,
  STAFF_MIN_TAP_TARGET_PX,
  DEFAULT_PADDING_PX,
} from './layout';
export type { ComputeFloorLayoutInput, FloorLayout, LaidOutTable } from './layout';

export { pickTableAt } from './hitTest';

export { availabilityWindow, seatedMinutes, TIGHT_WINDOW_MINUTES } from './availability';
export type { AvailabilityWindow } from './availability';

export type {
  DerivedTableState,
  FloorFeature,
  FloorFeatureKind,
  FloorPlanData,
  FloorPlanMode,
  FloorTable,
  Point,
  Rect,
  TableShape,
} from './types';

export {
  mockFloorPlans,
  cafeFloorPlan,
  terraceFloorPlan,
  denseClusterFloorPlan,
  restaurantFloorPlan,
  twoFloorPlan,
  MOCK_NOW,
} from './mocks';
export type { MockFloorPlanKey } from './mocks';
