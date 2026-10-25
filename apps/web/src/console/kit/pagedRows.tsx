import { useTranslation } from '@yalla/i18n';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';

/** The part of an infinite query a cursor-paged list reads. */
export interface PagedQuery<T> {
  readonly data?: { readonly pages: readonly { readonly items: readonly T[] }[] } | undefined;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => Promise<unknown>;
}

/**
 * A cursor-paged list's rows: every page in order, each row said once even
 * if a refetch moved it across a page edge.
 *
 * `more()` asks the next page and, once it is on screen, hands its first row
 * to `focusRow`, so the keyboard carries on from there. A list that turned
 * into another meanwhile (a filter changed: its first row is another) drops
 * that focus rather than landing it on a stranger.
 *
 * `idOf` keys the dedupe and must be stable (a module-level function): the
 * rows are memoised on the pages, so a memoised table is not redrawn per key.
 */
export function usePagedRows<T>(
  query: PagedQuery<T>,
  idOf: (row: T) => string,
  focusRow: (row: T, index: number) => void,
) {
  const pages = query.data?.pages;
  const rows: readonly T[] = useMemo(() => {
    const seen = new Set<string>();
    return (pages ?? []).flatMap((page) =>
      page.items.filter((row) => {
        const id = idOf(row);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      }),
    );
  }, [pages, idOf]);

  const pending = useRef<{ readonly index: number; readonly firstId: string | null } | null>(null);
  useEffect(() => {
    const wanted = pending.current;
    if (wanted === null) return;
    const first = rows[0];
    if ((first ? idOf(first) : null) !== wanted.firstId) {
      pending.current = null;
      return;
    }
    if (rows.length <= wanted.index) return;
    pending.current = null;
    const row = rows[wanted.index];
    if (row !== undefined) focusRow(row, wanted.index);
  });

  function more() {
    const first = rows[0];
    pending.current = { index: rows.length, firstId: first ? idOf(first) : null };
    void query.fetchNextPage();
  }

  return {
    rows,
    more,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
  } as const;
}

/**
 * Under a paged list: how many are shown (a polite status), and "More" while
 * the server has another page.
 */
export function PagedFooter({
  status,
  moreLabel,
  hasMore,
  loadingMore,
  onMore,
  children,
}: {
  readonly status: ReactNode;
  readonly moreLabel: string;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly onMore: () => void;
  /** Anything after the button: a failed page's notice. */
  readonly children?: ReactNode;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <div className="yc-mh-foot">
      <span role="status" aria-atomic="true">
        {status}
      </span>
      {hasMore ? (
        <button
          type="button"
          className="yc-btn yc-btn-sec yc-btn-sm"
          disabled={loadingMore}
          onClick={onMore}
        >
          {loadingMore ? t('loading') : moreLabel}
        </button>
      ) : null}
      {children}
    </div>
  );
}
