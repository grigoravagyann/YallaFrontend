import type { Photo } from '@yalla/api';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { ImageOffIcon } from '../../ui/icons';

/** What the app card shows from the page-and-booking form, as typed. */
export interface PublicPageDraft {
  readonly acceptsWebBookings: boolean;
  readonly cover: Photo | null;
}

/** What the app card shows from the listing form, as typed. */
export interface ListingDraft {
  readonly cuisine: string;
  readonly about: string;
  readonly priceLevel: number | null;
  readonly amenities: readonly string[];
  readonly district: string;
  /** In the order the gallery is in; the card shows the first three. */
  readonly gallery: readonly Photo[];
}

/** The amenities' order on the card: the listing form's, which is the app's. */
const AMENITY_ORDER = ['outdoorSeating', 'wifi', 'parking', 'cardPayment', 'vegan'] as const;

/**
 * The diner app's card for this branch, drawn from the two forms as typed
 * (Public and BranchPublic artboards). The same parts the app shows, in the
 * same order: the cover, the name, the rating, the district and the price, the
 * cuisine, the first lines of the description, the amenities, the first
 * gallery photos, and the booking button — or its absence.
 *
 * Shared by the venue console's Public page and the platform's branch page.
 */
export function AppCardPreview({
  venueName,
  branchName,
  rating,
  page,
  listing,
}: {
  readonly venueName: string;
  readonly branchName: string;
  /** The visible reviews' average; null when there are none or it is not known. */
  readonly rating: number | null;
  readonly page: PublicPageDraft | null;
  readonly listing: ListingDraft | null;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const amenityName = (key: string) =>
    (AMENITY_ORDER as readonly string[]).includes(key)
      ? t(`publicPage.listing.amenities.${key}`)
      : key;
  const amenities = listing
    ? [...listing.amenities].sort(
        (a, b) =>
          (AMENITY_ORDER as readonly string[]).indexOf(a) -
          (AMENITY_ORDER as readonly string[]).indexOf(b),
      )
    : [];
  const price = listing?.priceLevel
    ? '֏'.repeat(listing.priceLevel)
    : t('branchPage.preview.noPrice');
  const stars =
    rating !== null
      ? `★ ${new Intl.NumberFormat(intlTag(locale), {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(rating)}`
      : null;
  const bookings = page?.acceptsWebBookings ?? false;
  const gallery = listing?.gallery.slice(0, 3) ?? [];

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
              {venueName} · {branchName}
            </div>
            <div className="yc-pc-m">
              {[stars, listing?.district.trim() || t('branchPage.preview.noDistrict'), price]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className="yc-pc-m">
              {listing?.cuisine.trim() || t('branchPage.preview.noCuisine')}
            </div>
            {listing?.about.trim() ? <p className="yc-pc-about">{listing.about}</p> : null}
            {amenities.length > 0 ? (
              <div className="yc-pc-a">
                {amenities.map((key) => (
                  <span key={key}>{amenityName(key)}</span>
                ))}
              </div>
            ) : null}
            {gallery.length > 0 ? (
              <div className="yc-pc-g">
                {gallery.map((photo) => (
                  <img key={photo.photoId} src={photo.cardUrl} alt="" />
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
