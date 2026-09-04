export { FloorPlan } from './FloorPlan';

export type {
  FloorTable,
  FloorCanvas,
  FloorPlanProps,
  TableId,
  TableShape,
  TableStatus,
  Viewport,
} from './types';

export {
  fitCanvas,
  tableCenter,
  tableTransform,
  tablesBounds,
  hasOverflow,
  toPixels,
  toCanvas,
  needsEnlargedHitArea,
  MIN_TAP_TARGET_PX,
} from './geometry';
export type { CanvasFit, Point } from './geometry';
