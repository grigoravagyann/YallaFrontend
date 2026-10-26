import { useTranslation } from '@yalla/i18n';
import type { ReactNode, Ref } from 'react';
import { Icon } from './icons';

/**
 * The Book sheet's frame (Book artboard): the head with Back, the step's
 * title and Close, and the progress line under it. Shared by the steps the
 * sheet draws and by `BookingDone`, which draws its own head because only it
 * knows whether the venue has answered.
 */

export function SheetHead({
  title,
  headingRef,
  onBack,
  onClose,
}: {
  readonly title: string;
  /** The heading, which takes the focus when a step opens. */
  readonly headingRef?: Ref<HTMLHeadingElement> | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly onClose?: (() => void) | undefined;
}) {
  const { t } = useTranslation('public');
  return (
    <div className="pub-sheet-head">
      {onBack ? (
        <button type="button" className="pub-sheet-x" aria-label={t('sheet.back')} onClick={onBack}>
          <Icon name="back" />
        </button>
      ) : null}
      <h2 tabIndex={-1} ref={headingRef}>
        {title}
      </h2>
      {onClose ? (
        <button
          type="button"
          className="pub-sheet-x"
          aria-label={t('sheet.close')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      ) : null}
    </div>
  );
}

const STEPS = ['table', 'phone', 'name'] as const;

/** Table · Phone · Name, with the step the visitor is on. */
export function SheetProgress({ step }: { readonly step: 0 | 1 | 2 }) {
  const { t } = useTranslation('public');
  return (
    <ol className="pub-progress" aria-label={t('sheet.progress.label', { step: step + 1 })}>
      {STEPS.map((name, index) => (
        <li
          key={name}
          className={index < step ? 'is-done' : index === step ? 'is-current' : undefined}
          aria-current={index === step ? 'step' : undefined}
        >
          <i aria-hidden="true" />
          {t(`sheet.progress.${name}`)}
        </li>
      ))}
    </ol>
  );
}

/** A coloured line with its icon: green held, amber attention, red failure, burgundy waiting. */
export function SheetNote({
  tone,
  children,
  noteRef,
  id,
}: {
  readonly tone: 'green' | 'amber' | 'red' | 'waiting';
  readonly children: ReactNode;
  /** Focusable, for the one note that takes the focus (the table taken). */
  readonly noteRef?: Ref<HTMLDivElement> | undefined;
  readonly id?: string | undefined;
}) {
  return (
    <div
      className={`pub-note is-${tone}`}
      ref={noteRef}
      tabIndex={noteRef ? -1 : undefined}
      id={id}
    >
      <Icon name={NOTE_ICON[tone]} />
      <div>{children}</div>
    </div>
  );
}

const NOTE_ICON = {
  green: 'check',
  amber: 'alert',
  red: 'alert',
  waiting: 'send',
} as const;
