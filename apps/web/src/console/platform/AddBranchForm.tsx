import { slugify, type ConsoleVenueDetail } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useRef, useState } from 'react';
import { useAddBranch } from '../../data/queries';
import { newCommandId } from '../../lib/commandId';
import { venueFormRefusal } from './venueFormRefusal';

/** Every venue in the pilot is in Yerevan, as on the create form. */
const TIME_ZONES = ['Asia/Yerevan'] as const;

interface AddBranchFormProps {
  readonly venue: ConsoleVenueDetail;
  readonly onDone: () => void;
}

/**
 * A second site for a venue that already exists:
 * `POST /api/platform/venues/{id}/branches`. The fields and their rules are
 * the create form's first-branch half — a web address the person can edit,
 * because an Armenian name derives to nothing, and a map pin that may not be
 * left blank, because blank arrives as 0,0.
 */
export function AddBranchForm({ venue, onDone }: AddBranchFormProps) {
  const { t } = useTranslation(['admin', 'common']);
  const add = useAddBranch();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [timeZoneId, setTimeZoneId] = useState<string>(TIME_ZONES[0]);
  const [error, setError] = useState<string | null>(null);
  const commandId = useRef(newCommandId()).current;

  const effectiveSlug = slugEdited ? slugify(slug) : slugify(name);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t('venue.addBranch.nameRequired'));
    if (!effectiveSlug) return setError(t('create.error.branchSlugRequired'));
    if (!address.trim()) return setError(t('create.error.addressRequired'));
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || Number.isNaN(lat) || Number.isNaN(lon)) {
      return setError(t('create.error.pinRequired'));
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return setError(t('create.error.pinRange'));
    }
    try {
      await add.mutateAsync({
        venueId: venue.id,
        commandId,
        name: name.trim(),
        slug: effectiveSlug,
        address: address.trim(),
        latitude: lat,
        longitude: lon,
        timeZoneId,
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
      aria-labelledby="add-branch-title"
      onSubmit={(event) => void submit(event)}
    >
      <h3 id="add-branch-title">{t('venue.addBranch.title')}</h3>

      <label className="labelled">
        <span>{t('create.branchName')}</span>
        <input
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('create.branchNamePlaceholder')}
          autoComplete="off"
        />
      </label>

      <label className="labelled">
        <span>{t('create.branchSlug')}</span>
        <input
          className="field"
          value={slugEdited ? slug : effectiveSlug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }}
          onBlur={() => setSlug(slugify(slug))}
          placeholder={t('create.branchSlugPlaceholder')}
          autoComplete="off"
        />
        <span className="muted small">
          {t('create.branchSlugHint', {
            venue: venue.slug,
            branch: effectiveSlug || t('create.branchSlugPlaceholder'),
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

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="actions">
        <button type="submit" className="button button-primary" disabled={add.isPending}>
          {add.isPending ? t('venue.working') : t('venue.addBranch.submit')}
        </button>
        <button type="button" className="button" disabled={add.isPending} onClick={onDone}>
          {t('venue.cancel')}
        </button>
      </div>
    </form>
  );
}
