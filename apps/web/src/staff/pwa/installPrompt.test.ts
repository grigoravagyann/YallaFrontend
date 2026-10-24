// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERY } from '../phone/usePhoneLayout';
import './installPrompt';

/**
 * Chrome's install offer on `/staff`: the phone keeps it for its Install
 * screen's button; the floor tablet, which has no such screen, keeps Chrome's
 * own "Add to home screen" bar, as it had before the phone existed.
 */

function screenIsPhone(phone: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === PHONE_QUERY ? phone : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

function offer(): Event {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Chrome’s install offer', () => {
  it('is held for the Install screen on a phone, so Chrome shows no bar of its own', () => {
    screenIsPhone(true);
    expect(offer().defaultPrevented).toBe(true);
  });

  it('is left to Chrome’s own bar on a floor tablet', () => {
    screenIsPhone(false);
    expect(offer().defaultPrevented).toBe(false);
  });
});
