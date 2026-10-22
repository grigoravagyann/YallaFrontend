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

/**
 * The SHURJ rename touches what a person reads — the name under the icon and
 * the permission prompts — and nothing a store, a link or a build is keyed on.
 */
describe('app.json', () => {
  it('is called SHURJ and draws light', () => {
    expect(appJson.expo.name).toBe('SHURJ');
    expect(appJson.expo.userInterfaceStyle).toBe('light');
    expect(appJson.expo.backgroundColor).toBe('#FFFFFF');
  });

  it('keeps every identifier the stores, links and EAS are keyed on', () => {
    expect(appJson.expo.slug).toBe('yalla-diner');
    expect(appJson.expo.scheme).toBe('yalla');
    expect(appJson.expo.owner).toBe('grigoravagyan');
    expect(appJson.expo.ios.bundleIdentifier).toBe('am.yalla.diner');
    expect(appJson.expo.android.package).toBe('am.yalla.diner');
    expect(appJson.expo.extra.eas.projectId).toBe('cfd66f41-308a-47d0-991d-72f2538e7e9d');
  });

  it('names SHURJ in every permission prompt, on a white splash', () => {
    const plugins = JSON.stringify(appJson.expo.plugins);
    expect(plugins).not.toMatch(/Yalla uses/u);
    expect(plugins).toMatch(/SHURJ uses your location/u);
    expect(plugins).toMatch(/SHURJ uses the camera/u);
    expect(plugins).toMatch(/"backgroundColor":"#FFFFFF"/u);
  });
});
