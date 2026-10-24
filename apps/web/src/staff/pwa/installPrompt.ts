import { useSyncExternalStore } from 'react';

/**
 * Android's "Install app", kept for the button that asks for it.
 *
 * Chrome fires `beforeinstallprompt` once, early, whenever it decides the app
 * is installable, and the prompt can only be shown from a tap after that. So
 * the event is caught here at module load — this module is imported with the
 * staff app — and kept until the Install screen's button uses it.
 *
 * iOS has no such event: its Install screen explains Share → Add to Home
 * Screen instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  /** The deferred prompt, while Chrome offers one. */
  readonly prompt: BeforeInstallPromptEvent | null;
  /** Installed during this visit (`appinstalled`). */
  readonly installed: boolean;
}

let state: InstallState = { prompt: null, installed: false };
const listeners = new Set<() => void>();

function set(next: InstallState): void {
  state = next;
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Kept for the button, rather than shown as the browser's own mini bar.
    event.preventDefault();
    set({ ...state, prompt: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => set({ prompt: null, installed: true }));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface InstallPrompt {
  /** Chrome will show its install dialog from a tap. */
  readonly available: boolean;
  readonly installed: boolean;
  /** Show it. Answers whether the person accepted. */
  readonly install: () => Promise<boolean>;
}

export function useInstallPrompt(): InstallPrompt {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  return {
    available: current.prompt !== null,
    installed: current.installed,
    install: async () => {
      const prompt = current.prompt;
      if (!prompt) return false;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      // A prompt is good for one showing, whatever the answer.
      set({ prompt: null, installed: choice.outcome === 'accepted' || state.installed });
      return choice.outcome === 'accepted';
    },
  };
}

/** Test seam: what a browser would hand over. */
export function offerInstallPromptForTest(event: BeforeInstallPromptEvent | null): void {
  set({ prompt: event, installed: false });
}
