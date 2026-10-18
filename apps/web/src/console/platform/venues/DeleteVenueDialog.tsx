import { VenueDeletionBlockedError, type ConsoleVenue } from '@yalla/api';
import { Trans, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useDeleteVenue, useSuspendVenue } from '../../../data/queries';
import { newCommandId } from '../../../lib/commandId';
import { Dialog } from '../../ui/Dialog';

export interface DeleteVenueDialogProps {
  readonly venue: ConsoleVenue;
  readonly onClose: () => void;
  /** The venue is deleted: the list offers its undo. */
  readonly onDeleted: (venue: ConsoleVenue) => void;
  /** Suspended instead, from the refusal: the list offers its undo. */
  readonly onSuspendedInstead: (venue: ConsoleVenue) => void;
  readonly returnFocusTo: () => HTMLElement | null;
}

/** How many tables or codes a refusal lists before it says "+N". */
const SHOWN = 3;

interface Blocked {
  readonly tables: readonly string[];
  readonly bookings: readonly string[];
}

/**
 * Delete a venue: soft, with the name typed to confirm (HANDOFF section 3).
 *
 * The server refuses while a tab is open or a booking is still to come
 * (`venue-deletion-blocked`); the refusal says which tables and which booking
 * codes, and offers to suspend instead, which hides the venue at once and keeps
 * everything. A deleted venue stays in the list under "Deleted", and the toast
 * that follows offers its undo.
 *
 * The button is never `disabled`: a disabled button cannot take the focus or
 * say why. It is `aria-disabled` until the name matches, and pressing it then
 * puts the cursor back in the field.
 */
export function DeleteVenueDialog({
  venue,
  onClose,
  onDeleted,
  onSuspendedInstead,
  returnFocusTo,
}: DeleteVenueDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const remove = useDeleteVenue();
  const suspend = useSuspendVenue();
  const [typed, setTyped] = useState('');
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const blockedId = useId();
  const commandId = useRef(newCommandId());

  const matches = typed.trim() === venue.name;
  const busy = remove.isPending || suspend.isPending;

  useEffect(() => {
    if (blocked) closeRef.current?.focus();
  }, [blocked]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!matches) {
      fieldRef.current?.focus();
      return;
    }
    setFailure(null);
    try {
      await remove.mutateAsync({ venueId: venue.id, commandId: commandId.current });
      onDeleted(venue);
    } catch (error) {
      if (error instanceof VenueDeletionBlockedError) {
        setBlocked({ tables: error.openTables, bookings: error.futureBookings });
        return;
      }
      setFailure(t('venue.failed'));
    }
  }

  async function suspendInstead() {
    if (busy) return;
    setFailure(null);
    try {
      await suspend.mutateAsync({ venueId: venue.id, commandId: newCommandId() });
      onSuspendedInstead(venue);
    } catch {
      setFailure(t('venue.failed'));
    }
  }

  const failureLine = failure ? (
    <p className="yc-alert" role="alert">
      {failure}
    </p>
  ) : null;

  if (blocked) {
    const list = (items: readonly string[], label: (item: string) => string) => (
      <ul className="yc-blist">
        {items.slice(0, SHOWN).map((item) => (
          <li key={item}>{label(item)}</li>
        ))}
        {items.length > SHOWN ? (
          <li>{t('venues.deleteDialog.more', { count: items.length - SHOWN })}</li>
        ) : null}
      </ul>
    );
    const nothingNamed = blocked.tables.length === 0 && blocked.bookings.length === 0;
    return (
      <Dialog
        alert
        title={t('venues.deleteDialog.blockedTitle', { name: venue.name })}
        describedBy={blockedId}
        onClose={busy ? () => undefined : onClose}
        dismissible={!busy}
        returnFocusTo={returnFocusTo}
      >
        <p id={blockedId}>{t('venues.deleteDialog.blockedBody')}</p>
        {blocked.tables.length > 0 ? (
          <div className="yc-bbox">
            <h3>{t('venues.deleteDialog.tables', { count: blocked.tables.length })}</h3>
            {list(blocked.tables, (table) => t('venue.blocked.table', { table }))}
          </div>
        ) : null}
        {blocked.bookings.length > 0 ? (
          <div className="yc-bbox">
            <h3>{t('venues.deleteDialog.bookings', { count: blocked.bookings.length })}</h3>
            {list(blocked.bookings, (code) => code)}
          </div>
        ) : null}
        {nothingNamed ? <p className="yc-alert">{t('venue.blocked.unknown')}</p> : null}
        <p>{t('venues.deleteDialog.blockedHint')}</p>
        {failureLine}
        <div className="yc-acts">
          <button
            ref={closeRef}
            type="button"
            className="yc-btn yc-btn-sec"
            data-autofocus=""
            onClick={onClose}
          >
            {t('venues.deleteDialog.close')}
          </button>
          {venue.status === 'active' ? (
            <button
              type="button"
              className="yc-btn yc-btn-pri"
              aria-busy={suspend.isPending}
              onClick={() => void suspendInstead()}
            >
              {suspend.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
              {t('venues.deleteDialog.suspendInstead')}
            </button>
          ) : null}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      alert
      title={t('venues.deleteDialog.title', { name: venue.name })}
      description={t('venues.deleteDialog.body')}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
      returnFocusTo={returnFocusTo}
    >
      <form className="yc-form" noValidate onSubmit={(event) => void submit(event)}>
        <div className="yc-fld">
          <label htmlFor={`${hintId}-field`}>
            <Trans
              i18nKey="venues.deleteDialog.typeName"
              ns="admin"
              values={{ name: venue.name }}
              components={{ b: <b /> }}
            />
          </label>
          <input
            ref={fieldRef}
            id={`${hintId}-field`}
            className="yc-ctl"
            data-autofocus=""
            autoComplete="off"
            spellCheck={false}
            value={typed}
            aria-describedby={hintId}
            onChange={(event) => setTyped(event.target.value)}
          />
          <span className="yc-help" id={hintId}>
            {typed && !matches
              ? t('venues.deleteDialog.hintMismatch')
              : t('venues.deleteDialog.hintCase')}
          </span>
        </div>
        {failureLine}
        <div className="yc-acts">
          <button type="button" className="yc-btn yc-btn-sec" onClick={onClose} disabled={busy}>
            {t('venues.deleteDialog.cancel')}
          </button>
          <button
            type="submit"
            className="yc-btn yc-btn-danger"
            aria-disabled={!matches}
            aria-busy={remove.isPending}
          >
            {remove.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
            {remove.isPending
              ? t('venues.deleteDialog.checking')
              : t('venues.deleteDialog.confirm')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
