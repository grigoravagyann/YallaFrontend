import type { BranchListing, PublicBranchCard, PublicVenue } from '@yalla/api';
import { usePublicVenue, usePublicVenueListings } from '@yalla/api/react';
import type { Locale } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLangPath } from './language';
import { OpenBadge } from './LiveCount';
import { FailedPage, LoadingPage, NotFoundPage, pageState, StaleNotice } from './PageStates';

/**
 * `/{venueSlug}` — a chain, and which of its branches to open (Venue artboard).
 *
 * A venue with one branch is not sent here by anything Yalla prints; the branch
 * page's own URL is what goes on a card. This exists because somebody *will*
 * type or trim the URL down to the venue, and because "Lumen Coffee has 14
 * tables free" is useless to a person standing on Northern Avenue if they are
 * all at the branch across town. So every card says where the branch is
 * (address · district), whether it is open, and how many tables it has free
 * — the facts that make the choice a real one.
 *
 * Two reads. The venue list carries the branches with their open state and
 * free count; the listing (by the venue's name) adds each branch's photo and
 * district. The cards stand without the second: no photo, no district, never
 * no card.
 */
export function VenueRoute() {
  const { venueSlug } = useParams<{ venueSlug: string }>();
  const venueQuery = usePublicVenue(venueSlug);
  const state = pageState(venueQuery);

  if (state === 'loading') return <LoadingPage shape="single" />;
  if (state) {
    return (
      <FailedPage
        offline={state === 'offline'}
        error={venueQuery.error}
        onRetry={() => void venueQuery.refetch()}
      />
    );
  }
  if (!venueQuery.data) return <NotFoundPage />;

  return <Chooser venue={venueQuery.data} stale={<StaleNotice query={venueQuery} />} />;
}

function Chooser({
  venue: { venue, branches },
  stale,
}: {
  readonly venue: PublicVenue;
  readonly stale: ReactNode;
}) {
  const { t } = useTranslation('public');
  const { locale } = useLocale();
  const langPath = useLangPath();
  const listingsQuery = usePublicVenueListings({ slug: venue.slug, name: venue.name });
  const listings = new Map<string, BranchListing>(
    (listingsQuery.data ?? []).map((listing) => [listing.branchSlug, listing]),
  );
  // The venue's own photo, or its first branch's: the artboard's hero.
  const hero =
    venue.coverPhoto ??
    branches.map((branch) => listings.get(branch.slug)?.coverPhoto ?? null).find(Boolean) ??
    null;
  const cuisine = [...listings.values()].map((listing) => listing.cuisine).find(Boolean);

  return (
    <main className="pub-page pub-chooser">
      {hero ? (
        <div className="pub-chooser-hero">
          <img src={hero.cardUrl} alt="" />
        </div>
      ) : null}
      <header className="pub-head">
        <h1 className="display">{venue.name}</h1>
        <p className="pub-muted">
          {t(`venue.type.${venue.type}`, { ns: 'diner' })}
          {/* One line: the type and the cuisine. The venue's description can be
              a paragraph, and belongs on a branch's page (review N8). */}
          {cuisine ? ` · ${cuisine}` : ''}
        </p>
        {stale}
      </header>

      <section className="pub-section" aria-labelledby="branches">
        <h2 id="branches">{t('branches.title')}</h2>

        {branches.length === 0 ? (
          <p className="pub-empty">{t('branches.empty')}</p>
        ) : (
          <ul className="pub-branch-list">
            {branches.map((branch) => (
              <li key={branch.slug}>
                {/*
                  A suspended branch stays on the list and is not a link. Hiding
                  it would make a chain look smaller than it is and would send
                  somebody who knows the place exists hunting for a page that
                  answers nothing; a dead link would waste the tap instead.
                */}
                {branch.status === 'live' ? (
                  <Link className="pub-branch-card" to={langPath(`/${venue.slug}/${branch.slug}`)}>
                    <BranchCardBody
                      branch={branch}
                      listing={listings.get(branch.slug)}
                      locale={locale}
                    />
                    <svg
                      className="pub-branch-card-go"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </Link>
                ) : (
                  <div className="pub-branch-card is-unavailable">
                    <BranchCardBody
                      branch={branch}
                      listing={listings.get(branch.slug)}
                      locale={locale}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function BranchCardBody({
  branch,
  listing,
  locale,
}: {
  readonly branch: PublicBranchCard;
  readonly listing: BranchListing | undefined;
  readonly locale: Locale;
}) {
  const { t } = useTranslation('public');
  const photo = listing?.coverPhoto ?? null;
  const live = branch.status === 'live';
  const open = live && branch.openState.isOpen;

  return (
    <>
      <span className="pub-branch-card-photo">
        {/* Decorative: the name beside it says which branch it is. */}
        {photo ? <img src={photo.thumbnailUrl} alt="" /> : null}
      </span>
      <span className="pub-branch-card-text">
        <span className="pub-branch-card-name">{branch.name}</span>
        <span className="pub-branch-card-address">
          {listing?.district
            ? t('branches.addressDistrict', {
                address: branch.addressLine,
                district: listing.district,
              })
            : branch.addressLine}
        </span>
        {live ? (
          <span className="pub-branch-card-state">
            <OpenBadge
              openState={branch.openState}
              timeZoneId={branch.timeZoneId}
              locale={locale}
              as="span"
            />
            {/* The count is "now": a shut branch has nothing to count. */}
            {open ? (
              <span className="pub-branch-card-free">
                {branch.freeTables > 0
                  ? t('branches.freeCount', { count: branch.freeTables })
                  : t('branches.noneFree')}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="pub-branch-card-state">
            <span className="pub-tag">{t('branches.notAvailable')}</span>
            <span>{t('page.notAvailable.title')}</span>
          </span>
        )}
        {open && branch.freeTables === 0 ? (
          <span className="pub-branch-card-later">{t('branches.later')}</span>
        ) : null}
      </span>
    </>
  );
}
