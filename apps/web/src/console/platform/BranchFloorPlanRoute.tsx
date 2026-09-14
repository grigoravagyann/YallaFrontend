import { FloorPlanEditorRoute } from '../venue/floorplan/FloorPlanEditorRoute';
import { PlatformBranchHeader, usePlatformBranchRoute } from './PlatformBranchHeader';

/**
 * A branch's floor plan editor, for the platform team. The editor already
 * takes its branch as a prop for exactly this; the zone comes from the venue
 * read, for the diner preview's clock.
 */
export function BranchFloorPlanRoute() {
  const route = usePlatformBranchRoute();
  return (
    <>
      <PlatformBranchHeader route={route} />
      <FloorPlanEditorRoute branchId={route.branchId} timeZoneId={route.timeZoneId} />
    </>
  );
}
