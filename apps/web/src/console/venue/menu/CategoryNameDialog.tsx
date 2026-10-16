import { useTranslation } from '@yalla/i18n';
import { useCallback, useId, useRef, useState, type FormEvent } from 'react';
import { useDialogFocus } from '../../../components/useDialogFocus';

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
 * One field in a dialog, for naming a category.
 *
 * This replaced `window.prompt()`. A prompt is the browser's dialog, in the
 * browser's language, and in an embedded webview or a kiosk browser it is
 * often no dialog at all: the call throws, the click does nothing visible, and
 * the person adding a category has no idea why. This one follows the console's
 * own dialog rules — scrim, focus kept inside, Escape to cancel, focus back on
 * the button that opened it — and checks the one thing there is to check (a
 * name, not blank) with the app's own sentence.
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
  const titleId = useId();
  const fieldId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initialName);
  const [blank, setBlank] = useState(false);

  const cancel = useCallback(() => onCancel(), [onCancel]);
  useDialogFocus(dialogRef, { onEscape: cancel, escapeEnabled: !isSaving });

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setBlank(true);
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <div className="scrim" role="presentation">
      <div
        ref={dialogRef}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <form onSubmit={submit} className="dialog-form">
          <h3 id={titleId}>{title}</h3>
          <div className="labelled">
            <label htmlFor={fieldId}>{t('menu.category.addPrompt')}</label>
            <input
              id={fieldId}
              className="field"
              value={name}
              maxLength={80}
              autoComplete="off"
              {...(blank ? { 'aria-describedby': errorId, 'aria-invalid': true } : {})}
              onChange={(event) => {
                setName(event.currentTarget.value);
                if (blank && event.currentTarget.value.trim()) setBlank(false);
              }}
            />
            {blank ? (
              <span id={errorId} className="field-error" role="alert">
                {t('menu.category.nameRequired')}
              </span>
            ) : null}
          </div>
          <div className="actions">
            <button type="submit" className="button button-primary" disabled={isSaving}>
              {isSaving ? t('saving') : submitLabel}
            </button>
            <button
              type="button"
              className="button button-ghost"
              disabled={isSaving}
              onClick={onCancel}
            >
              {t('common:action.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
