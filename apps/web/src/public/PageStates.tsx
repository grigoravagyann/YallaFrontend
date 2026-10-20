import { isEndpointNotWired } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { usePageTitle } from './meta';
import { formatPhone } from './phone';

/**
 * The five ways this page can have nothing to show (the States artboard), each
 * said plainly.
 *
 * All of them are *pages*, not error banners or spinners that never resolve.
 * Somebody tapped a link in a chat and is looking at their phone outside a
 * restaurant; the useful answer is one sentence about what happened and, where
 * there is one, the one thing that still works: try again, or ring the venue.
 *
 * A state replaces the page only when there is no page to show. A page already
 * on screen stays through a failed refresh or a dropped connection — see
 * `pageState` below, which every route asks.
 */

/** The icons in a state's circle: one stroke path each, from the artboard. */
const ICON = {
  notFound: 'M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8 11h6',
  unavailable:
    'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  offline:
    'M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.1-1.6M12 20h.01',
  error: 'M12 8v4M12 16h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
} as const;

const RETRY_ICON = 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5';

/**
 * Which state a route's main query is in, or `null` once there is something to
 * draw.
 *
 * `data === undefined` is the whole rule. TanStack Query keeps the last answer
 * through a failed background refetch (status `error`) and through a refetch
 * paused for want of a network (fetch status `paused`); either used to swap a
 * page somebody was reading — the menu, in a tunnel — for an error page. With
 * data in hand the page stays, and the free-table count says how old it is.
 */
export function pageState(query: {
  readonly data: unknown;
  readonly isError: boolean;
  readonly fetchStatus: string;
}): 'loading' | 'offline' | 'error' | null {
  if (query.data !== undefined) return null;
  if (query.fetchStatus === 'paused') return 'offline';
  // Fetching is loading, a retry after a failure included: TanStack Query puts
  // a query with no data back to pending when it fetches again, and "Try
  // again" has to show the page coming rather than the same error.
  if (query.fetchStatus === 'fetching') return 'loading';
  if (query.isError) return 'error';
  // Idle with nothing and no error: a disabled query (a route without its
  // slugs). Nothing is coming, so the route says what it has — not found —
  // rather than a skeleton forever.
  return null;
}

/**
 * The quiet line on a page that stays on screen while its data may be old: a
 * refresh failed, or there is no connection to refresh over (see `pageState`).
 *
 * The page is still worth reading — the menu, the address, the booking the
 * visitor already holds — so it stays, but the counts, the open state and a
 * venue's answer on it may have moved since, and the visitor is told so. The
 * same pattern the room uses above its photos.
 */
export function StaleNotice({
  query,
}: {
  readonly query: {
    readonly data: unknown;
    readonly isError: boolean;
    readonly fetchStatus: string;
  };
}) {
  const { t } = useTranslation('public');
  if (query.data === undefined) return null;
  const offline = query.fetchStatus === 'paused';
  if (!offline && !query.isError) return null;
  return (
    <p className="pub-notice pub-stale" role="status">
      {t(offline ? 'page.stale.offline' : 'page.stale.error')}
    </p>
  );
}

function StateIcon({ path }: { readonly path: string }) {
  return (
    <div className="pub-state-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </div>
  );
}

/**
 * One state's layout: the icon, the venue's name when there is one, a title, a
 * sentence and at most one action. A failure is an alert — said aloud as it
 * appears — inside the page's `main`, so the landmark stays a landmark.
 */
function StateMessage({
  icon,
  venueName,
  title,
  body,
  alert = false,
  children,
}: {
  readonly icon: string;
  readonly venueName?: string | undefined;
  readonly title: string;
  readonly body: string;
  readonly alert?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <main className="pub-state">
      <div className="pub-state-message" role={alert ? 'alert' : undefined}>
        <StateIcon path={icon} />
        {venueName ? <p className="pub-state-venue">{venueName}</p> : null}
        <h1>{title}</h1>
        <p className="pub-state-body">{body}</p>
      </div>
      {children}
    </main>
  );
}

/** A slug that resolves to nothing. Not an error — a link that was mistyped. */
export function NotFoundPage() {
  const { t } = useTranslation('public');
  usePageTitle(t('page.notFound.title'), t('appName', { ns: 'common' }));

  return (
    <StateMessage
      icon={ICON.notFound}
      title={t('page.notFound.title')}
      body={t('page.notFound.body')}
    />
  );
}

/**
 * A branch that exists and is switched off.
 *
 * Deliberately plain, and deliberately not an error. A suspended venue is a
 * commercial state between the platform and the venue, and nothing about it is
 * the visitor's problem — so the page says the place is not on Yalla, names it
 * so they know they reached the right one, and offers the one way in that still
 * works: its phone, when it has published one.
 */
export function NotAvailablePage({
  venueName,
  phoneE164,
}: {
  readonly venueName?: string | undefined;
  readonly phoneE164?: string | null | undefined;
}) {
  const { t } = useTranslation('public');
  usePageTitle(t('page.notAvailable.title'), t('appName', { ns: 'common' }));

  return (
    <StateMessage
      icon={ICON.unavailable}
      venueName={venueName}
      title={t('page.notAvailable.title')}
      body={t('page.notAvailable.body')}
    >
      {phoneE164 ? (
        <a className="pub-button pub-button-tall" href={`tel:${phoneE164}`}>
          {t('page.call', { phone: formatPhone(phoneE164) })}
        </a>
      ) : null}
    </StateMessage>
  );
}

/**
 * The first load.
 *
 * A skeleton rather than a spinner, and shaped like the page it becomes. The
 * branch page's: the cover, the name and the branch line, the open-state card,
 * a button, and the booking card — beside the rest from 960px, as the page
 * will be. The chooser's and the manage link's (`single`): one column, a title,
 * a line and a card. The page lands into the shapes already drawn instead of
 * pushing everything down.
 *
 * The "Loading…" status is outside anything marked busy: assistive technology
 * may hold back what changes under `aria-busy`, and this is the one line here
 * that has to be said. The blocks themselves are hidden from it.
 */
export function LoadingPage({ shape = 'branch' }: { readonly shape?: 'branch' | 'single' }) {
  const { t } = useTranslation('public');
  const status = (
    <p className="visually-hidden" role="status">
      {t('page.loading')}
    </p>
  );

  if (shape === 'single') {
    return (
      <main className="pub-page">
        <div className="pub-skeleton-lines" aria-hidden="true">
          <i className="pub-skeleton pub-skeleton-title" />
          <i className="pub-skeleton pub-skeleton-line" />
          <i className="pub-skeleton pub-skeleton-card" />
        </div>
        {status}
      </main>
    );
  }

  return (
    <main className="pub-layout">
      <div className="pub-col pub-col-top" aria-hidden="true">
        <i className="pub-skeleton pub-skeleton-cover" />
        <div className="pub-skeleton-lines">
          <i className="pub-skeleton pub-skeleton-title" />
          <i className="pub-skeleton pub-skeleton-line" />
          <i className="pub-skeleton pub-skeleton-status" />
          <i className="pub-skeleton pub-skeleton-button" />
        </div>
      </div>
      <div className="pub-aside" aria-hidden="true">
        <i className="pub-skeleton pub-skeleton-card" />
      </div>
      {status}
    </main>
  );
}

/**
 * The page could not be read at all — in one of three distinguishable ways.
 *
 * `offline` is its own case rather than a flavour of failure. TanStack Query
 * does not fail a request it cannot send — it pauses it, and resumes it when
 * the connection comes back, which is why the sentence can promise the page
 * will open by itself. Without this the page shows a skeleton that never
 * resolves, which reads as a broken venue rather than a tunnel.
 *
 * A missing endpoint is its own case for a different reason: against a backend
 * that does not serve `/api/public` yet, every slug resolves to
 * `EndpointNotWiredError`. "Something went wrong on our side" would send
 * whoever is looking at it hunting through the frontend for a bug that is not
 * there, so it says what is actually true and offers no retry, because
 * retrying will not deploy anything.
 */
export function FailedPage({
  offline,
  error,
  onRetry,
}: {
  readonly offline: boolean;
  readonly error?: unknown;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation('public');

  if (isEndpointNotWired(error)) {
    return (
      <StateMessage
        icon={ICON.error}
        title={t('net.notAvailable', { ns: 'diner' })}
        body={t('net.notAvailableBody', { ns: 'diner' })}
      />
    );
  }

  const kind = offline ? 'offline' : 'error';
  return (
    <StateMessage
      icon={ICON[kind]}
      title={t(`page.${kind}.title`)}
      body={t(`page.${kind}.body`)}
      alert
    >
      <button
        type="button"
        className="pub-button pub-button-primary pub-button-tall"
        onClick={onRetry}
      >
        <svg
          className="pub-button-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={RETRY_ICON} />
        </svg>
        {t('page.retry')}
      </button>
    </StateMessage>
  );
}
