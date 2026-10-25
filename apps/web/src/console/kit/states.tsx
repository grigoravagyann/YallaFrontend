import { useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';

/**
 * One quiet line in place of content: "Pick a branch", "Not on this branch".
 * `card` when it stands alone on the page rather than inside a card.
 */
export function EmptyLine({
  card = false,
  children,
}: {
  readonly card?: boolean;
  readonly children: ReactNode;
}) {
  return <p className={card ? 'yc-card yc-empty-line' : 'yc-empty-line'}>{children}</p>;
}

/** "Loading…" as a polite status, where the content will be. */
export function LoadingLine({ card = false }: { readonly card?: boolean }) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <p className={card ? 'yc-card yc-empty-line' : 'yc-empty-line'} role="status">
      {t('loading')}
    </p>
  );
}

/**
 * A read that failed, said in its own words with "Try again".
 *
 * - `list`: inside a list's card, padded as its rows are.
 * - `card`: on its own on the page, as a card.
 */
export function QueryFailure({
  query,
  frame,
}: {
  readonly query: { readonly error: unknown; readonly refetch: () => Promise<unknown> };
  readonly frame: 'list' | 'card';
}) {
  return (
    <div className={frame === 'card' ? 'yc-card yc-ov-pad' : 'yc-mh-pad'}>
      <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
    </div>
  );
}

/**
 * Nothing to show: a heading, what it means, and (when the filters are why)
 * the way out.
 */
export function EmptyState({
  title,
  level = 3,
  card = false,
  children,
  action,
}: {
  readonly title: ReactNode;
  /** The heading's level in the page's outline. */
  readonly level?: 2 | 3;
  readonly card?: boolean;
  /** The line under the heading. */
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className={card ? 'yc-card yc-empty' : 'yc-empty'}>
      <Heading className="yc-h2">{title}</Heading>
      <p>{children}</p>
      {action}
    </div>
  );
}
