import { useTranslation } from '@yalla/i18n';
import { useEffect } from 'react';

/**
 * A "leave without saving?" question, while there is unsaved work.
 *
 * Every explicit-save screen in the venue section uses it, and they are all
 * explicit-save for the same reason: their endpoints replace the whole thing at
 * once. Extracted from the floor plan editor when the hours and policy screens
 * needed the same three lines — a fourth copy would have been the one that
 * forgot the cleanup and left the prompt firing on a clean page.
 *
 * It covers three ways out:
 * - closing or reloading the tab, through the browser's own `beforeunload`
 *   prompt;
 * - a link inside the app (the section nav, a breadcrumb, a checklist item),
 *   by asking before the router sees the click. The app runs on a
 *   `BrowserRouter` (see `bootstrap.tsx`), which has no `useBlocker`, so the
 *   click is stopped on its way down instead;
 * - anything else that would throw the screen away, such as the branch
 *   switcher, by calling {@link confirmLeave} first.
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

/**
 * Whether it is fine to throw the current screen away: `true` straight away
 * when nothing is unsaved, otherwise the person's answer to "leave without
 * saving?".
 */
export function confirmLeave(): boolean {
  const message = guards.values().next().value;
  if (message === undefined) return true;
  return window.confirm(message);
}

/** The screens with unsaved work right now, each with the question in the reader's language. */
const guards = new Map<symbol, string>();

function warnOnUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Required by browsers that predate `preventDefault` being enough. The
  // string itself has been ignored for years; its presence has not.
  event.returnValue = '';
}

/**
 * A click on a link to another page of this app. Caught on the document in the
 * capture phase, before React's own listener on the root, so a "stay" stops the
 * router from ever seeing it.
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
  if (confirmLeave()) return;
  event.preventDefault();
  event.stopPropagation();
}

function install() {
  window.addEventListener('beforeunload', warnOnUnload);
  document.addEventListener('click', askOnLinkClick, true);
}

function uninstall() {
  window.removeEventListener('beforeunload', warnOnUnload);
  document.removeEventListener('click', askOnLinkClick, true);
}
