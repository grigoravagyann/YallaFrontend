import type { ConsoleVenue } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isOfflinePaused } from '@yalla/api/react';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { useConsoleVenues } from '../../data/queries';

const PAGE_SIZE = 10;

/**
 * Every venue on the platform.
 *
 * Suspended venues are listed rather than hidden. The team's most common
 * question about a suspended venue is "why is it suspended", and a list that
 * silently drops it turns that into "where did it go".
 *
 * Four states, explicitly: loading, empty, error and offline — plus "not
 * available yet", because the backend has no venue catalogue endpoint and a
 * screen that called that a bug would send someone to fix the wrong thing.
 */
export function VenuesRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = useConsoleVenues({ search, page, pageSize: PAGE_SIZE });
  const result = query.data;
  // Offline queries are paused, not failed, so this never surfaces as an error.
  const offline = isOfflinePaused(query);

  const total = result?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>{t('venues.title')}</h1>
          <p className="muted">{t('venues.count', { count: total })}</p>
        </div>
        <Link className="button button-primary" to="/platform/venues/new">
          {t('venues.new')}
        </Link>
      </header>

      <input
        className="field"
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          // A narrower result set makes page 4 meaningless; go back to the top.
          setPage(1);
        }}
        placeholder={t('venues.search')}
        aria-label={t('venues.search')}
      />

      {offline ? (
        <QueryFailureNotice offline onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <p className="muted">{t('loading')}</p>
      ) : query.isError ? (
        <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
      ) : total === 0 ? (
        <div className="empty">
          <h2>{search ? t('venues.empty.title') : t('venues.empty.first')}</h2>
          {search ? <p className="muted">{t('venues.empty.body')}</p> : null}
        </div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>{t('venues.column.name')}</th>
                <th className="num">{t('venues.column.branches')}</th>
                <th className="num">{t('venues.column.tables')}</th>
                <th>{t('venues.column.tier')}</th>
                <th>{t('venues.column.status')}</th>
              </tr>
            </thead>
            <tbody>
              {result?.items.map((venue) => (
                <VenueRow key={venue.id} venue={venue} />
              ))}
            </tbody>
          </table>

          <nav className="pager" aria-label={t('venues.title')}>
            <button
              type="button"
              className="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {t('venues.previous')}
            </button>
            <span className="muted">{t('venues.showing', { from, to, total })}</span>
            <button
              type="button"
              className="button"
              disabled={page >= lastPage}
              onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
            >
              {t('venues.next')}
            </button>
          </nav>
        </>
      )}
    </section>
  );
}

function VenueRow({ venue }: { venue: ConsoleVenue }) {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <tr>
      <td>
        {/* The id comes from a list the server already scoped, never from
            anything the user typed. */}
        <Link to={`/platform/venues/${venue.id}`}>{venue.name}</Link>
        <div className="muted small">{venue.slug}</div>
      </td>
      <td className="num">{venue.branchCount}</td>
      <td className="num">{venue.tableCount}</td>
      <td>
        <span className={`pill pill-${venue.subscriptionTier}`}>
          {t(`tier.${venue.subscriptionTier}`)}
        </span>
      </td>
      <td>
        <span className={`pill pill-${venue.status}`}>{t(`status.${venue.status}`)}</span>
      </td>
    </tr>
  );
}
