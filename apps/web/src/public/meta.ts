import type { PublicPageMeta } from '@yalla/api';

/**
 * Open Graph and Twitter card tags, written into the live document.
 *
 * ## Read this before believing the sharing story works
 *
 * `apps/web` is a single-page app. What a link unfurler fetches for
 * `/lumen-coffee/northern-avenue` is `index.html` — the same twelve lines of
 * shell every route serves — because the server has no route table and does no
 * rendering. **WhatsApp, Telegram, Slack, Discord, Facebook and Twitter's
 * fetchers do not run JavaScript**, so nothing this module does is visible to
 * any of them.
 *
 * So what is it for, and what actually happens?
 *
 * - **What a fetcher receives**: the static `<meta>` tags in `index.html`.
 *   Those are venue-agnostic on purpose — a Yalla card with a generic line
 *   about seeing free tables — so a shared link renders *a* card rather than a
 *   bare blue URL. That is the whole of the improvement available without a
 *   server, and it is real: a card is tapped and a naked URL is scrolled past.
 * - **What this module adds**: correct per-venue tags for the things that *do*
 *   execute the page — an in-app browser's own share sheet, iOS Safari's "Add
 *   to Home Screen", a browser extension, and a headless renderer if one is
 *   ever put in front of this. It also sets the document title, which is what
 *   a person sees in their tab list and in their history.
 *
 * The fix for the rest is a server that renders these five tags per URL: an
 * edge function, or the backend's own meta endpoint (`getBranchMeta`, already
 * defined and not yet implemented) behind a tiny prerender. Server-side
 * rendering is explicitly out of scope for this task, so the honest statement
 * is the one above rather than a `<meta>` call that looks like it did the job.
 */

/** The tags this module owns, so a repeat call replaces rather than accumulates. */
const MANAGED = 'data-yalla-meta';

/**
 * The generated brand card, used when a branch has no cover photo of its own.
 *
 * Root-relative, and that is safe here in a way it would not be in the static
 * shell: `applyPageMeta` resolves it against the page's own canonical URL
 * below, so what reaches the tag is always absolute. A venue *with* a cover
 * photo still gets its own picture — a real photograph of the room beats a logo
 * every time, and this is only the floor under that.
 *
 * Built by `scripts/generate-og-card.mjs`.
 */
const BRAND_CARD = '/og-card.png';

function setTag(attribute: 'property' | 'name', key: string, content: string): void {
  const existing = document.head.querySelector(`meta[${attribute}="${key}"]`);
  const tag = existing instanceof HTMLMetaElement ? existing : document.createElement('meta');
  tag.setAttribute(attribute, key);
  tag.setAttribute('content', content);
  tag.setAttribute(MANAGED, '');
  if (!existing) document.head.append(tag);
}

function setCanonical(url: string): void {
  const existing = document.head.querySelector('link[rel="canonical"]');
  const link = existing instanceof HTMLLinkElement ? existing : document.createElement('link');
  link.rel = 'canonical';
  link.href = url;
  link.setAttribute(MANAGED, '');
  if (!existing) document.head.append(link);
}

/** BCP-47 for `og:locale`, which wants an underscore and a region. */
const OG_LOCALE: Readonly<Record<string, string>> = {
  hy: 'hy_AM',
  ru: 'ru_AM',
  en: 'en_GB',
};

export function applyPageMeta(meta: PublicPageMeta): void {
  document.title = meta.title;
  // `lang` on the root element is not decoration: it decides hyphenation, the
  // voice a screen reader uses, and whether a browser offers to translate the
  // page. An Armenian menu announced in English is unintelligible.
  document.documentElement.lang = meta.locale;

  setTag('name', 'description', meta.description);
  setTag('property', 'og:type', 'website');
  setTag('property', 'og:site_name', meta.siteName);
  setTag('property', 'og:title', meta.title);
  setTag('property', 'og:description', meta.description);
  setTag('property', 'og:url', meta.canonicalUrl);
  setTag('property', 'og:locale', OG_LOCALE[meta.locale] ?? 'hy_AM');
  // Always a large card now: there is always an image, because a branch with no
  // cover photo falls back to the brand one rather than to nothing.
  setTag('name', 'twitter:card', 'summary_large_image');
  setTag('name', 'twitter:title', meta.title);
  setTag('name', 'twitter:description', meta.description);

  // Relative image URLs are dropped by every unfurler, so make it absolute
  // against the page it belongs to rather than hoping.
  const absolute = new URL(meta.imageUrl ?? BRAND_CARD, meta.canonicalUrl).toString();
  setTag('property', 'og:image', absolute);
  setTag('name', 'twitter:image', absolute);
  setTag('property', 'og:image:alt', meta.imageUrl ? meta.title : meta.siteName);

  setCanonical(meta.canonicalUrl);
}

/**
 * Put the shell's own generic tags back.
 *
 * Called when a page fails to resolve, so a mistyped link does not leave the
 * previous venue's title and description attached to a "not found" page — which
 * is how a share of the wrong URL ends up advertising the right venue.
 */
export function resetPageMeta(fallbackTitle: string): void {
  document.title = fallbackTitle;
  for (const node of document.head.querySelectorAll(`[${MANAGED}]`)) node.remove();
}
