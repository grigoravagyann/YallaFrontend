import type { StaffMember } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useId, useRef } from 'react';
import { useDialogFocus } from '../../../components/useDialogFocus';

export interface DeactivateDialogProps {
  readonly member: StaffMember;
  readonly isSaving: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * "Deactivate Ani?", asked before it happens.
 *
 * Deactivating was one tap in an overflow menu, immediate, and the card was
 * gone with nothing said. The way back exists — Show deactivated, Reactivate —
 * but it is a recovery, not an undo, and the item next to Deactivate in that
 * menu is Reset PIN. Cancel is first, so the dialog opens on the safe choice.
 */
export function DeactivateDialog({ member, isSaving, onConfirm, onCancel }: DeactivateDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancel = useCallback(() => onCancel(), [onCancel]);
  useDialogFocus(dialogRef, { onEscape: cancel, escapeEnabled: !isSaving });

  return (
    <div className="scrim" role="presentation">
      <div
        ref={dialogRef}
        className="card dialog-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h3 id={titleId}>{t('staff.deactivate.title', { name: member.fullName })}</h3>
        <p id={bodyId} className="muted">
          {t('staff.deactivate.body')}
        </p>
        <div className="actions">
          <button
            type="button"
            className="button button-ghost"
            disabled={isSaving}
            onClick={onCancel}
          >
            {t('common:action.cancel')}
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={isSaving}
            onClick={onConfirm}
          >
            {isSaving ? t('saving') : t('staff.deactivate.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
