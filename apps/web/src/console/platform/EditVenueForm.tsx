import { slugify, type ConsoleVenueDetail, type VenueType } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useRef, useState } from 'react';
import { useUpdateVenue } from '../../data/queries';
import { newCommandId } from '../../lib/commandId';
import { venueFormRefusal } from './venueFormRefusal';

interface EditVenueFormProps {
  readonly venue: ConsoleVenueDetail;
  readonly onDone: () => void;
}

/**
 * The venue's name, web address and type — the three things
 * `PATCH /api/platform/venues/{id}` changes, with the labels the create form
 * uses for them. A typo in a venue's name used to mean a hand call to the API.
 */
export function EditVenueForm({ venue, onDone }: EditVenueFormProps) {
  const { t } = useTranslation(['admin', 'common']);
  const update = useUpdateVenue();
  const [name, setName] = useState(venue.name);
  const [slug, setSlug] = useState(venue.slug);
  const [type, setType] = useState<VenueType>(venue.type);
  const [error, setError] = useState<string | null>(null);
  /** One id per open form, reused on a retry, as on the create form. */
  const commandId = useRef(newCommandId()).current;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t('create.error.nameRequired'));
    const cleanSlug = slugify(slug);
    if (!cleanSlug) return setError(t('create.error.slugRequired'));
    try {
      await update.mutateAsync({
        venueId: venue.id,
        commandId,
        name: name.trim(),
        slug: cleanSlug,
        type,
      });
      onDone();
    } catch (caught) {
      setError(venueFormRefusal(caught, t));
    }
    return undefined;
  };

  return (
    <form
      className="card"
      aria-labelledby="edit-venue-title"
      onSubmit={(event) => void submit(event)}
    >
      <h2 id="edit-venue-title">{t('venue.edit.title')}</h2>

      <label className="labelled">
        <span>{t('create.name')}</span>
        <input
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
      </label>

      <label className="labelled">
        <span>{t('create.slug')}</span>
        <input
          className="field"
          value={slug}
          // Cleaned on blur and on save, not per keystroke: `slugify` drops a
          // trailing hyphen, so cleaning as you type made "green-bean"
          // impossible to type — it came out "greenbean".
          onChange={(event) => setSlug(event.target.value)}
          onBlur={() => setSlug(slugify(slug))}
          autoComplete="off"
        />
        <span className="muted small">
          {t('create.slugHint', { slug: slugify(slug) || venue.slug })}
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
          <option value="bar">{t('create.typeBar')}</option>
        </select>
      </label>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="actions">
        <button type="submit" className="button button-primary" disabled={update.isPending}>
          {update.isPending ? t('venue.working') : t('venue.edit.save')}
        </button>
        <button type="button" className="button" disabled={update.isPending} onClick={onDone}>
          {t('venue.cancel')}
        </button>
      </div>
    </form>
  );
}
