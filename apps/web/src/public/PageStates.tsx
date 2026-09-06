import { isEndpointNotWired } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect } from 'react';
import { resetPageMeta } from './meta';

/**
 * The four ways this page can have nothing to show, each said plainly.
 *
 * All of them are *pages*, not error banners or spinners that never resolve.
 * Somebody tapped a link in a chat and is looking at their phone outside a
 * restaurant; the useful answer is one sentence about what happened and, where
 * there is one, what still works.
 */

/** A slug that resolves to nothing. Not an error — a link that was mistyped. */
export function NotFoundPage() {
  const { t } = useTranslation('public');
  useEffect(() => resetPageMeta(t('appName', { ns: 'common' })), [t]);

  return (
    <main className="pub-state">
      <h1 className="display">{t('page.notFound.title')}</h1>
      <p>{t('page.notFound.body')}</p>
    </main>
  );
}

/**
 * A branch that exists and is switched off.
 *
 * Deliberately plain, and deliberately not an error. A suspended venue is a
 * commercial state between the platform and the venue, and nothing about it is
 * the visitor's problem — so the page says the place is not on Yalla and points
 * out, without a link it cannot honour, that the venue itself still exists.
 */
export function NotAvailablePage({ venueName }: { readonly venueName?: string | undefined }) {
  const { t } = useTranslation('public');
  useEffect(() => resetPageMeta(t('appName', { ns: 'common' })), [t]);

  return (
    <main className="pub-state">
      {venueName ? <p className="pub-state-venue">{venueName}</p> : null}
      <h1 className="display">{t('page.notAvailable.title')}</h1>
      <p>{t('page.notAvailable.body')}</p>
    </main>
  );
}

/**
 * The first load.
 *
 * A skeleton rather than a spinner, and shaped like the page it becomes: the
 * cover block, the name, and — the important one — a box exactly the height the
 * free-table count will occupy. That number is the largest thing on the page
 * and it arrives last; without the reserved box the whole page jumps when it
 * lands, on the slow connection where the jump lasts longest.
 */
export function LoadingPage() {
  const { t } = useTranslation('public');
  return (
    <main className="pub-state" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{t('page.loading')}</span>
      <div className="skeleton skeleton-cover" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-count" />
    </main>
  );
}

/**
 * The page could not be read at all — in one of three distinguishable ways.
 *
 * `offline` is its own case rather than a flavour of failure. TanStack Query
 * does not fail a request it cannot send — it pauses it — so without this the
 * page shows a skeleton that never resolves, which reads as a broken venue
 * rather than a tunnel.
 *
 * A missing endpoint is its own case for a different reason. The `/api/public`
 * routes this page needs do not exist on the backend yet, and against a real
 * one every slug resolves to `EndpointNotWiredError`. "Something went wrong on
 * our side" would send whoever is looking at it hunting through the frontend
 * for a bug that is not there, so it says what is actually true and offers no
 * retry, because retrying will not deploy anything.
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
  const { t } = useTranslation('diner');

  if (isEndpointNotWired(error)) {
    return (
      <main className="pub-state">
        <h1 className="display">{t('net.notAvailable')}</h1>
        <p>{t('net.notAvailableBody')}</p>
      </main>
    );
  }

  return (
    <main className="pub-state">
      <h1 className="display">{offline ? t('net.offline') : t('net.serverError')}</h1>
      {offline ? <p>{t('net.offlineBody')}</p> : null}
      <button type="button" className="pub-button" onClick={onRetry}>
        {t('net.retry')}
      </button>
    </main>
  );
}
