import type { StaffMember } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Dialog } from '../../ui/Dialog';

export interface DeactivateDialogProps {
  readonly member: StaffMember;
  readonly isSaving: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** The row's ⋮ button: the menu item that opened this is gone. */
  readonly returnFocusTo?: () => HTMLElement | null;
}

/**
 * "Deactivate Ani?", asked before it happens (Staff artboard).
 *
 * The way back exists — Show deactivated, Reactivate, and the toast's Undo —
 * but the item next to Deactivate in that menu is New PIN, so it is asked.
 * Cancel is first and has the focus, so the dialog opens on the safe choice.
 */
export function DeactivateDialog({
  member,
  isSaving,
  onConfirm,
  onCancel,
  returnFocusTo,
}: DeactivateDialogProps) {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <Dialog
      alert
      title={t('staff.deactivate.title', { name: member.fullName })}
      description={t('staff.deactivate.body')}
      onClose={isSaving ? () => undefined : onCancel}
      dismissible={!isSaving}
      {...(returnFocusTo ? { returnFocusTo } : {})}
    >
      <div className="yc-acts">
        <button
          type="button"
          className="yc-btn yc-btn-sec"
          data-autofocus=""
          disabled={isSaving}
          onClick={onCancel}
        >
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          className="yc-btn yc-btn-danger"
          aria-busy={isSaving}
          onClick={() => {
            if (!isSaving) onConfirm();
          }}
        >
          {isSaving ? <span className="yc-spin" aria-hidden="true" /> : null}
          {t('staff.deactivate.confirm')}
        </button>
      </div>
    </Dialog>
  );
}
