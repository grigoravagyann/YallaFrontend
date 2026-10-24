import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef } from 'react';

export interface PhoneKeypadProps {
  /** How many digits are in: drawn as dots, never as the digits. */
  readonly length: number;
  readonly onDigit: (digit: string) => void;
  readonly onDelete: () => void;
  /** Off while a PIN is being checked, offline, or locked out. */
  readonly disabled: boolean;
  /** The last four were wrong: the dots say so until the next tap. */
  readonly wrong?: boolean | undefined;
  /** The pairing screen's keys are on white; the PIN screen's on the cherry. */
  readonly tone: 'light' | 'dark';
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

/**
 * Four dots and a 3×4 pad for one thumb (the Main and Pin artboards): keys a
 * full third of the width and 64px tall, the bottom-left blank, ⌫ on the right.
 *
 * A docked keyboard works it too — the digit keys and Backspace — unless a
 * field has the keys.
 */
export function PhoneKeypad(props: PhoneKeypadProps) {
  const { t } = useTranslation(['staff']);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = latest.current;
      if (current.disabled || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (/^[0-9]$/u.test(event.key)) {
        event.preventDefault();
        current.onDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        current.onDelete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`ph-pad is-${props.tone}`}>
      <output
        className={`ph-pad-dots${props.wrong && props.length === 0 ? ' is-wrong' : ''}`}
        aria-label={t('pin.entered', { count: props.length })}
      >
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={index < props.length ? 'is-filled' : undefined} />
        ))}
      </output>
      <div className="ph-pad-keys" role="group" aria-label={t('pin.keypad')}>
        {KEYS.map((key, index) =>
          key === '' ? (
            <span key={`blank-${index}`} className="ph-pad-blank" aria-hidden="true" />
          ) : (
            <button
              key={key}
              type="button"
              className={key === 'del' ? 'ph-pad-key is-fn' : 'ph-pad-key'}
              disabled={props.disabled}
              aria-label={key === 'del' ? t('cash.delete') : key}
              onClick={() => (key === 'del' ? props.onDelete() : props.onDigit(key))}
            >
              {key === 'del' ? '⌫' : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
