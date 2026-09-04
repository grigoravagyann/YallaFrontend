import { SlugTakenError, type VenueType } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCreateVenue } from '../../data/queries';
import { newCommandId } from '../../lib/commandId';

/** Every venue in the pilot is in Yerevan; the field exists so the second is not a migration. */
const TIME_ZONES = ['Asia/Yerevan'] as const;

function slugify(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

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
  const [error, setError] = useState<string | null>(null);

  /**
   * One command id for this form, reused on every retry. A resubmit after a
   * timeout must not create a second venue.
   */
  const commandId = useRef(newCommandId()).current;

  const effectiveSlug = slugEdited ? slug : slugify(name);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) return setError(t('create.error.nameRequired'));
    if (!effectiveSlug) return setError(t('create.error.slugRequired'));
    if (!branchName.trim()) return setError(t('create.error.branchRequired'));

    try {
      const venue = await createVenue.mutateAsync({
        commandId,
        name: name.trim(),
        slug: effectiveSlug,
        type,
        firstBranch: { name: branchName.trim(), timeZoneId },
      });
      navigate(`/platform/venues/${venue.id}`, { replace: true });
    } catch (caught) {
      // Names the field at fault rather than reporting a generic failure at the
      // bottom of a form the person then has to re-read.
      setError(
        caught instanceof SlugTakenError
          ? t('create.error.slugTaken', { slug: caught.slug })
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
