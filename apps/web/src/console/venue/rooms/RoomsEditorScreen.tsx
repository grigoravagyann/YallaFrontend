import { useVenueOutlet } from '../VenueLayout';
import { RoomsEditor } from './RoomsEditor';

/**
 * The route element.
 *
 * A thin shell whose only job is to take the branch from the outlet rather
 * than from the URL, so the editor itself stays a plain component that can be
 * rendered with any branch — including from the platform section, where an
 * admin edits a branch they do not hold a scope claim for.
 */
export function RoomsEditorScreen() {
  const { branchId, branchName } = useVenueOutlet();
  return <RoomsEditor branchId={branchId ?? undefined} branchName={branchName ?? null} />;
}
