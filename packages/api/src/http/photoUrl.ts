import type { Photo } from '../contracts/menuAdmin';

/**
 * A server-relative photo url, made absolute against the API's origin.
 *
 * The API answers photo links as `/api/photos/{id}/card` — origin-less on
 * purpose, since it does not know what host it is reachable at. Every client
 * does know, because it is the base url it calls the API with; but a browser
 * given a root-relative `<img src>` resolves it against the *page's* origin,
 * which in development is the Vite server and in production is the web host,
 * and a phone has no page origin at all. So the links are resolved here, at
 * the gateway boundary, once, rather than by every screen that draws one.
 *
 * Anything already absolute — an externally hosted photo migrated from the old
 * column — is left alone.
 */
export function absolutePhotoUrl(baseUrl: string, url: string): string {
  if (!url.startsWith('/')) return url;
  try {
    return new URL(url, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return url;
  }
}

/** The same, over all three variants of one photo. */
export function absolutePhoto(baseUrl: string, photo: Photo): Photo {
  return {
    ...photo,
    thumbnailUrl: absolutePhotoUrl(baseUrl, photo.thumbnailUrl),
    cardUrl: absolutePhotoUrl(baseUrl, photo.cardUrl),
    fullUrl: absolutePhotoUrl(baseUrl, photo.fullUrl),
  };
}
