import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import appJson from '../../app.json';

/**
 * `app.config.js` adds the Google Maps Android key from the EAS environment
 * and nothing else: without the variable the config is exactly `app.json`.
 */
const appConfig = createRequire(import.meta.url)('../../app.config.js') as (input: {
  config: typeof appJson.expo;
}) => typeof appJson.expo & { android: { config?: { googleMaps?: { apiKey: string } } } };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('app.config.js', () => {
  it('passes app.json through untouched when no key is set', () => {
    vi.stubEnv('GOOGLE_MAPS_ANDROID_API_KEY', '');
    expect(appConfig({ config: appJson.expo })).toBe(appJson.expo);
  });

  it('puts the key where react-native-maps reads it, keeping the rest of android', () => {
    vi.stubEnv('GOOGLE_MAPS_ANDROID_API_KEY', 'test-maps-key');
    const config = appConfig({ config: appJson.expo });

    expect(config.android.config?.googleMaps?.apiKey).toBe('test-maps-key');
    expect(config.android.package).toBe('am.yalla.diner');
    expect(config.ios.bundleIdentifier).toBe('am.yalla.diner');
  });
});
