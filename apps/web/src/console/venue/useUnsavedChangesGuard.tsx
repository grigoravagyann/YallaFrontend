import { useTranslation } from '@yalla/i18n';
import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '../ui/Dialog';

/**
 * A "leave without saving?" question, while there is unsaved work.
 *
 * Every explicit-save screen in the venue section uses it, and they are all
 * explicit-save for the same reason: their endpoints replace the whole thing at
 * once.
 *
 * It covers three ways out:
 * - closing or reloading the tab, through the browser's own `beforeunload`
 *   prompt — the one question a page cannot ask in its own words;
 * - a link inside the app (the section nav, a breadcrumb, a checklist item):
 *   the click is stopped on its way down, before the router sees it, and the
 *   question is asked in the console's own dialog ({@link UnsavedChangesHost},
 *   rendered by the layouts). The app runs on a `BrowserRouter` (see
 *   `bootstrap.tsx`), which has no `useBlocker`, hence the capture listener;
 * - anything else that would throw the screen away, such as the branch
 *   switcher, by asking {@link hasUnsavedChanges} and putting its own dialog up.
 *
 * A navigation guard rather than persistence, deliberately. Nothing here
 * touches web storage: a half-edited week kept across a reload is a week
 * somebody comes back to next month, does not recognise, and saves.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  const { t } = useTranslation('admin');
  const message = t('unsavedChanges.leave');

  useEffect(() => {
    if (!dirty) return;
    const id = Symbol('unsaved');
    guards.set(id, message);
    if (guards.size === 1) install();
    return () => {
      guards.delete(id);
      if (guards.size === 0) uninstall();
    };
  }, [dirty, message]);
}

/** Whether any screen holds unsaved work right now. */
export function hasUnsavedChanges(): boolean {
  return guards.size > 0;
}

/**
 * The console's "Leave without saving?" for a link click over unsaved work.
 * Rendered once by each layout; it shows only while a click is waiting for
 * an answer.
 */
export function UnsavedChangesHost() {
  const { t } = useTranslation(['admin', 'common']);
  const navigate = useNavigate();
  const waiting = useSyncExternalStore(subscribe, () => pending);
  if (!waiting) return null;
  const message = guards.values().next().value ?? t('unsavedChanges.leave');
  return (
    <Dialog alert title={t('unsavedChanges.leaveTitle')} description={message} onClose={stay}>
      <div className="yc-acts">
        <button type="button" className="yc-btn yc-btn-sec" data-autofocus="" onClick={stay}>
          {t('unsavedChanges.stay')}
        </button>
        <button
          type="button"
          className="yc-btn yc-btn-pri"
          onClick={() => {
            const to = waiting.to;
            setPending(null);
            void navigate(to);
          }}
        >
          {t('unsavedChanges.leaveConfirm')}
        </button>
      </div>
    </Dialog>
  );
}

/** The screens with unsaved work right now, each with the question in the reader's language. */
const guards = new Map<symbol, string>();

/** A link click waiting for "stay" or "leave". */
let pending: { readonly to: string } | null = null;
const listeners = new Set<() => void>();

function setPending(next: { readonly to: string } | null) {
  pending = next;
  for (const listener of listeners) listener();
}

function stay() {
  setPending(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function warnOnUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Required by browsers that predate `preventDefault` being enough. The
  // string itself has been ignored for years; its presence has not.
  event.returnValue = '';
}

/**
 * A click on a link to another page of this app. Caught on the document in the
 * capture phase, before React's own listener on the root, so the router never
 * sees it; the dialog navigates if the person chooses to leave.
 */
function askOnLinkClick(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || anchor.hasAttribute('download')) return;
  if (anchor.target && anchor.target !== '_self') return;
  const url = new URL(anchor.href, window.location.href);
  // Another site is a page unload, which `beforeunload` already covers.
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return;
  if (guards.size === 0) return;
  event.preventDefault();
  event.stopPropagation();
  setPending({ to: `${url.pathname}${url.search}${url.hash}` });
}

function install() {
  window.addEventListener('beforeunload', warnOnUnload);
  document.addEventListener('click', askOnLinkClick, true);
}

function uninstall() {
  window.removeEventListener('beforeunload', warnOnUnload);
  document.removeEventListener('click', askOnLinkClick, true);
  setPending(null);
}
