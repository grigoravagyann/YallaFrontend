import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForFontFaces, type FontFaceSetLike } from './fontFaces';

/**
 * On the web export the static HTML already carries the @font-face rules, so
 * `useFonts` reports the fonts loaded the moment the page hydrates — before the
 * files have arrived. Every cold load painted two or three seconds of serif
 * text and empty icon boxes. The first frame now also waits for the browser to
 * have the faces, up to a ceiling.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function fontSet(): FontFaceSetLike & { finish: () => void; asked: string[] } {
  let finish = () => undefined as void;
  const arrived = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const asked: string[] = [];
  return {
    asked,
    finish: () => finish(),
    load: (font: string) => {
      asked.push(font);
      return arrived.then(() => []);
    },
  };
}

describe('waiting for the fonts on the web', () => {
  it('settles only once the browser has every face', async () => {
    const fonts = fontSet();
    let done = false;
    void waitForFontFaces(['YallaSans-400', 'ionicons'], fonts, 3000).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);
    expect(fonts.asked).toEqual(['16px "YallaSans-400"', '16px "ionicons"']);

    fonts.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('gives up waiting after the ceiling, so a slow font never holds the app', async () => {
    let done = false;
    void waitForFontFaces(['YallaSans-400'], fontSet(), 3000).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(3000);

    expect(done).toBe(true);
  });

  it('does not wait where there is no font set to ask', async () => {
    await expect(waitForFontFaces(['YallaSans-400'], undefined, 3000)).resolves.toBeUndefined();
  });

  it('does not wait on a face that fails to load', async () => {
    const failing: FontFaceSetLike = { load: () => Promise.reject(new Error('404')) };

    await expect(waitForFontFaces(['YallaSans-400'], failing, 3000)).resolves.toBeUndefined();
  });
});
