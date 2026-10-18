/**
 * A short, soft two-note chime for a booking request that has just arrived.
 *
 * Synthesised with the Web Audio API rather than played from a file: nothing to
 * download, nothing to cache for offline, and the volume is a number here
 * rather than whatever a sound file was mastered at.
 *
 * Browsers refuse sound until the page has had a gesture. The tablet always
 * has one — a PIN is typed to open this screen — so the context is created, or
 * woken, on the first tap ({@link primeChime}), and a chime before that simply
 * does not sound. Every failure is silent: the visual pulse and the screen
 * reader's announcement carry the same news, and an error about a missing
 * beep is worse than the missing beep.
 */

type AudioContextCtor = new () => AudioContext;

let context: AudioContext | null = null;

const RESUME_WAIT_MS = 300;

function contextClass(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function audio(): AudioContext | null {
  if (context) return context;
  const Ctor = contextClass();
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

function stateOf(ctx: AudioContext): AudioContextState {
  return ctx.state;
}

/** Create or wake the audio context inside a user gesture, so a later chime may sound. */
export function primeChime(): void {
  const ctx = audio();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

/**
 * Play the chime. Resolves `true` when it was scheduled, `false` when the
 * browser would not let it sound — never rejects.
 */
export async function playChime(): Promise<boolean> {
  try {
    const ctx = audio();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      // Without a gesture some browsers leave `resume` pending for ever; the
      // chime is worth a moment's wait, not a promise that never settles.
      await Promise.race([
        ctx.resume(),
        new Promise((resolve) => setTimeout(resolve, RESUME_WAIT_MS)),
      ]);
      // Still suspended: no gesture yet, and that is the browser's call. Read
      // afresh — `resume` changes it behind the type checker's back.
      if (stateOf(ctx) !== 'running') return false;
    }

    const start = ctx.currentTime + 0.01;
    // Two notes a sixth apart, quiet and short: noticed across a counter,
    // never startling at a table.
    for (const [offset, frequency] of [
      [0, 659.25],
      [0.16, 1046.5],
    ] as const) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const at = start + offset;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.45);
    }
    return true;
  } catch {
    return false;
  }
}
