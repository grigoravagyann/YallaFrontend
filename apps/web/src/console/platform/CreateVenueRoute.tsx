import { SlugTakenError, ValidationError, slugify, type VenueType } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCreateVenue } from '../../data/queries';
import { newCommandId } from '../../lib/commandId';

/** Every venue in the pilot is in Yerevan; the field exists so the second is not a migration. */
const TIME_ZONES = ['Asia/Yerevan'] as const;

/**
 * Create a venue and its first branch — one flow, not two.
 *
 * A venue with no branch has no floor, no menu and no tables: it cannot be
 * onboarded, demoed, or even opened. Making the branch a separate second step
 * would just produce rows nobody can use, and someone would have to go round
 * cleaning them up.
 */
export function CreateVenueRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const navigate = useNavigate();
  const createVenue = useCreateVenue();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [type, setType] = useState<VenueType>('cafe');
  const [branchName, setBranchName] = useState('');
  const [timeZoneId, setTimeZoneId] = useState<string>(TIME_ZONES[0]);
  const [branchSlug, setBranchSlug] = useState('');
  const [branchSlugEdited, setBranchSlugEdited] = useState(false);
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * One command id for this form, reused on every retry. A resubmit after a
   * timeout must not create a second venue.
   */
  const commandId = useRef(newCommandId()).current;

  const effectiveSlug = slugEdited ? slug : slugify(name);
  /*
   * The branch needs its own, and it cannot be silently derived: `slugify`
   * strips everything outside a-z0-9, so "Կոնդ" and "Кафе" both come out empty
   * and the server answers 400 on a field the form never showed. In an Armenian
   * market that is the common name, not an edge case — so the branch gets the
   * same editable web address the venue has.
   */
  const effectiveBranchSlug = branchSlugEdited ? branchSlug : slugify(branchName);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) return setError(t('create.error.nameRequired'));
    if (!effectiveSlug) return setError(t('create.error.slugRequired'));
    if (!branchName.trim()) return setError(t('create.error.branchRequired'));
    if (!effectiveBranchSlug) return setError(t('create.error.branchSlugRequired'));
    if (!address.trim()) return setError(t('create.error.addressRequired'));

    /*
     * The backend takes these as non-nullable doubles, so a blank field would
     * arrive as 0,0 — a point in the Atlantic that renders as a valid map pin.
     * Refusing here is the difference between "you missed a field" and a venue
     * whose "Open in maps" link sends a diner to Null Island.
     */
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || Number.isNaN(lat) || Number.isNaN(lon)) {
      return setError(t('create.error.pinRequired'));
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return setError(t('create.error.pinRange'));
    }

    try {
      const venue = await createVenue.mutateAsync({
        commandId,
        name: name.trim(),
        slug: effectiveSlug,
        type,
        firstBranch: {
          name: branchName.trim(),
          slug: effectiveBranchSlug,
          timeZoneId,
          address: address.trim(),
          latitude: lat,
          longitude: lon,
        },
      });
      navigate(`/platform/venues/${venue.id}`, { replace: true });
    } catch (caught) {
      // Names the field at fault rather than reporting a generic failure at the
      // bottom of a form the person then has to re-read.
      /*
       * The backend names the field it refused (`context.field`) and puts a
       * sentence in `detail`. Dropping both for a flat "we could not create
       * that" is how a wrong payload stayed invisible: the server had been
       * saying "slug" on every attempt and nothing showed it.
       */
      setError(
        caught instanceof SlugTakenError
          ? t('create.error.slugTaken', { slug: caught.slug })
          : caught instanceof ValidationError && caught.field
            ? t('create.error.field', { field: caught.field, detail: caught.message })
            : t('create.error.generic'),
      );
    }
    return undefined;
  };

  return (
    <section className="page page-narrow">
      <p className="crumbs">
        <Link to="/platform/venues">{t('venues.title')}</Link>
      </p>

      <h1>{t('create.title')}</h1>
      <p className="muted">{t('create.lead')}</p>

      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="card">
          <legend>{t('create.venueSection')}</legend>

          <label className="labelled">
            <span>{t('create.name')}</span>
            <input
              className="field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('create.namePlaceholder')}
              autoComplete="off"
            />
          </label>

          <label className="labelled">
            <span>{t('create.slug')}</span>
            <input
              className="field"
              value={effectiveSlug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(slugify(event.target.value));
              }}
              placeholder={t('create.slugPlaceholder')}
              autoComplete="off"
            />
            <span className="muted small">
              {t('create.slugHint', { slug: effectiveSlug || t('create.slugPlaceholder') })}
            </span>
          </label>

          <label className="labelled">
            <span>{t('create.type')}</span>
            <select
              className="field"
              value={type}
              onChange={(event) => setType(event.target.value as VenueType)}
            >
              <option value="cafe">{t('create.typeCafe')}</option>
              <option value="restaurant">{t('create.typeRestaurant')}</option>
            </select>
          </label>
        </fieldset>

        <fieldset className="card">
          <legend>{t('create.branchSection')}</legend>

          <label className="labelled">
            <span>{t('create.branchName')}</span>
            <input
              className="field"
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder={t('create.branchNamePlaceholder')}
              autoComplete="off"
            />
          </label>

          <label className="labelled">
            <span>{t('create.branchSlug')}</span>
            <input
              className="field"
              value={effectiveBranchSlug}
              onChange={(event) => {
                setBranchSlugEdited(true);
                setBranchSlug(slugify(event.target.value));
              }}
              placeholder={t('create.branchSlugPlaceholder')}
              autoComplete="off"
            />
            <span className="muted small">
              {t('create.branchSlugHint', {
                venue: effectiveSlug || t('create.slugPlaceholder'),
                branch: effectiveBranchSlug || t('create.branchSlugPlaceholder'),
              })}
            </span>
          </label>

          <label className="labelled">
            <span>{t('create.address')}</span>
            <input
              className="field"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={t('create.addressPlaceholder')}
              autoComplete="off"
            />
          </label>

          <div className="pair">
            <label className="labelled">
              <span>{t('create.latitude')}</span>
              <input
                className="field"
                type="number"
                inputMode="decimal"
                step="any"
                min={-90}
                max={90}
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="40.1830"
              />
            </label>

            <label className="labelled">
              <span>{t('create.longitude')}</span>
              <input
                className="field"
                type="number"
                inputMode="decimal"
                step="any"
                min={-180}
                max={180}
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="44.5150"
              />
            </label>
          </div>
          <p className="hint">{t('create.pinHint')}</p>

          <label className="labelled">
            <span>{t('create.timeZone')}</span>
            <select
              className="field"
              value={timeZoneId}
              onChange={(event) => setTimeZoneId(event.target.value)}
            >
              {TIME_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        {error ? <p className="error">{error}</p> : null}

        <div className="actions">
          <button type="submit" className="button button-primary" disabled={createVenue.isPending}>
            {createVenue.isPending ? t('create.submitting') : t('create.submit')}
          </button>
          <Link className="button" to="/platform/venues">
            {t('create.cancel')}
          </Link>
        </div>
      </form>
    </section>
  );
}
