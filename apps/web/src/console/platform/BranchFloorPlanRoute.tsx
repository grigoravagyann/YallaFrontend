import { RoomsEditor } from '../venue/rooms/RoomsEditor';
import { BranchPage } from './PlatformBranchHeader';

/**
 * A branch's rooms and tables, for the platform team (BranchRooms artboard):
 * the venue's own rooms editor — rooms, photos, a pin for every table that
 * moves on the arrow keys, QR codes, tables out of service, the conflict
 * banner — under the branch header, saving from the sticky bar at the foot.
 * It wears the console's look here (`yc-legacy`); the venue console keeps its own.
 */
export function BranchFloorPlanRoute() {
  return (
    <BranchPage tab="rooms">
      {({ branch }) => (
        <div className="yc-legacy">
          <RoomsEditor branchId={branch.id} layout="platform" />
        </div>
      )}
    </BranchPage>
  );
}
