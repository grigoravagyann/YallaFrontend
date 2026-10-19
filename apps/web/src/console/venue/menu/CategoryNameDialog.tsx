import { useTranslation } from '@yalla/i18n';
import { useId, useState, type FormEvent } from 'react';
import { Dialog } from '../../ui/Dialog';

export interface CategoryNameDialogProps {
  /** The dialog's heading: "New category", or "Rename “Coffee”". */
  readonly title: string;
  /** What the field opens with: the current name when renaming, else empty. */
  readonly initialName: string;
  /** The filled button's label: Add, or Save. */
  readonly submitLabel: string;
  readonly isSaving: boolean;
  /** Called with the trimmed name; never with a blank one. */
  readonly onSubmit: (name: string) => void;
  readonly onCancel: () => void;
}

/**
 * One field in the console's dialog, for naming a category (Menu artboard).
 *
 * It replaced `window.prompt()`: a prompt is the browser's dialog, in the
 * browser's language, and in a kiosk browser often no dialog at all. This one
 * checks the one thing there is to check — a name, not blank — with the app's
 * own sentence under the field, and the focus back in it.
 */
export function CategoryNameDialog({
  title,
  initialName,
  submitLabel,
  isSaving,
  onSubmit,
  onCancel,
}: CategoryNameDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const fieldId = useId();
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [blank, setBlank] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setBlank(true);
      document.getElementById(fieldId)?.focus();
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <Dialog title={title} onClose={onCancel} dismissible={!isSaving}>
      <form className="yc-dialog-form" noValidate onSubmit={submit}>
        <div className="yc-fld">
          <label htmlFor={fieldId}>{t('menu.category.addPrompt')}</label>
          <input
            id={fieldId}
            className="yc-ctl"
            value={name}
            maxLength={80}
            autoComplete="off"
            placeholder={t('menu.category.placeholder')}
            data-autofocus=""
            aria-invalid={blank}
            {...(blank ? { 'aria-describedby': errorId } : {})}
            onChange={(event) => {
              setName(event.currentTarget.value);
              if (blank && event.currentTarget.value.trim()) setBlank(false);
            }}
          />
          {blank ? (
            <span id={errorId} className="yc-err">
              {t('menu.category.nameRequired')}
            </span>
          ) : null}
        </div>
        <div className="yc-acts">
          <button
            type="button"
            className="yc-btn yc-btn-sec"
            disabled={isSaving}
            onClick={onCancel}
          >
            {t('common:action.cancel')}
          </button>
          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={isSaving}>
            {isSaving ? t('saving') : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
