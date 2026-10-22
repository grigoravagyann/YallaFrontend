/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
import { contrastRatio } from '@yalla/tokens';
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
  it('keeps every identifier the stores, links and EAS are keyed on', () => {
    expect(appJson.expo.slug).toBe('yalla-diner');
    expect(appJson.expo.scheme).toBe('yalla');
    expect(appJson.expo.owner).toBe('grigoravagyan');
    expect(appJson.expo.ios.bundleIdentifier).toBe('am.yalla.diner');
    expect(appJson.expo.android.package).toBe('am.yalla.diner');
    expect(appJson.expo.extra.eas.projectId).toBe('cfd66f41-308a-47d0-991d-72f2538e7e9d');
  });

  it('names SHURJ, never Yalla, in every permission prompt', () => {
    const plugins = JSON.stringify(appJson.expo.plugins);
    expect(plugins).not.toMatch(/Yalla uses/u);
    expect(plugins).toMatch(/SHURJ uses your location/u);
    expect(plugins).toMatch(/SHURJ uses the camera/u);
  });
});

/**
 * The first frame anyone sees. The old splash was a cream "Yalla" on a
 * transparent ground, drawn for a dark background: on the white one it all
 * but vanished (B1, 2026-10-22). The image now carries its own cream ground,
 * so the splash colour has to be that exact cream for the square's edge to
 * disappear, and the mark on it has to be readable.
 */
describe('the splash screen', () => {
  const splash = (appJson.expo.plugins as unknown[]).find(
    (plugin): plugin is [string, { image: string; backgroundColor: string; dark?: unknown }] =>
      Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  )![1];
  const image = decodePng(readFileSync(new URL(`../../${splash.image}`, import.meta.url)));

  it('fills the screen with the image’s own ground, so its edge never shows', () => {
    const corners = [
      image.pixel(0, 0),
      image.pixel(image.width - 1, 0),
      image.pixel(0, image.height - 1),
      image.pixel(image.width - 1, image.height - 1),
    ];
    for (const [r, g, b, a] of corners) {
      expect(a, 'an opaque corner').toBe(255);
      expect(hex(r, g, b)).toBe(splash.backgroundColor.toUpperCase());
    }
    // One splash: no dark variant drawing the old ground back in.
    expect(splash.dark).toBeUndefined();
  });

  it('draws the mark dark enough to read on that ground', () => {
    let darkest = { lum: Number.POSITIVE_INFINITY, rgb: '#FFFFFF' };
    for (let y = 0; y < image.height; y += 2) {
      for (let x = 0; x < image.width; x += 2) {
        const [r, g, b, a] = image.pixel(x, y);
        if (a < 255) continue;
        const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (lum < darkest.lum) darkest = { lum, rgb: hex(r, g, b) };
      }
    }
    expect(contrastRatio(darkest.rgb, splash.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
});

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Just enough of PNG to read an 8-bit RGB or RGBA image's pixels. */
function decodePng(file: Buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('latin1', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8) throw new RangeError('Only 8-bit PNGs');
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (!channels) throw new RangeError('Only RGB or RGBA PNGs');
    } else if (type === 'IDAT') {
      data.push(body);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + x] = (line[x]! + predictor) & 0xff;
    }
  }
  return {
    width,
    height,
    pixel(x: number, y: number): [number, number, number, number] {
      const at = (y * width + x) * channels;
      return [
        pixels[at]!,
        pixels[at + 1]!,
        pixels[at + 2]!,
        channels === 4 ? pixels[at + 3]! : 255,
      ];
    },
  };
}
