import { RoomsEditor } from '../venue/rooms/RoomsEditor';
import { PlatformBranchHeader, usePlatformBranchRoute } from './PlatformBranchHeader';

/**
 * A branch's rooms editor, for the platform team. The editor already takes
 * its branch as a prop for exactly this.
 */
export function BranchFloorPlanRoute() {
  const route = usePlatformBranchRoute();
  return (
    <>
      <PlatformBranchHeader route={route} />
      <RoomsEditor branchId={route.branchId} />
    </>
  );
}
