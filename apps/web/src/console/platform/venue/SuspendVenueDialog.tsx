import type { ConsoleVenueDetail } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { useSuspendVenue } from '../../../data/queries';
import { newCommandId } from '../../../lib/commandId';
import { Dialog } from '../../ui/Dialog';

export interface SuspendVenueDialogProps {
  readonly venue: ConsoleVenueDetail;
  readonly onClose: () => void;
  readonly onSuspended: () => void;
}

/**
 * Suspend, after one sentence of what it does (VenueDetail artboard). The
 * safe choice holds the focus; the toast that follows offers the undo.
 */
export function SuspendVenueDialog({ venue, onClose, onSuspended }: SuspendVenueDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const suspend = useSuspendVenue();
  const [failure, setFailure] = useState<string | null>(null);
  const busy = suspend.isPending;

  async function confirm() {
    if (busy) return;
    setFailure(null);
    try {
      await suspend.mutateAsync({ venueId: venue.id, commandId: newCommandId() });
      onSuspended();
    } catch {
      setFailure(t('venue.failed'));
    }
  }

  return (
    <Dialog
      alert
      title={t('venuePage.suspendDialog.title', { name: venue.name })}
      description={t('venuePage.suspendDialog.body')}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
    >
      {failure ? (
        <p className="yc-alert" role="alert">
          {failure}
        </p>
      ) : null}
      <div className="yc-acts">
        <button
          type="button"
          className="yc-btn yc-btn-sec"
          data-autofocus=""
          onClick={onClose}
          disabled={busy}
        >
          {t('venuePage.suspendDialog.cancel')}
        </button>
        <button
          type="button"
          className="yc-btn yc-btn-danger"
          aria-busy={busy}
          onClick={() => void confirm()}
        >
          {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
          {t('venuePage.suspendDialog.confirm')}
        </button>
      </div>
    </Dialog>
  );
}
