export { FloorPlan } from './FloorPlan';
export type { FloorPlanProps } from './FloorPlan';

export { Legend } from './Legend';
export type { LegendProps } from './Legend';

export {
  computeFloorLayout,
  isTableSelectable,
  tapTargetFloorFor,
  estimateTextWidth,
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
  MOCK_NOW,
} from './mocks';
export type { MockFloorPlanKey } from './mocks';
