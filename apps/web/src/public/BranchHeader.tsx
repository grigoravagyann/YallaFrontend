import type { BranchDetail, PublicBranch } from '@yalla/api';
import { formatRating, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons';
import { useLangPath } from './language';

/**
 * The header under the photos, in the Main artboard's order: the name, the
 * branch with the link to all of the venue's branches, type · cuisine, rating
 * (count) · district · price level — then, outside this file, the open-state
 * card — and call / address / share.
 */

/** The branch, and "All 3 branches" when the venue has more than this one. */
export function BranchLine({ branch }: { readonly branch: PublicBranch }) {
  const { t } = useTranslation('public');
  const langPath = useLangPath();
  // The branches the chooser lists, counted by the server with the page itself
  // (`venueBranchCount`) — no read of the whole public venue list for a number.
  const count = branch.venueBranchCount;

  return (
    <div className="pub-branch-row">
      <p className="pub-branch-name">{branch.name}</p>
      {count > 1 ? (
        <Link className="pub-all-branches" to={langPath(`/${branch.venue.slug}`)}>
          {t('header.allBranches', { count })}
        </Link>
      ) : null}
    </div>
  );
}

/** "Café · Coffee, breakfast and brunch": the type at once, the cuisine with the listing. */
export function TypeLine({
  branch,
  detail,
}: {
  readonly branch: PublicBranch;
  readonly detail: BranchDetail | null | undefined;
}) {
  const { t } = useTranslation('public');
  const cuisine = detail?.listing.cuisine;
  return (
    <p className="pub-muted">
      {t(`venue.type.${branch.venue.type}`, { ns: 'diner' })}
      {cuisine ? ` · ${cuisine}` : ''}
    </p>
  );
}

/**
 * "★ 4,7 (128 reviews) · Kentron · ֏֏ · moderate". Each part only when the
 * venue has it; the glyphs are read out as words. A shaped placeholder while
 * the listing loads, and nothing when it failed — the reviews section says so.
 */
export function FactsLine({
  detail,
  locale,
}: {
  readonly detail: BranchDetail | null | undefined;
  readonly locale: Locale;
}) {
  const { t } = useTranslation('public');

  if (detail === undefined) {
    return <span className="pub-skeleton pub-facts-skeleton" aria-hidden="true" />;
  }
  if (detail === null) return null;

  const { rating, reviewCount, district, priceLevel, features } = detail.listing;
  const level = priceLevel !== null && priceLevel >= 1 && priceLevel <= 4 ? priceLevel : null;
  // Reviews switched off here (2026-10-27): no rating and no "no reviews yet".
  const reviewsOn = features?.includes('reviews') ?? true;
  const parts = [
    !reviewsOn ? null : reviewCount > 0 ? (
      <span key="rating">
        {rating !== null ? (
          <>
            <span
              role="img"
              aria-label={t('header.rating', { rating: formatRating(rating, locale) })}
            >
              <span className="pub-star">★</span> <b>{formatRating(rating, locale)}</b>
            </span>{' '}
          </>
        ) : null}
        ({t('header.reviewCount', { count: reviewCount })})
      </span>
    ) : (
      <span key="rating">{t('header.noReviews')}</span>
    ),
    district ? <span key="district">{district}</span> : null,
    level !== null ? (
      <span
        key="price"
        role="img"
        aria-label={t('header.priceLabel', { level: t(`header.price.${level}`) })}
      >
        {'֏'.repeat(level)} · {t(`header.price.${level}`)}
      </span>
    ) : null,
  ].filter((part) => part !== null);

  // Each "·" travels with the part after it, so a wrapped line never ends on one.
  return (
    <p className="pub-facts">
      {parts.map((part, index) =>
        index === 0 ? (
          part
        ) : (
          <span key={part.key}>
            <span className="pub-facts-dot" aria-hidden="true">
              ·
            </span>
            {part}
          </span>
        ),
      )}
    </p>
  );
}

/** Call, the address further down, and share: what a person does next from the header. */
export function HeaderActions({ branch }: { readonly branch: PublicBranch }) {
  const { t } = useTranslation('public');
  return (
    <div className="pub-head-actions" role="group" aria-label={t('header.actions')}>
      {branch.phoneE164 ? (
        <a className="pub-button" href={`tel:${branch.phoneE164}`}>
          <Icon name="phone" />
          {t('header.call')}
        </a>
      ) : null}
      <a className="pub-button" href="#find">
        <Icon name="pin" />
        {t('header.address')}
      </a>
      <ShareButton
        title={`${branch.venue.name} — ${branch.name}`}
        path={`/${branch.venue.slug}/${branch.slug}`}
      />
    </div>
  );
}

/** How long "Link copied" stays on the button. */
const COPIED_MS = 2500;

/**
 * Share the page: the phone's own share sheet where the browser has one (the
 * Web Share API), otherwise the link copied with "Link copied" on the button
 * and said aloud. Where the clipboard refuses too, the link is shown to copy
 * by hand. Closing the share sheet is a choice, not a failure: nothing is said.
 *
 * The link is the branch's own address, without `?lang=`: the person it is
 * sent to reads the page in their own language.
 */
function ShareButton({ title, path }: { readonly title: string; readonly path: string }) {
  const { t } = useTranslation('public');
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  /** Bumped on every copy, so a second one restarts the clock and is said again. */
  const [copies, setCopies] = useState(0);
  /** What the always-mounted live region says; emptied first, so a repeat is heard. */
  const [announcement, setAnnouncement] = useState('');
  const url = new URL(path, window.location.origin).toString();

  useEffect(() => {
    if (state !== 'copied') return;
    const timer = setTimeout(() => {
      setState('idle');
      setAnnouncement('');
    }, COPIED_MS);
    return () => clearTimeout(timer);
  }, [state, copies]);

  /** Say it in the live region, emptied first so the same words twice are heard twice. */
  const announce = (text: string) => {
    setAnnouncement('');
    setTimeout(() => setAnnouncement(text), 50);
  };

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        // Refused for another reason (no user gesture, a blocked frame): copy instead.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      setCopies((count) => count + 1);
      announce(t('header.copied'));
    } catch {
      setState('manual');
      announce(t('header.copyThis'));
    }
  };

  return (
    <>
      <button type="button" className="pub-button" onClick={() => void share()}>
        <Icon name="share" />
        {state === 'copied' ? t('header.copied') : t('header.share')}
      </button>
      <span className="visually-hidden" role="status">
        {announcement}
      </span>
      {state === 'manual' ? (
        <p className="pub-share-manual">
          <span>{t('header.copyThis')}</span> <span className="pub-share-url">{url}</span>
        </p>
      ) : null}
    </>
  );
}
