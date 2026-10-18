import { useTranslation } from '@yalla/i18n';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircleIcon, CheckIcon } from './icons';

/** How long a toast stays, in ms, per the artboards' `say()`. */
export const TOAST_MS = 3500;
/** Longer when it carries an undo: there has to be time to reach it. */
export const TOAST_UNDO_MS = 7000;

export interface ToastOptions {
  /**
   * Puts an Undo on the toast. Every destructive or suspending action in the
   * console offers one (HANDOFF section 4). Pressing it removes the toast and
   * runs this; the undo is free to say a toast of its own.
   */
  readonly undo?: () => void;
  /**
   * Moves the focus to Undo, as the artboards do after a delete, so a keyboard
   * user can take it back with one key. The focus returns to where it was if
   * the toast goes while still holding it.
   */
  readonly focusUndo?: boolean;
  /**
   * Where the focus goes when the toast that took it leaves and the element it
   * came from is gone — a deleted row's button. Without it, the focus would be
   * left on <body>.
   */
  readonly fallbackFocus?: () => HTMLElement | null;
  /**
   * `error`: a failure. Said in an assertive region (`role="alert"`), with the
   * alert icon — never with the tick of a confirmation.
   */
  readonly tone?: 'error';
}

export interface ToastApi {
  readonly say: (message: string, options?: ToastOptions) => void;
  readonly dismiss: () => void;
}

interface Shown {
  readonly id: number;
  readonly message: string;
  readonly undo: (() => void) | null;
  readonly focusUndo: boolean;
  readonly fallbackFocus: (() => HTMLElement | null) | null;
  readonly error: boolean;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * The console's toast, one at a time.
 *
 * The live region is rendered before anything is said and stays: a region
 * inserted together with its text is announced by some screen readers and not
 * by others. A new toast replaces the current one, as in the artboards.
 *
 * The clock stops while the pointer is over the toast or the focus is in it,
 * and starts again in full when they leave, so nobody loses an undo while
 * reading it.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation(['admin', 'common']);
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);
  const toastRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  /** Where the focus was before a toast's Undo took it; where it goes back to. */
  const returnTo = useRef<{
    readonly id: number;
    /** `null` when nothing had the focus: then only the fallback is left. */
    readonly element: HTMLElement | null;
    readonly fallback: (() => HTMLElement | null) | null;
  } | null>(null);
  const held = useRef({ hover: false, focus: false });

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    stop();
    setShown(null);
  }, [stop]);

  const start = useCallback(
    (withUndo: boolean) => {
      stop();
      timer.current = setTimeout(
        () => {
          timer.current = null;
          setShown(null);
        },
        withUndo ? TOAST_UNDO_MS : TOAST_MS,
      );
    },
    [stop],
  );

  const say = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      held.current = { hover: false, focus: false };
      setShown({
        id,
        message,
        undo: options.undo ?? null,
        focusUndo: Boolean(options.undo && options.focusUndo),
        fallbackFocus: options.fallbackFocus ?? null,
        error: options.tone === 'error',
      });
      start(Boolean(options.undo));
    },
    [start],
  );

  useEffect(() => {
    // The toast that took the focus is gone (dismissed, timed out or replaced):
    // hand the focus back rather than leave it on <body>. Only then, and only
    // if nothing else has taken it — an undo that focuses its own row wins.
    const owed = returnTo.current;
    if (owed && owed.id !== shown?.id) {
      returnTo.current = null;
      const active = document.activeElement;
      if (!active || active === document.body) {
        // The element it came from may be gone with what was deleted.
        (owed.element?.isConnected ? owed.element : owed.fallback?.())?.focus();
      }
    }
    // Take the focus once the toast that asked for it is on screen.
    if (!shown?.focusUndo) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !toastRef.current?.contains(active)) {
      returnTo.current = {
        id: shown.id,
        element: active instanceof HTMLElement && active !== document.body ? active : null,
        fallback: shown.fallbackFocus,
      };
    }
    undoRef.current?.focus();
  }, [shown]);

  useEffect(() => stop, [stop]);

  const hold = (key: 'hover' | 'focus', on: boolean) => {
    held.current = { ...held.current, [key]: on };
    if (!shown) return;
    if (held.current.hover || held.current.focus) stop();
    else start(Boolean(shown.undo));
  };

  const api = useMemo<ToastApi>(() => ({ say, dismiss }), [say, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="yc yc-toast-region" role="status" aria-live="polite">
        {shown && !shown.error ? (
          <div
            key={shown.id}
            ref={toastRef}
            className="yc-toast"
            onMouseEnter={() => hold('hover', true)}
            onMouseLeave={() => hold('hover', false)}
            onFocus={() => hold('focus', true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                hold('focus', false);
              }
            }}
          >
            <CheckIcon />
            <span>{shown.message}</span>
            {shown.undo ? (
              <button
                ref={undoRef}
                type="button"
                className="yc-tbtn"
                onClick={() => {
                  const undo = shown.undo;
                  dismiss();
                  undo?.();
                }}
              >
                {t('toast.undo')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* Failures, said at once; present before anything is said, like the polite one. */}
      <div className="yc yc-toast-region" aria-live="assertive">
        {shown?.error ? (
          <div key={shown.id} className="yc-toast is-error" role="alert">
            <AlertCircleIcon />
            <span>{shown.message}</span>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

/** The toast of the console shell this component is rendered in. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast() needs a <ToastProvider> above it.');
  return api;
}
