import { useEffect } from 'react';

/**
 * The browser's own "leave this page?" prompt, while there is unsaved work.
 *
 * Every explicit-save screen in the venue section uses it, and they are all
 * explicit-save for the same reason: their endpoints replace the whole thing at
 * once. Extracted from the floor plan editor when the hours and policy screens
 * needed the same three lines — a fourth copy would have been the one that
 * forgot the cleanup and left the prompt firing on a clean page.
 *
 * A navigation guard rather than persistence, deliberately. Nothing here
 * touches web storage: a half-edited week kept across a reload is a week
 * somebody comes back to next month, does not recognise, and saves.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by browsers that predate `preventDefault` being enough. The
      // string itself has been ignored for years; its presence has not.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
