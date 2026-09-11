import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** The controls inside `container` a Tab can land on, in document order. */
export function focusablesIn(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    // A radio group is one tab stop: only its checked member, or its first.
    (element) =>
      !(element instanceof HTMLInputElement) ||
      element.type !== 'radio' ||
      element.checked ||
      !container.querySelector(`input[type="radio"][name="${element.name}"]:checked`),
  );
}

export interface DialogFocusOptions {
  /** What Escape does. */
  readonly onEscape: () => void;
  /**
   * Off while a save is in flight: the person may already exist, and the
   * credential that proves it has to reach the next dialog.
   */
  readonly escapeEnabled?: boolean;
}

/**
 * The focus rules of a modal dialog, which no dialog here had before.
 *
 * - On open, focus moves to the first control inside.
 * - Tab and Shift+Tab cycle inside the dialog rather than walking out into a
 *   page the scrim says is unavailable.
 * - Escape runs `onEscape`.
 * - On close, focus goes back to whatever had it when the dialog opened —
 *   usually the button that opened it — so a keyboard user is not dropped at
 *   the top of the document.
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  { onEscape, escapeEnabled = true }: DialogFocusOptions,
) {
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusablesIn(containerRef.current)[0]?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [containerRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (event.key === 'Escape') {
        if (!escapeEnabled) return;
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = focusablesIn(container);
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      const outside = !container.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [containerRef, onEscape, escapeEnabled]);
}
