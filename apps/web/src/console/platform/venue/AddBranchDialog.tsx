import { SlugTakenError, ValidationError, slugify, type ConsoleVenueDetail } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAddBranch } from '../../../data/queries';
import { newCommandId } from '../../../lib/commandId';
import { Dialog } from '../../ui/Dialog';
import { SLUG_SHAPE } from '../venues/venueList';
import { Required, pinProblem, usePendingFocus } from './venueFields';

/** Every venue in the pilot is in Yerevan; the field exists so the second city is not a migration. */
const TIME_ZONE = 'Asia/Yerevan';

type Field = 'name' | 'slug' | 'address' | 'pin';
const ORDER: readonly Field[] = ['name', 'slug', 'address', 'pin'];
const INPUT: Readonly<Record<Field, string>> = {
  name: 'ab-name',
  slug: 'ab-slug',
  address: 'ab-address',
  pin: 'ab-latitude',
};

export interface AddBranchDialogProps {
  readonly venue: ConsoleVenueDetail;
  readonly onClose: () => void;
  readonly onAdded: (name: string) => void;
}

/**
 * Another branch for a venue (VenueDetail artboard): the same fields as a
 * venue's first branch, for the same reasons — an Armenian name gives no web
 * address, and a blank pin would land at 0,0. It starts on Free with an empty
 * floor; the venue's team adds the rooms, the menu and the hours.
 */
export function AddBranchDialog({ venue, onClose, onAdded }: AddBranchDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const add = useAddBranch();
  const commandId = useRef(newCommandId());
  const focusLater = usePendingFocus();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [tried, setTried] = useState(false);
  const [taken, setTaken] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const branchSlug = slugEdited ? slug : slugify(name);
  const usedSlugs = new Set(venue.branches.map((branch) => branch.slug).filter(Boolean));

  const errors: Partial<Record<Field, string>> = {};
  if (!name.trim()) errors.name = t('venuePage.branchDialog.nameRequired');
  if (!branchSlug) errors.slug = t('venues.add.error.branchSlugRequired');
  else if (!SLUG_SHAPE.test(branchSlug)) errors.slug = t('venues.add.error.slugShape');
  else if (usedSlugs.has(branchSlug) || taken === branchSlug) {
    errors.slug = t('venuePage.branchDialog.slugTaken');
  }
  if (!address.trim()) errors.address = t('venuePage.branchDialog.address');
  const pin = pinProblem(latitude, longitude, t);
  if (pin) errors.pin = pin;

  const shown = (field: Field) => (tried ? (errors[field] ?? null) : null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (add.isPending) return;
    setTried(true);
    const bad = ORDER.find((field) => errors[field]);
    if (bad) {
      focusLater(INPUT[bad]);
      return;
    }
    setFailure(null);
    try {
      await add.mutateAsync({
        venueId: venue.id,
        commandId: commandId.current,
        name: name.trim(),
        slug: branchSlug,
        address: address.trim(),
        latitude: Number(latitude.trim()),
        longitude: Number(longitude.trim()),
        timeZoneId: TIME_ZONE,
      });
      onAdded(name.trim());
    } catch (caught) {
      if (caught instanceof SlugTakenError) {
        setTaken(branchSlug);
        focusLater(INPUT.slug);
        return;
      }
      setFailure(
        caught instanceof ValidationError && caught.field
          ? t('venues.add.error.field', { field: caught.field, detail: caught.message })
          : t('venue.failed'),
      );
    }
  }

  const described = (id: string, field: Field, help = false) =>
    [help ? `${id}-help` : '', shown(field) ? `${id}-err` : ''].filter(Boolean).join(' ') ||
    undefined;

  const text = (field: Exclude<Field, 'pin'>, label: string, control: ReactNode, help?: string) => (
    <div className="yc-fld">
      <label htmlFor={INPUT[field]}>
        {label}
        <Required />
      </label>
      {control}
      {help ? (
        <span className="yc-help" id={`${INPUT[field]}-help`}>
          {help}
        </span>
      ) : null}
      {shown(field) ? (
        <span className="yc-err" id={`${INPUT[field]}-err`}>
          {shown(field)}
        </span>
      ) : null}
    </div>
  );

  const pinError = shown('pin');
  const pinDescribed = `ab-pin-help${pinError ? ' ab-pin-err' : ''}`;
  const busy = add.isPending;

  return (
    <Dialog
      wide
      title={t('venuePage.branchDialog.title')}
      description={t('venuePage.branchDialog.lead')}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
    >
      <form className="yc-form" noValidate onSubmit={(event) => void submit(event)}>
        <div className="yc-row2">
          {text(
            'name',
            t('venuePage.branchDialog.name'),
            <input
              id={INPUT.name}
              className="yc-ctl"
              data-autofocus=""
              aria-required="true"
              aria-invalid={Boolean(shown('name'))}
              aria-describedby={described(INPUT.name, 'name')}
              autoComplete="off"
              placeholder={t('venues.add.branchNamePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />,
          )}
          {text(
            'slug',
            t('venuePage.branchDialog.slug'),
            <input
              id={INPUT.slug}
              className="yc-ctl"
              aria-required="true"
              aria-invalid={Boolean(shown('slug'))}
              aria-describedby={described(INPUT.slug, 'slug', true)}
              autoComplete="off"
              spellCheck={false}
              placeholder="northern-avenue"
              value={branchSlug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value.toLowerCase().replace(/\s+/gu, '-'));
              }}
            />,
            `yalla.am/${venue.slug}/${branchSlug || '…'}`,
          )}
        </div>
        {text(
          'address',
          t('venues.add.address'),
          <input
            id={INPUT.address}
            className="yc-ctl"
            aria-required="true"
            aria-invalid={Boolean(shown('address'))}
            aria-describedby={described(INPUT.address, 'address')}
            autoComplete="off"
            placeholder={t('venues.add.addressPlaceholder')}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />,
        )}
        <div className="yc-row2">
          <div className="yc-fld">
            <label htmlFor="ab-latitude">
              {t('venues.add.latitude')}
              <Required />
            </label>
            <input
              id="ab-latitude"
              className="yc-ctl"
              inputMode="decimal"
              aria-required="true"
              aria-invalid={Boolean(pinError)}
              aria-describedby={pinDescribed}
              placeholder="40.1843"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </div>
          <div className="yc-fld">
            <label htmlFor="ab-longitude">
              {t('venues.add.longitude')}
              <Required />
            </label>
            <input
              id="ab-longitude"
              className="yc-ctl"
              inputMode="decimal"
              aria-required="true"
              aria-invalid={Boolean(pinError)}
              aria-describedby={pinDescribed}
              placeholder="44.5129"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </div>
        </div>
        <span className="yc-help" id="ab-pin-help">
          {t('venues.add.pinHelp')}
        </span>
        {pinError ? (
          <span className="yc-err" id="ab-pin-err">
            {pinError}
          </span>
        ) : null}
        <div className="yc-fld">
          <label htmlFor="ab-tz">{t('venues.add.timeZone')}</label>
          <select id="ab-tz" className="yc-ctl" value={TIME_ZONE} onChange={() => undefined}>
            <option value={TIME_ZONE}>Asia/Yerevan (UTC+4)</option>
          </select>
        </div>
        {failure ? (
          <p className="yc-alert" role="alert">
            {failure}
          </p>
        ) : null}
        <div className="yc-dlg-foot">
          <p className="yc-legend">
            <span className="yc-req" aria-hidden="true">
              *
            </span>{' '}
            {t('venues.add.required')}
          </p>
          <div className="yc-acts">
            <button type="button" className="yc-btn yc-btn-sec" onClick={onClose} disabled={busy}>
              {t('venuePage.branchDialog.cancel')}
            </button>
            <button type="submit" className="yc-btn yc-btn-pri" aria-busy={busy}>
              {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
              {busy ? t('venuePage.branchDialog.adding') : t('venuePage.branchDialog.submit')}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
