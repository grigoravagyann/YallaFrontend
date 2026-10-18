import {
  SlugTakenError,
  ValidationError,
  type ConsoleVenueDetail,
  type VenueType,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useRef, useState, type FormEvent } from 'react';
import { useUpdateVenue } from '../../../data/queries';
import { newCommandId } from '../../../lib/commandId';
import { Dialog } from '../../ui/Dialog';
import { SLUG_SHAPE } from '../venues/venueList';
import { Required, VENUE_TYPES, usePendingFocus, useVenueTypeLabel } from './venueFields';

export interface EditVenueDialogProps {
  readonly venue: ConsoleVenueDetail;
  readonly onClose: () => void;
  /** Saved; `previous` is what an undo puts back. */
  readonly onSaved: (previous: { name: string; slug: string; type: VenueType }) => void;
}

/**
 * The venue's name, web address and type (VenueDetail artboard).
 *
 * Moving the web address is said before it is saved: the old
 * `yalla.am/{slug}` stops working, printed QR codes included. A web address
 * another venue has is refused under the field, by the server — the client
 * cannot see every venue's address from here.
 */
export function EditVenueDialog({ venue, onClose, onSaved }: EditVenueDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const typeLabel = useVenueTypeLabel();
  const update = useUpdateVenue();
  const commandId = useRef(newCommandId());
  const focusLater = usePendingFocus();

  const [name, setName] = useState(venue.name);
  const [slug, setSlug] = useState(venue.slug);
  const [type, setType] = useState<VenueType>(venue.type);
  const [tried, setTried] = useState(false);
  const [taken, setTaken] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const nameError = name.trim() ? null : t('venuePage.editDialog.nameRequired');
  const slugError = !slug
    ? t('venuePage.editDialog.slugRequired')
    : !SLUG_SHAPE.test(slug)
      ? t('venues.add.error.slugShape')
      : taken === slug
        ? t('venues.add.error.slugTaken', { slug })
        : null;
  const showName = tried && nameError !== null;
  const showSlug = (tried || taken === slug) && slugError !== null;
  const moved = slug !== venue.slug && slugError === null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (update.isPending) return;
    setTried(true);
    if (nameError || slugError) {
      focusLater(nameError ? 'ev-name' : 'ev-slug');
      return;
    }
    setFailure(null);
    try {
      await update.mutateAsync({
        venueId: venue.id,
        commandId: commandId.current,
        name: name.trim(),
        slug,
        type,
      });
      onSaved({ name: venue.name, slug: venue.slug, type: venue.type });
    } catch (caught) {
      if (caught instanceof SlugTakenError) {
        setTaken(slug);
        focusLater('ev-slug');
        return;
      }
      setFailure(
        caught instanceof ValidationError && caught.field
          ? t('venues.add.error.field', { field: caught.field, detail: caught.message })
          : t('venue.failed'),
      );
    }
  }

  const busy = update.isPending;
  return (
    <Dialog
      title={t('venuePage.editDialog.title')}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
    >
      <form className="yc-form" noValidate onSubmit={(event) => void submit(event)}>
        <div className="yc-fld">
          <label htmlFor="ev-name">
            {t('venuePage.editDialog.name')}
            <Required />
          </label>
          <input
            id="ev-name"
            className="yc-ctl"
            data-autofocus=""
            aria-required="true"
            aria-invalid={showName}
            {...(showName ? { 'aria-describedby': 'ev-name-err' } : {})}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {showName ? (
            <span className="yc-err" id="ev-name-err">
              {nameError}
            </span>
          ) : null}
        </div>
        <div className="yc-fld">
          <label htmlFor="ev-slug">
            {t('venuePage.editDialog.slug')}
            <Required />
          </label>
          <div className={showSlug ? 'yc-pre is-bad' : 'yc-pre'}>
            <span aria-hidden="true">yalla.am/</span>
            <input
              id="ev-slug"
              aria-required="true"
              aria-invalid={showSlug}
              aria-describedby={[moved ? 'ev-slug-warn' : '', showSlug ? 'ev-slug-err' : '']
                .filter(Boolean)
                .join(' ')}
              autoComplete="off"
              spellCheck={false}
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/\s+/gu, '-'))}
            />
          </div>
          {moved ? (
            <span className="yc-warn" id="ev-slug-warn">
              {t('venuePage.editDialog.slugWarn', { slug: venue.slug })}
            </span>
          ) : null}
          {showSlug ? (
            <span className="yc-err" id="ev-slug-err">
              {slugError}
            </span>
          ) : null}
        </div>
        <div className="yc-fld">
          <label htmlFor="ev-type">{t('venuePage.editDialog.type')}</label>
          <select
            id="ev-type"
            className="yc-ctl"
            value={type}
            onChange={(event) => setType(event.target.value as VenueType)}
          >
            {VENUE_TYPES.map((value) => (
              <option key={value} value={value}>
                {typeLabel(value)}
              </option>
            ))}
          </select>
        </div>
        {failure ? (
          <p className="yc-alert" role="alert">
            {failure}
          </p>
        ) : null}
        <div className="yc-acts">
          <button type="button" className="yc-btn yc-btn-sec" onClick={onClose} disabled={busy}>
            {t('venuePage.editDialog.cancel')}
          </button>
          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={busy}>
            {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
            {busy ? t('venuePage.editDialog.saving') : t('venuePage.editDialog.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
