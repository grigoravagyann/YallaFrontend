import {
  AMENITY_KEYS,
  MAX_DISTRICT_LENGTH,
  MAX_GALLERY_PHOTOS,
  NotFoundError,
  RelocationNotAllowedError,
  ValidationError,
  type FieldViolation,
  type Photo,
  type VenueListing,
  type VenueListingInput,
} from '@yalla/api';
import { useBranchListing, useSaveBranchListing } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon, TrashIcon } from '../../ui/icons';
import { useToast } from '../../ui/toast';
import { PhotoPicker } from '../menu/PhotoPicker';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import type { ListingDraft } from './AppCardPreview';
import type { PublicPageAudience } from './PublicPageScreen';

/** The longest cuisine line and description the server takes (`ListingLimits`). */
export const MAX_CUISINE = 120;
export const MAX_ABOUT = 2000;

/**
 * What the diner app reads about a branch beyond the public page: cuisine,
 * a paragraph, the price level, the website, amenities, the map pin with its
 * street address, the district diners know the area by, and the gallery after
 * the cover ("In the Yalla app" on the Public artboard).
 *
 * Its own form with its own save, because it is its own endpoint
 * (`PUT /api/branches/{id}/listing`) and replaces every field at once. The
 * gallery reuses the menu editor's picker, so a gallery photo is cropped to the
 * same 4:3 card the app draws it in.
 *
 * **Moving the branch is an owner's.** The pin and the address together say
 * where diners are sent, so changing either is a relocation, which the server
 * allows an owner or the platform team only and audits (K5). Anybody else sees
 * both read-only under a line saying who can change them, rather than an
 * editor whose save would be refused. The district is not part of that: it
 * names the area for diners ("Kentron") rather than moving anyone's pin, so
 * whoever may edit the cuisine may edit it.
 */
export function ListingSection({
  branchId,
  canRelocate,
  audience,
  onDraft,
}: {
  readonly branchId: string;
  /** Owner or platform admin. Anyone else gets the pin and the address read-only. */
  readonly canRelocate: boolean;
  readonly audience: PublicPageAudience;
  /** Told what the card would show, on every change, before anything is saved. */
  readonly onDraft?: ((draft: ListingDraft) => void) | undefined;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const query = useBranchListing(branchId);

  if (query.isError && !query.data) {
    return (
      <div className="yc-card yc-ov-pad">
        <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (!query.data) {
    return (
      <p className="yc-card yc-empty-line" role="status">
        {t('loading')}
      </p>
    );
  }
  return (
    <ListingForm
      key={branchId}
      branchId={branchId}
      initial={query.data}
      canRelocate={canRelocate}
      audience={audience}
      onDraft={onDraft}
    />
  );
}

const PRICE_LEVELS = [null, 1, 2, 3, 4] as const;

/** The fields this form draws an error under; anything else the server names gets the footer line. */
const RENDERED_FIELDS: ReadonlySet<string> = new Set([
  'cuisine',
  'about',
  'priceLevel',
  'websiteUrl',
  'amenities',
  'latitude',
  'address',
  'district',
  'galleryPhotoIds',
]);

/** The first field with an error, in the order the form reads, for the focus. */
const FIELD_ORDER: readonly (readonly [string, string])[] = [
  ['cuisine', 'pp-cuisine'],
  ['about', 'pp-about'],
  ['websiteUrl', 'pp-web'],
  ['address', 'pp-addr'],
  ['district', 'pp-dist'],
  ['latitude', 'pp-lat'],
];

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

/**
 * One server refusal in the console's words, by the field it names and the
 * rule it broke (`bound`). Null for a combination this form has no sentence
 * for.
 *
 * The server's own `message` is English prose meant for developers: an
 * Armenian owner must never read "The website must be an http or https
 * address." under a field. So it is shown only in a development build, and only
 * where no sentence exists — which is the case that needs a developer anyway.
 */
export function listingViolationText(violation: FieldViolation, t: TFunction): string | null {
  const { field, bound, min, max } = violation;
  const key = (path: string) => `publicPage.listing.errors.${path}`;

  switch (field) {
    case 'priceLevel':
      return t(key('priceLevel.range'), { min: min ?? 1, max: max ?? 4 });
    case 'websiteUrl':
      return bound === 'max'
        ? t(key('websiteUrl.tooLong'), { max: max ?? 2048 })
        : t(key('websiteUrl.scheme'));
    case 'cuisine':
      return t(key('cuisine.tooLong'), { max: max ?? MAX_CUISINE });
    case 'about':
      return t(key('about.tooLong'), { max: max ?? MAX_ABOUT });
    case 'galleryPhotoIds':
      return bound === 'conflict'
        ? t(key('galleryPhotoIds.duplicate'))
        : t(key('galleryPhotoIds.tooMany'), { max: max ?? MAX_GALLERY_PHOTOS });
    case 'amenities':
      return t(key('amenities.unknown'));
    case 'latitude':
    case 'longitude':
      return bound === 'required'
        ? t(key('coordinates.pair'))
        : t(key(`${field}.range`), {
            min: min ?? (field === 'latitude' ? -90 : -180),
            max: max ?? (field === 'latitude' ? 90 : 180),
          });
    case 'address':
      return bound === 'required'
        ? t('publicPage.listing.address.required')
        : t(key('address.tooLong'), { max: max ?? 400 });
    case 'district':
      return t(key('district.tooLong'), { max: max ?? MAX_DISTRICT_LENGTH });
    default:
      if (/photo[XY]$/u.test(field)) {
        return bound === 'range' ? t(key('photoXY.range')) : t(key('photoXY.pair'));
      }
      return null;
  }
}

type Outcome = 'failed' | 'photoMissing' | 'relocateOwnerOnly' | 'checkFields' | null;

function ListingForm({
  branchId,
  initial,
  canRelocate,
  audience,
  onDraft,
}: {
  readonly branchId: string;
  readonly initial: VenueListing;
  readonly canRelocate: boolean;
  readonly audience: PublicPageAudience;
  readonly onDraft?: ((draft: ListingDraft) => void) | undefined;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const save = useSaveBranchListing(branchId);
  const titleId = useId();

  const [saved, setSaved] = useState<VenueListing>(initial);
  const [cuisine, setCuisine] = useState(initial.cuisine ?? '');
  const [about, setAbout] = useState(initial.about ?? '');
  const [priceLevel, setPriceLevel] = useState<number | null>(initial.priceLevel);
  const [website, setWebsite] = useState(initial.websiteUrl ?? '');
  const [amenities, setAmenities] = useState<readonly string[]>(initial.amenities);
  const [latitude, setLatitude] = useState(coordinateText(initial.latitude));
  const [longitude, setLongitude] = useState(coordinateText(initial.longitude));
  const [address, setAddress] = useState(initial.address ?? '');
  const [district, setDistrict] = useState(initial.district ?? '');
  const [gallery, setGallery] = useState<readonly Photo[]>(initial.gallery);

  // The preview beside the form follows the typing.
  useEffect(() => {
    onDraft?.({ cuisine, about, priceLevel, amenities, district, gallery });
  }, [onDraft, cuisine, about, priceLevel, amenities, district, gallery]);
  // A fresh picker after each upload, so the drop zone is empty for the next photo.
  const [pickerKey, setPickerKey] = useState(0);

  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [justSaved, setJustSaved] = useState(false);

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
    address !== (saved.address ?? '') ||
    district !== (saved.district ?? '') ||
    gallery.map((p) => p.photoId).join() !== saved.gallery.map((p) => p.photoId).join();
  useUnsavedChangesGuard(dirty);

  /** Any change: the "saved" line is about the listing as it was. */
  function edited<T>(set: (value: T) => void): (value: T) => void {
    return (value) => {
      set(value);
      setJustSaved(false);
    };
  }

  function toggleAmenity(key: string) {
    setJustSaved(false);
    setAmenities((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= gallery.length) return;
    const next = [...gallery];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setGallery(next);
    setJustSaved(false);
    // The photo moved; the focus goes with it, onto the same arrow.
    requestAnimationFrame(() =>
      document.getElementById(`pp-gal-${by < 0 ? 'earlier' : 'later'}-${target}`)?.focus(),
    );
  }

  function remove(index: number) {
    const before = gallery;
    setGallery(gallery.filter((_, position) => position !== index));
    setJustSaved(false);
    toast.say(t('publicPage.listing.gallery.removed', { position: index + 1 }), {
      undo: () => setGallery(before),
      fallbackFocus: () => document.getElementById('pp-gallery-l'),
    });
  }

  function checkLocally(): Record<string, string> {
    const errors: Record<string, string> = {};
    const hasPin = lat !== null && lng !== null;
    const addressText = address.trim();
    if (cuisine.length > MAX_CUISINE) {
      errors['cuisine'] = t('publicPage.listing.errors.cuisine.tooLong', { max: MAX_CUISINE });
    }
    if (about.length > MAX_ABOUT) {
      errors['about'] = t('publicPage.listing.errors.about.tooLong', { max: MAX_ABOUT });
    }
    if (website.trim() !== '' && !/^https?:\/\//iu.test(website.trim())) {
      errors['websiteUrl'] = t('publicPage.listing.errors.websiteUrl.scheme');
    }
    if ((lat === null) !== (lng === null)) {
      errors['latitude'] = t('publicPage.listing.location.bothOrNeither');
    } else if (Number.isNaN(lat) || Number.isNaN(lng)) {
      errors['latitude'] = t('publicPage.listing.location.notANumber');
    } else if ((lat !== null && Math.abs(lat) > 90) || (lng !== null && Math.abs(lng) > 180)) {
      // The server refuses these too, but with a 400 that names one field.
      errors['latitude'] = t('publicPage.listing.location.outOfRange');
    }
    // The pin and the address travel together (K5): one without the other is
    // refused, so it is said here before anything is sent. With both
    // coordinates left empty the current pin is kept, and so is the address.
    if (hasPin && addressText === '') {
      errors['address'] = t('publicPage.listing.address.required');
    } else if (!hasPin && lat === null && addressText !== (saved.address ?? '').trim()) {
      errors['address'] = t('publicPage.listing.address.required');
    }
    // No `maxLength` on the input: a pasted name cut short without a word is
    // worse than being told it is too long.
    if (district.trim().length > MAX_DISTRICT_LENGTH) {
      errors['district'] = t('publicPage.listing.errors.district.tooLong', {
        max: MAX_DISTRICT_LENGTH,
      });
    }
    return errors;
  }

  function focusFirst(errors: Readonly<Record<string, string>>) {
    const first = FIELD_ORDER.find(([field]) => errors[field]);
    if (first) document.getElementById(first[1])?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    setOutcome(null);
    const errors = checkLocally();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setOutcome('checkFields');
      focusFirst(errors);
      return;
    }

    const hasPin = lat !== null && lng !== null;
    const districtText = district.trim();
    const listing: VenueListingInput = {
      cuisine: cuisine.trim() === '' ? null : cuisine,
      about: about.trim() === '' ? null : about,
      priceLevel,
      websiteUrl: website.trim() === '' ? null : website.trim(),
      amenities,
      galleryPhotoIds: gallery.map((p) => p.photoId),
      address: hasPin ? address.trim() : null,
      district: districtText === '' ? null : districtText,
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
      setAddress(result.address ?? '');
      setDistrict(result.district ?? '');
      setGallery(result.gallery);
      setJustSaved(true);
      toast.say(t('publicPage.listing.savedToast'));
    } catch (error) {
      if (error instanceof RelocationNotAllowedError) {
        setOutcome('relocateOwnerOnly');
        return;
      }
      if (error instanceof ValidationError) {
        const named: Record<string, string> = {};
        const blame = (violation: FieldViolation) => {
          const text =
            listingViolationText(violation, t) ??
            (import.meta.env.DEV && violation.message
              ? violation.message
              : t('publicPage.listing.errors.generic'));
          // Both coordinates share one error line, under the pin.
          named[violation.field === 'longitude' ? 'latitude' : violation.field] ??= text;
        };
        // The 422 names every bad field; each sentence goes under its control.
        for (const violation of error.violations) blame(violation);
        // A 400 names one field in `context.field` and collects nothing — a
        // coordinate out of range comes back this way.
        if (error.violations.length === 0 && error.field) {
          const coordinate = error.field === 'latitude' || error.field === 'longitude';
          if (coordinate) named['latitude'] = t('publicPage.listing.location.outOfRange');
          else blame({ field: error.field, message: error.message, bound: 'range' });
        }
        const fields = Object.keys(named);
        if (fields.some((field) => RENDERED_FIELDS.has(field))) {
          setFieldErrors(named);
          focusFirst(named);
          // A field with no control of its own still says the save failed.
          setOutcome(
            fields.every((field) => RENDERED_FIELDS.has(field)) ? 'checkFields' : 'failed',
          );
          return;
        }
      }
      setOutcome(error instanceof NotFoundError ? 'photoMissing' : 'failed');
    }
  }

  const fieldError = (field: string) =>
    fieldErrors[field] ? (
      <span id={`pp-${field}-err`} className="yc-err">
        {fieldErrors[field]}
      </span>
    ) : null;
  const described = (field: string, help: string) =>
    fieldErrors[field] ? `${help} pp-${field}-err` : help;

  const mapUrl =
    lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng)
      ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
      : null;

  const outcomeText =
    outcome === 'failed'
      ? t('publicPage.listing.failed')
      : outcome === 'photoMissing'
        ? t('publicPage.listing.photoMissing')
        : outcome === 'relocateOwnerOnly'
          ? t('publicPage.listing.relocateOwnerOnly')
          : outcome === 'checkFields'
            ? t('publicPage.listing.checkFields')
            : null;

  return (
    <form className="yc-card" aria-labelledby={titleId} noValidate onSubmit={submit}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('publicPage.listing.title')}
          </h2>
          <p className="yc-cap">
            {audience === 'venue'
              ? t('publicPage.listing.intro')
              : t('publicPage.listing.introPlatform')}
          </p>
        </div>
      </div>
      <div className="yc-pp-b">
        <div className="yc-fld">
          <label htmlFor="pp-cuisine">{t('publicPage.listing.cuisine.label')}</label>
          <input
            id="pp-cuisine"
            className="yc-ctl"
            value={cuisine}
            aria-invalid={cuisine.length > MAX_CUISINE || Boolean(fieldErrors['cuisine'])}
            aria-describedby={described('cuisine', 'pp-cuisine-help pp-cuisine-c')}
            onChange={(event) => edited(setCuisine)(event.target.value)}
          />
          <div className="yc-cnt-row">
            <span className="yc-help" id="pp-cuisine-help">
              {t('publicPage.listing.cuisine.help')}
            </span>
            <Counter id="pp-cuisine-c" used={cuisine.length} max={MAX_CUISINE} />
          </div>
          {fieldError('cuisine')}
        </div>

        <div className="yc-fld">
          <label htmlFor="pp-about">{t('publicPage.listing.about.label')}</label>
          <textarea
            id="pp-about"
            className="yc-ctl"
            rows={4}
            value={about}
            aria-invalid={about.length > MAX_ABOUT || Boolean(fieldErrors['about'])}
            aria-describedby={described('about', 'pp-about-help pp-about-c')}
            onChange={(event) => edited(setAbout)(event.target.value)}
          />
          <div className="yc-cnt-row">
            <span className="yc-help" id="pp-about-help">
              {t('publicPage.listing.about.help')}
            </span>
            <Counter id="pp-about-c" used={about.length} max={MAX_ABOUT} />
          </div>
          {fieldError('about')}
        </div>

        <div className="yc-fld">
          <span className="yc-lbl" id="pp-price-l">
            {t('publicPage.listing.price.label')}
          </span>
          <div className="yc-seg" role="group" aria-labelledby="pp-price-l">
            {PRICE_LEVELS.map((level) => (
              <button
                key={level ?? 'unset'}
                type="button"
                aria-pressed={priceLevel === level}
                onClick={() => edited(setPriceLevel)(level)}
              >
                {level === null
                  ? t('publicPage.listing.price.unset')
                  : `${'֏'.repeat(level)} ${t(`publicPage.listing.price.level${level}`)}`}
              </button>
            ))}
          </div>
          {fieldError('priceLevel')}
        </div>

        <div className="yc-fld">
          <label htmlFor="pp-web">{t('publicPage.listing.website.label')}</label>
          <input
            id="pp-web"
            className="yc-ctl"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={website}
            aria-invalid={Boolean(fieldErrors['websiteUrl'])}
            aria-describedby={described('websiteUrl', 'pp-web-help')}
            onChange={(event) => edited(setWebsite)(event.target.value)}
          />
          <span className="yc-help" id="pp-web-help">
            {t('publicPage.listing.website.help')}
          </span>
          {fieldError('websiteUrl')}
        </div>

        <fieldset className="yc-amen">
          <legend>{t('publicPage.listing.amenities.label')}</legend>
          {AMENITY_KEYS.map((key) => {
            const on = amenities.includes(key);
            return (
              <label key={key} className={on ? 'yc-ach is-on' : 'yc-ach'}>
                <input type="checkbox" checked={on} onChange={() => toggleAmenity(key)} />
                {t(`publicPage.listing.amenities.${key}`)}
              </label>
            );
          })}
          {fieldError('amenities')}
        </fieldset>

        {canRelocate ? null : (
          <div className="yc-pp-lock" data-testid="relocate-owner-only">
            <LockIcon />
            <span>{t('publicPage.listing.relocateOwnerOnly')}</span>
          </div>
        )}

        <div className="yc-row2">
          <div className="yc-fld">
            <label htmlFor="pp-addr">
              {t('publicPage.listing.address.label')}
              <span className="yc-req" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="pp-addr"
              className="yc-ctl"
              value={address}
              autoComplete="street-address"
              readOnly={!canRelocate}
              aria-invalid={Boolean(fieldErrors['address'])}
              aria-describedby={described('address', 'pp-addr-help')}
              onChange={(event) => edited(setAddress)(event.target.value)}
            />
            <span className="yc-help" id="pp-addr-help">
              {t('publicPage.listing.address.help')}
            </span>
            {fieldError('address')}
          </div>
          <div className="yc-fld">
            <label htmlFor="pp-dist">{t('publicPage.listing.district.label')}</label>
            <input
              id="pp-dist"
              className="yc-ctl"
              value={district}
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors['district'])}
              aria-describedby={described('district', 'pp-dist-help')}
              onChange={(event) => edited(setDistrict)(event.target.value)}
            />
            <span className="yc-help" id="pp-dist-help">
              {t('publicPage.listing.district.help', { max: MAX_DISTRICT_LENGTH })}
            </span>
            {fieldError('district')}
          </div>
        </div>

        <div className="yc-fld">
          <span className="yc-lbl">{t('publicPage.listing.location.title')}</span>
          <div className="yc-row2">
            <div className="yc-fld">
              <label htmlFor="pp-lat" className="yc-help yc-strong">
                {t('publicPage.listing.location.latitude')}
              </label>
              <input
                id="pp-lat"
                className="yc-ctl"
                inputMode="decimal"
                value={latitude}
                readOnly={!canRelocate}
                aria-invalid={Boolean(fieldErrors['latitude'])}
                aria-describedby={described('latitude', 'pp-pin-help')}
                onChange={(event) => edited(setLatitude)(event.target.value)}
              />
            </div>
            <div className="yc-fld">
              <label htmlFor="pp-lng" className="yc-help yc-strong">
                {t('publicPage.listing.location.longitude')}
              </label>
              <input
                id="pp-lng"
                className="yc-ctl"
                inputMode="decimal"
                value={longitude}
                readOnly={!canRelocate}
                aria-invalid={Boolean(fieldErrors['latitude'])}
                aria-describedby={described('latitude', 'pp-pin-help')}
                onChange={(event) => edited(setLongitude)(event.target.value)}
              />
            </div>
          </div>
          <span className="yc-help" id="pp-pin-help">
            {t('publicPage.listing.location.help')}
          </span>
          {fieldError('latitude')}
          {mapUrl ? (
            <a className="yc-pp-map" href={mapUrl} target="_blank" rel="noreferrer noopener">
              {t('publicPage.listing.location.openMap')}
            </a>
          ) : null}
        </div>

        <div className="yc-fld">
          <div className="yc-pp-gal-h">
            <span className="yc-lbl" id="pp-gallery-l" tabIndex={-1}>
              {t('publicPage.listing.gallery.title')}
            </span>
            <span className="yc-count">
              {t('publicPage.listing.gallery.summary', {
                used: gallery.length,
                max: MAX_GALLERY_PHOTOS,
              })}
            </span>
          </div>
          <span className="yc-help">{t('publicPage.listing.gallery.help')}</span>
          {gallery.length > 0 ? (
            <ol className="yc-pp-gal" aria-labelledby="pp-gallery-l">
              {gallery.map((photo, index) => (
                <li key={photo.photoId} className="yc-pp-tile">
                  <img
                    src={photo.cardUrl}
                    alt={t('publicPage.listing.gallery.photoAlt', { position: index + 1 })}
                  />
                  <span className="yc-pp-pos" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="yc-pp-tile-a">
                    <button
                      type="button"
                      id={`pp-gal-earlier-${index}`}
                      className="yc-mini"
                      aria-label={t('publicPage.listing.gallery.moveEarlier', {
                        position: index + 1,
                      })}
                      aria-disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ChevronLeftIcon />
                    </button>
                    <button
                      type="button"
                      id={`pp-gal-later-${index}`}
                      className="yc-mini"
                      aria-label={t('publicPage.listing.gallery.moveLater', {
                        position: index + 1,
                      })}
                      aria-disabled={index === gallery.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronRightIcon />
                    </button>
                    <button
                      type="button"
                      className="yc-mini yc-mini-del"
                      aria-label={t('publicPage.listing.gallery.remove', { position: index + 1 })}
                      onClick={() => remove(index)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          {fieldError('galleryPhotoIds')}
          {gallery.length < MAX_GALLERY_PHOTOS ? (
            <div className="yc-pp-add">
              <span className="yc-lbl">{t('publicPage.listing.gallery.add')}</span>
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
                  setJustSaved(false);
                  setPickerKey((key) => key + 1);
                }}
              />
            </div>
          ) : (
            <p className="yc-help">{t('publicPage.listing.gallery.full')}</p>
          )}
        </div>
      </div>
      <div className="yc-pp-f">
        <button type="submit" className="yc-btn yc-btn-pri" aria-busy={save.isPending}>
          {save.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
          {save.isPending ? t('publicPage.listing.saving') : t('publicPage.listing.save')}
        </button>
        {dirty ? <span className="yc-dirty">{t('publicPage.unsaved')}</span> : null}
        {justSaved && !dirty ? (
          <span className="yc-saved" role="status">
            <CheckIcon />
            {t('publicPage.listing.saved')}
          </span>
        ) : null}
        {outcomeText ? (
          <span className="yc-err" role="alert">
            {outcomeText}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** "37 / 120": red once it is over. */
function Counter({
  id,
  used,
  max,
}: {
  readonly id: string;
  readonly used: number;
  readonly max: number;
}) {
  return (
    <span id={id} className={used > max ? 'yc-count is-over' : 'yc-count'}>
      {used} / {max}
    </span>
  );
}
