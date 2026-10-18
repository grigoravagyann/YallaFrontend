import type { ConsoleBranch, ConsoleVenueDetail } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { ImageOffIcon } from '../ui/icons';
import type { ListingDraft } from '../venue/public/ListingSection';
import { PublicPageEditor, type PublicPageDraft } from '../venue/public/PublicPageScreen';
import { BranchPage } from './PlatformBranchHeader';

/**
 * A branch's public page and its app listing, for the platform team
 * (BranchPublic artboard): the venue's own two forms — the page and booking,
 * and the card in the Yalla app, each saved on its own — with a preview of
 * the app card beside them that follows the typing before anything is saved.
 *
 * The forms are the venue console's, unchanged in what they do: the cover,
 * the phone, the booking switch, the cuisine, the price, the amenities, the
 * district, the pin and the gallery. Here they wear the console's look
 * (`yc-legacy`), and a platform admin may move the branch (K5): the pin and the
 * address are editable, and the server audits the move.
 */
export function BranchPublicPageRoute() {
  return (
    <BranchPage tab="public">
      {({ venue, branch }) => <PublicPageWithPreview venue={venue} branch={branch} />}
    </BranchPage>
  );
}

function PublicPageWithPreview({
  venue,
  branch,
}: {
  readonly venue: ConsoleVenueDetail;
  readonly branch: ConsoleBranch;
}) {
  const [page, setPage] = useState<PublicPageDraft | null>(null);
  const [listing, setListing] = useState<ListingDraft | null>(null);
  return (
    <div className="yc-pp-layout">
      <div className="yc-legacy yc-pp-forms">
        <PublicPageEditor
          branchId={branch.id}
          canRelocate
          onDraft={setPage}
          onListingDraft={setListing}
        />
      </div>
      <AppCardPreview venue={venue} branch={branch} page={page} listing={listing} />
    </div>
  );
}

/**
 * The diner app's card for this branch, drawn from the drafts as typed. The
 * same parts the app shows, in the same order: the cover, the name, the
 * rating, the district and the price, the cuisine, the first lines of the
 * description, the amenities, and the booking button — or its absence.
 */
function AppCardPreview({
  venue,
  branch,
  page,
  listing,
}: {
  readonly venue: ConsoleVenueDetail;
  readonly branch: ConsoleBranch;
  readonly page: PublicPageDraft | null;
  readonly listing: ListingDraft | null;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const amenity = (key: string) =>
    key === 'outdoorSeating'
      ? t('publicPage.listing.amenities.outdoorSeating')
      : key === 'wifi'
        ? t('publicPage.listing.amenities.wifi')
        : key === 'parking'
          ? t('publicPage.listing.amenities.parking')
          : key === 'cardPayment'
            ? t('publicPage.listing.amenities.cardPayment')
            : key === 'vegan'
              ? t('publicPage.listing.amenities.vegan')
              : key;
  const price = listing?.priceLevel
    ? '֏'.repeat(listing.priceLevel)
    : t('branchPage.preview.noPrice');
  const rating =
    typeof venue.rating === 'number'
      ? `★ ${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(venue.rating)}`
      : null;
  const bookings = page?.acceptsWebBookings ?? false;

  return (
    <aside className="yc-preview" aria-label={t('branchPage.preview.label')}>
      <span className="yc-prev-cap">{t('branchPage.preview.caption')}</span>
      <div className="yc-phone">
        <div className="yc-pcard">
          {page?.cover ? (
            <img src={page.cover.cardUrl} alt="" />
          ) : (
            <div className="yc-pcard-nophoto" aria-hidden="true">
              <ImageOffIcon />
            </div>
          )}
          <div className="yc-pc-b">
            <div className="yc-pc-n">
              {venue.name} · {branch.name}
            </div>
            <div className="yc-pc-m">
              {[rating, listing?.district.trim() || t('branchPage.preview.noDistrict'), price]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className="yc-pc-m">
              {listing?.cuisine.trim() || t('branchPage.preview.noCuisine')}
            </div>
            {listing?.about.trim() ? <p className="yc-pc-about">{listing.about}</p> : null}
            {listing && listing.amenities.length > 0 ? (
              <div className="yc-pc-a">
                {listing.amenities.map((key) => (
                  <span key={key}>{amenity(key)}</span>
                ))}
              </div>
            ) : null}
            <div className={bookings ? 'yc-pc-btn' : 'yc-pc-btn is-off'}>
              {bookings ? t('branchPage.preview.book') : t('branchPage.preview.closed')}
            </div>
          </div>
        </div>
      </div>
      <span className="yc-help">{t('branchPage.preview.live')}</span>
    </aside>
  );
}
