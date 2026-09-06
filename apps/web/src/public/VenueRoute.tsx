import { isOfflinePaused, usePublicVenue } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Link, useParams } from 'react-router-dom';
import { OpenBadge } from './LiveCount';
import { FailedPage, LoadingPage, NotFoundPage } from './PageStates';

/**
 * `/{venueSlug}` — a chain, and which of its branches to open.
 *
 * A venue with one branch is not sent here by anything Yalla prints; the branch
 * page's own URL is what goes on a card. This exists because somebody *will*
 * type or trim the URL down to the venue, and because "Lumen Coffee has 14
 * tables free" is useless to a person standing on Northern Avenue if they are
 * all at the branch across town. So the free count is per branch, on every
 * card, which is the only thing that makes the choice a real one.
 */
export function VenueRoute() {
  const { venueSlug } = useParams<{ venueSlug: string }>();
  const { t } = useTranslation('public');
  const { locale } = useLocale();
  const venueQuery = usePublicVenue(venueSlug);

  if (venueQuery.isLoading) return <LoadingPage />;
  if (venueQuery.isError || isOfflinePaused(venueQuery)) {
    return (
      <FailedPage
        offline={isOfflinePaused(venueQuery)}
        error={venueQuery.error}
        onRetry={() => void venueQuery.refetch()}
      />
    );
  }
  if (!venueQuery.data) return <NotFoundPage />;

  const { venue, branches } = venueQuery.data;

  return (
    <main className="pub-page">
      <header className="pub-head">
        <h1 className="display">{venue.name}</h1>
        <p className="pub-muted">
          {t(`venue.type.${venue.type}`, { ns: 'diner' })}
          {venue.description ? ` · ${venue.description}` : ''}
        </p>
      </header>

      <section className="pub-section" aria-labelledby="branches">
        <h2 id="branches">{t('branches.title')}</h2>

        {branches.length === 0 ? (
          <p className="pub-muted">{t('branches.empty')}</p>
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
                  <Link className="pub-branch-card" to={`/${venue.slug}/${branch.slug}`}>
                    <span className="pub-branch-card-name">{branch.name}</span>
                    <span className="pub-muted">{branch.addressLine}</span>
                    <span className="pub-branch-card-free">
                      {branch.freeTables === 0
                        ? t('page.fullyBooked')
                        : branch.totalTables === null
                          ? // No denominator from this source; the count alone is
                            // the honest sentence, and `page.freeNow` already
                            // says it on the branch page.
                            t('page.freeNow', { count: branch.freeTables })
                          : t('branches.free', {
                              free: branch.freeTables,
                              total: branch.totalTables,
                            })}
                    </span>
                    <OpenBadge
                      openState={branch.openState}
                      timeZoneId={branch.timeZoneId}
                      locale={locale}
                      as="span"
                    />
                  </Link>
                ) : (
                  <div className="pub-branch-card is-unavailable">
                    <span className="pub-branch-card-name">{branch.name}</span>
                    <span className="pub-muted">{branch.addressLine}</span>
                    <span className="pub-muted">{t('branches.notAvailable')}</span>
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
