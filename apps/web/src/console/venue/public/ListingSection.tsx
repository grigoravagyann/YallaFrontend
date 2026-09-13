import {
  AMENITY_KEYS,
  MAX_GALLERY_PHOTOS,
  NotFoundError,
  ValidationError,
  type Photo,
  type VenueListing,
  type VenueListingInput,
} from '@yalla/api';
import { useBranchListing, useSaveBranchListing } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { PhotoPicker } from '../menu/PhotoPicker';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';

/**
 * What the diner app reads about a branch beyond the public page: cuisine,
 * a paragraph, the price level, the website, amenities, the map pin and the
 * gallery after the cover.
 *
 * Its own form with its own save, because it is its own endpoint
 * (`PUT /api/branches/{id}/listing`) and replaces every field at once. The
 * gallery reuses the menu editor's picker, so a gallery photo is cropped to the
 * same 4:3 card the app draws it in.
 */
export function ListingSection({ branchId }: { readonly branchId: string }) {
  const { t } = useTranslation(['admin', 'common']);
  const query = useBranchListing(branchId);

  if (query.isLoading || !query.data) {
    if (query.isError) {
      return <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />;
    }
    return <p className="muted">{t('loading')}</p>;
  }
  return <ListingForm key={branchId} branchId={branchId} initial={query.data} />;
}

const PRICE_LEVELS = [1, 2, 3, 4] as const;

/** Coordinates as typed: strings, so a half-typed "40." is not rewritten under the cursor. */
function coordinateText(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

function parseCoordinate(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

function ListingForm({
  branchId,
  initial,
}: {
  readonly branchId: string;
  readonly initial: VenueListing;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const save = useSaveBranchListing(branchId);

  const [saved, setSaved] = useState<VenueListing>(initial);
  const [cuisine, setCuisine] = useState(initial.cuisine ?? '');
  const [about, setAbout] = useState(initial.about ?? '');
  const [priceLevel, setPriceLevel] = useState<number | null>(initial.priceLevel);
  const [website, setWebsite] = useState(initial.websiteUrl ?? '');
  const [amenities, setAmenities] = useState<readonly string[]>(initial.amenities);
  const [latitude, setLatitude] = useState(coordinateText(initial.latitude));
  const [longitude, setLongitude] = useState(coordinateText(initial.longitude));
  const [gallery, setGallery] = useState<readonly Photo[]>(initial.gallery);
  // A fresh picker after each upload, so the drop zone is empty for the next photo.
  const [pickerKey, setPickerKey] = useState(0);

  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [outcome, setOutcome] = useState<'saved' | 'failed' | 'photoMissing' | null>(null);

  const lat = parseCoordinate(latitude);
  const lng = parseCoordinate(longitude);

  const dirty =
    cuisine !== (saved.cuisine ?? '') ||
    about !== (saved.about ?? '') ||
    priceLevel !== saved.priceLevel ||
    website !== (saved.websiteUrl ?? '') ||
    [...amenities].sort().join() !== [...saved.amenities].sort().join() ||
    lat !== saved.latitude ||
    lng !== saved.longitude ||
    gallery.map((p) => p.photoId).join() !== saved.gallery.map((p) => p.photoId).join();
  useUnsavedChangesGuard(dirty);

  function toggleAmenity(key: string) {
    setAmenities((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  function move(index: number, by: -1 | 1) {
    setGallery((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function submit() {
    setOutcome(null);
    const errors: Record<string, string> = {};
    if ((lat === null) !== (lng === null) || Number.isNaN(lat) || Number.isNaN(lng)) {
      errors['latitude'] = t('publicPage.listing.location.bothOrNeither');
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const listing: VenueListingInput = {
      cuisine: cuisine.trim() === '' ? null : cuisine,
      about: about.trim() === '' ? null : about,
      priceLevel,
      websiteUrl: website.trim() === '' ? null : website,
      amenities,
      galleryPhotoIds: gallery.map((p) => p.photoId),
      latitude: lat,
      longitude: lng,
    };

    try {
      const result = await save.mutateAsync(listing);
      setSaved(result);
      setCuisine(result.cuisine ?? '');
      setAbout(result.about ?? '');
      setPriceLevel(result.priceLevel);
      setWebsite(result.websiteUrl ?? '');
      setAmenities(result.amenities);
      setLatitude(coordinateText(result.latitude));
      setLongitude(coordinateText(result.longitude));
      setGallery(result.gallery);
      setOutcome('saved');
    } catch (error) {
      // The 422 names every bad field; each message goes under its control.
      if (error instanceof ValidationError && error.violations.length > 0) {
        const named: Record<string, string> = {};
        for (const violation of error.violations) {
          const field = violation.field === 'longitude' ? 'latitude' : violation.field;
          named[field] ??= violation.message;
        }
        setFieldErrors(named);
        return;
      }
      setOutcome(error instanceof NotFoundError ? 'photoMissing' : 'failed');
    }
  }

  const describedBy = (field: string) =>
    fieldErrors[field] ? `listing-${field}-error` : undefined;
  const fieldError = (field: string) =>
    fieldErrors[field] ? (
      <span id={`listing-${field}-error`} className="field-error" role="alert">
        {fieldErrors[field]}
      </span>
    ) : null;

  const mapUrl =
    lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng)
      ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
      : null;

  return (
    <form
      className="card listing-form"
      aria-labelledby="listing-title"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="field-group">
        <h3 id="listing-title">{t('publicPage.listing.title')}</h3>
        <p className="muted small">{t('publicPage.listing.intro')}</p>
      </div>

      <label className="labelled">
        <span>{t('publicPage.listing.cuisine.label')}</span>
        <input
          className="field"
          value={cuisine}
          maxLength={120}
          onChange={(event) => setCuisine(event.target.value)}
          aria-invalid={fieldErrors['cuisine'] ? true : undefined}
          aria-describedby={describedBy('cuisine')}
        />
        <span className="muted small">{t('publicPage.listing.cuisine.help')}</span>
        {fieldError('cuisine')}
      </label>

      <label className="labelled">
        <span>{t('publicPage.listing.about.label')}</span>
        <textarea
          className="field"
          rows={4}
          value={about}
          maxLength={2000}
          onChange={(event) => setAbout(event.target.value)}
          aria-invalid={fieldErrors['about'] ? true : undefined}
          aria-describedby={describedBy('about')}
        />
        <span className="muted small">{t('publicPage.listing.about.help')}</span>
        {fieldError('about')}
      </label>

      <fieldset className="field-group">
        <legend>{t('publicPage.listing.price.label')}</legend>
        <div className="chip-row" role="group" aria-describedby={describedBy('priceLevel')}>
          <button
            type="button"
            className={`chip${priceLevel === null ? ' is-on' : ''}`}
            aria-pressed={priceLevel === null}
            onClick={() => setPriceLevel(null)}
          >
            {t('publicPage.listing.price.unset')}
          </button>
          {PRICE_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`chip${priceLevel === level ? ' is-on' : ''}`}
              aria-pressed={priceLevel === level}
              onClick={() => setPriceLevel(level)}
            >
              {'֏'.repeat(level)} · {t(`publicPage.listing.price.level${level}`)}
            </button>
          ))}
        </div>
        {fieldError('priceLevel')}
      </fieldset>

      <label className="labelled">
        <span>{t('publicPage.listing.website.label')}</span>
        <input
          className="field"
          type="url"
          inputMode="url"
          value={website}
          placeholder="https://"
          onChange={(event) => setWebsite(event.target.value)}
          aria-invalid={fieldErrors['websiteUrl'] ? true : undefined}
          aria-describedby={describedBy('websiteUrl')}
        />
        <span className="muted small">{t('publicPage.listing.website.help')}</span>
        {fieldError('websiteUrl')}
      </label>

      <fieldset className="field-group">
        <legend>{t('publicPage.listing.amenities.label')}</legend>
        <div className="chip-row">
          {AMENITY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`chip${amenities.includes(key) ? ' is-on' : ''}`}
              aria-pressed={amenities.includes(key)}
              onClick={() => toggleAmenity(key)}
            >
              {t(`publicPage.listing.amenities.${key}`)}
            </button>
          ))}
        </div>
        {fieldError('amenities')}
      </fieldset>

      <fieldset className="field-group">
        <legend>{t('publicPage.listing.location.title')}</legend>
        <p className="muted small">{t('publicPage.listing.location.help')}</p>
        <div className="listing-grid">
          <label className="labelled">
            <span>{t('publicPage.listing.location.latitude')}</span>
            <input
              className="field"
              inputMode="decimal"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              aria-invalid={fieldErrors['latitude'] ? true : undefined}
              aria-describedby={describedBy('latitude')}
            />
          </label>
          <label className="labelled">
            <span>{t('publicPage.listing.location.longitude')}</span>
            <input
              className="field"
              inputMode="decimal"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              aria-invalid={fieldErrors['latitude'] ? true : undefined}
              aria-describedby={describedBy('latitude')}
            />
          </label>
        </div>
        {fieldError('latitude')}
        {mapUrl ? (
          <a
            className="small listing-map-link"
            href={mapUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('publicPage.listing.location.openMap')}
          </a>
        ) : null}
      </fieldset>

      <fieldset className="field-group">
        <legend>{t('publicPage.listing.gallery.title')}</legend>
        <p className="muted small">
          {t('publicPage.listing.gallery.help', { max: MAX_GALLERY_PHOTOS })}{' '}
          {t('publicPage.listing.gallery.summary', {
            used: gallery.length,
            max: MAX_GALLERY_PHOTOS,
          })}
        </p>
        {gallery.length === 0 ? (
          <p className="muted small">{t('publicPage.listing.gallery.empty')}</p>
        ) : (
          <ol className="gallery-grid">
            {gallery.map((photo, index) => (
              <li key={photo.photoId} className="gallery-tile">
                <img
                  src={photo.cardUrl}
                  alt={t('publicPage.listing.gallery.photoAlt', { position: index + 1 })}
                />
                <div className="gallery-tile-actions">
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`${t('publicPage.listing.gallery.moveEarlier')} (${index + 1})`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => move(index, 1)}
                    disabled={index === gallery.length - 1}
                    aria-label={`${t('publicPage.listing.gallery.moveLater')} (${index + 1})`}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className="button button-small button-danger"
                    onClick={() =>
                      setGallery((current) => current.filter((p) => p.photoId !== photo.photoId))
                    }
                    aria-label={`${t('publicPage.listing.gallery.remove')} (${index + 1})`}
                  >
                    {t('publicPage.listing.gallery.remove')}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        {fieldError('galleryPhotoIds')}
        {gallery.length < MAX_GALLERY_PHOTOS ? (
          <div>
            <p className="small">{t('publicPage.listing.gallery.add')}</p>
            <PhotoPicker
              key={pickerKey}
              branchId={branchId}
              photo={null}
              onChange={(photo) => {
                // The server deduplicates an identical upload into the same
                // photo, so a second copy of one picture is not added twice.
                setGallery((current) =>
                  current.some((p) => p.photoId === photo.photoId)
                    ? current
                    : [...current, photo].slice(0, MAX_GALLERY_PHOTOS),
                );
                setPickerKey((key) => key + 1);
              }}
            />
          </div>
        ) : (
          <p className="muted small">{t('publicPage.listing.gallery.full')}</p>
        )}
      </fieldset>

      <div className="actions">
        <button type="submit" className="button button-primary" disabled={save.isPending}>
          {save.isPending ? t('publicPage.listing.saving') : t('publicPage.listing.save')}
        </button>
        {outcome === 'saved' ? (
          <span className="muted" role="status">
            {t('publicPage.listing.saved')}
          </span>
        ) : null}
        {outcome === 'failed' ? (
          <span className="error">{t('publicPage.listing.failed')}</span>
        ) : null}
        {outcome === 'photoMissing' ? (
          <span className="error">{t('publicPage.listing.photoMissing')}</span>
        ) : null}
      </div>
    </form>
  );
}
