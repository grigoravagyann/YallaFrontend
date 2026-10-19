import type { ConsoleBranch, ConsoleVenueDetail } from '@yalla/api';
import { PublicPageEditor } from '../venue/public/PublicPageScreen';
import { BranchPage } from './PlatformBranchHeader';

/**
 * A branch's public page and its app listing, for the platform team
 * (BranchPublic artboard): the venue's own two forms — the page and booking,
 * and the card in the Yalla app, each saved on its own — with a preview of
 * the app card beside them that follows the typing before anything is saved.
 *
 * The forms and the card are the venue console's Public page, unchanged in
 * what they do: the cover, the phone, the booking switch, the cuisine, the
 * price, the amenities, the district, the pin and the gallery. A platform
 * admin may move the branch (K5): the pin and the address are editable, and
 * the server audits the move.
 */
export function BranchPublicPageRoute() {
  return (
    <BranchPage tab="public">
      {({ venue, branch }) => <PublicPage venue={venue} branch={branch} />}
    </BranchPage>
  );
}

function PublicPage({
  venue,
  branch,
}: {
  readonly venue: ConsoleVenueDetail;
  readonly branch: ConsoleBranch;
}) {
  return (
    <PublicPageEditor
      branchId={branch.id}
      canRelocate
      venueName={venue.name}
      branchName={branch.name}
      rating={typeof venue.rating === 'number' ? venue.rating : null}
      audience="platform"
    />
  );
}
