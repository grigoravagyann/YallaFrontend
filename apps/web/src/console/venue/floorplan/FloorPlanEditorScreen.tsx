import { useVenueOutlet } from '../VenueLayout';
import { FloorPlanEditorRoute } from './FloorPlanEditorRoute';

/**
 * The route element.
 *
 * A thin shell whose only job is to take the branch from the outlet rather
 * than from the URL, so the editor itself stays a plain component that can be
 * rendered with any branch — including from the platform section, where an
 * admin edits a branch they do not hold a scope claim for.
 */
export function FloorPlanEditorScreen() {
  const { branchId, timeZoneId } = useVenueOutlet();
  return <FloorPlanEditorRoute branchId={branchId ?? undefined} timeZoneId={timeZoneId} />;
}
