import {
  MESSAGE_HISTORY_KINDS,
  MESSAGE_HISTORY_MAX_RANGE_DAYS,
  MESSAGE_HISTORY_QUERY_MAX,
  ValidationError,
  defaultHistoryFrom,
  defaultMessageHistoryFilters,
  historySearchText,
  isLocalDate,
  messageHistoryViolations,
  oldestHistoryDate,
  type ConversationSubjectRef,
  type FieldViolation,
  type MessageHistoryFilters,
  type MessageHistoryItem,
  type MessageHistoryKind,
} from '@yalla/api';
import { useMessageHistory } from '@yalla/api/react';
import { branchDayKey, type Locale, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { firstName, shortName } from '../../../messages/messageText';
import { PageHeader } from '../../ui/PageHeader';
import { SearchIcon } from '../../ui/icons';
import { useVenueOutlet } from '../VenueLayout';
import { HistoryThread } from './HistoryThread';
import { localDateLabel, subjectParts, whenLabel } from './historyText';

/** How long the search waits after the last key before it asks. */
const SEARCH_DEBOUNCE_MS = 350;
/** Panes stack below this width (`console.css`): opening a guest moves the focus to the thread. */
const STACKED_QUERY = '(max-width: 1179px)';

/**
 * The venue console's message history (2026-10-24, the History board): every
 * guest conversation of the branch from the last twelve months, for the
 * owner, the general manager and the branch manager — a branch manager their
 * own branch only, as on Reviews. Read only: nobody answers from here.
 *
 * - **The filters live in the address** (`from`, `to`, `kind`, `q`,
 *   `unanswered`, and the open `thread`), so Back and a reload keep them. A
 *   date, a kind or the checkbox is a new history entry; the search and the
 *   open conversation replace the current one.
 * - **Bad filters are said before asking**, with the server's bounds
 *   (`messageHistoryViolations`); a 422 that names a field marks it too.
 * - **The thread on the right** is the floor's own read, never polled and
 *   never marked read: the tablet's unread counts are untouched.
 */
export function MessageHistoryScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId, branchName, timeZoneId } = useVenueOutlet();
  const [, setParams] = useSearchParams();

  // Another branch is another list: a conversation open on the last one
  // closes, the filters stay.
  const shownBranch = useRef(branchId);
  useEffect(() => {
    if (shownBranch.current !== null && shownBranch.current !== branchId) {
      setParams(
        (current) => {
          const copy = new URLSearchParams(current);
          copy.delete('thread');
          return copy;
        },
        { replace: true },
      );
    }
    shownBranch.current = branchId;
  }, [branchId, setParams]);

  return (
    <div className="yc-page">
      <PageHeader
        title={t('messageHistory.title')}
        sub={t('messageHistory.sub', { branch: branchName ?? '' })}
      />
      {branchId ? (
        <MessageHistory key={branchId} branchId={branchId} timeZoneId={timeZoneId} />
      ) : (
        <p className="yc-card yc-empty-line">{t('menu.noBranch')}</p>
      )}
    </div>
  );
}

/** `reservation:abc` / `takeaway:abc` in the address. */
function parseThread(value: string | null): ConversationSubjectRef | null {
  if (!value) return null;
  const at = value.indexOf(':');
  if (at < 1) return null;
  const kind = value.slice(0, at);
  const id = value.slice(at + 1);
  if ((kind !== 'reservation' && kind !== 'takeaway') || id === '') return null;
  return { kind, id };
}

function threadParam(subject: ConversationSubjectRef): string {
  return `${subject.kind}:${subject.id}`;
}

/**
 * The server's `from` for a given `to` (six days before it, never before the
 * kept year); today−6 while `to` is not a day.
 */
function defaultFromFor(to: string, today: string): string {
  return isLocalDate(to) ? defaultHistoryFrom(to, today) : defaultMessageHistoryFilters(today).from;
}

/**
 * The filters the address says, the server's defaults for whatever it leaves
 * out: `to` today, `from` six days before `to` — so `?to=2026-05-01` reads
 * the week the server would.
 */
function filtersFrom(params: URLSearchParams, today: string): MessageHistoryFilters {
  const kind = params.get('kind');
  const to = params.get('to') ?? today;
  return {
    from: params.get('from') ?? defaultFromFor(to, today),
    to,
    kind: MESSAGE_HISTORY_KINDS.includes(kind as MessageHistoryKind)
      ? (kind as MessageHistoryKind)
      : 'all',
    q: (params.get('q') ?? '').slice(0, MESSAGE_HISTORY_QUERY_MAX),
    unansweredOnly: params.get('unanswered') === '1',
  };
}

/** Each filter written only when it is not the default, so a plain visit stays a plain address. */
function writeFilters(
  current: URLSearchParams,
  next: MessageHistoryFilters,
  today: string,
): URLSearchParams {
  const copy = new URLSearchParams(current);
  const put = (key: string, value: string | null) => {
    if (value === null) copy.delete(key);
    else copy.set(key, value);
  };
  put('from', next.from === defaultFromFor(next.to, today) ? null : next.from);
  put('to', next.to === today ? null : next.to);
  put('kind', next.kind === 'all' ? null : next.kind);
  const q = historySearchText(next.q);
  put('q', q === '' ? null : q);
  put('unanswered', next.unansweredOnly ? '1' : null);
  return copy;
}

/**
 * A filter's own sentence for the first thing wrong with it, by the field and
 * the bound the server names (`MessageHistoryRules.Check`): a date that is
 * not one `required`; before the kept year `min` (either end); `from` after
 * `to` `from:conflict`; over 366 days `to:max`; a long search `q:max`.
 */
function violationText(
  t: TFunction,
  violation: FieldViolation | undefined,
  today: string,
  locale: Locale,
): string | null {
  if (!violation) return null;
  if (violation.field === 'q') {
    return t('messageHistory.errors.searchTooLong', { max: MESSAGE_HISTORY_QUERY_MAX });
  }
  if (violation.field !== 'from' && violation.field !== 'to') {
    return t('messageHistory.errors.refused');
  }
  switch (violation.bound) {
    case 'required':
      return t('messageHistory.errors.badDate');
    case 'min':
      return t('messageHistory.errors.tooOld', {
        date: localDateLabel(oldestHistoryDate(today), today, locale),
      });
    case 'conflict':
      return t('messageHistory.errors.fromAfterTo');
    case 'max':
      return t('messageHistory.errors.tooLong', { max: MESSAGE_HISTORY_MAX_RANGE_DAYS });
    default:
      return t('messageHistory.errors.refused');
  }
}

/**
 * A date box left empty. The server would take it as "not sent" and read its
 * default, which the box would not show — so the screen asks for a date
 * instead, under the server's own name for a missing one.
 */
function blankDates(filters: MessageHistoryFilters): FieldViolation[] {
  return (['from', 'to'] as const)
    .filter((field) => filters[field].trim() === '')
    .map((field) => ({ field, message: `${field} is a date, yyyy-MM-dd.`, bound: 'required' }));
}

function MessageHistory({
  branchId,
  timeZoneId,
}: {
  readonly branchId: string;
  readonly timeZoneId: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const today = branchDayKey(new Date(), timeZoneId as TimeZone);
  const filters = filtersFrom(params, today);
  const opened = parseThread(params.get('thread'));

  const fromId = useId();
  const toId = useId();
  const searchId = useId();
  const listTitleId = useId();
  const fromErrorId = useId();
  const toErrorId = useId();
  const searchErrorId = useId();

  // --- The filters -----------------------------------------------------------

  const local = [...blankDates(filters), ...messageHistoryViolations(filters, today)];
  const list = useMessageHistory(branchId, filters, local.length === 0);
  const server =
    list.error instanceof ValidationError && !list.isFetching ? list.error.violations : [];
  const violations = local.length > 0 ? local : server;
  const firstFor = (field: string) => violations.find((violation) => violation.field === field);
  const fromError = violationText(t, firstFor('from'), today, locale);
  const toError = violationText(t, firstFor('to'), today, locale);
  const searchError = violationText(t, firstFor('q'), today, locale);

  function update(next: Partial<MessageHistoryFilters>, replace = false) {
    setParams(
      (current) => writeFilters(current, { ...filtersFrom(current, today), ...next }, today),
      {
        replace,
      },
    );
  }

  // The search box: typed here, asked a moment after the last key. Back
  // brings an older search into the box again.
  const [draft, setDraft] = useState(filters.q);
  const [seenQ, setSeenQ] = useState(filters.q);
  if (filters.q !== seenQ) {
    setSeenQ(filters.q);
    if (historySearchText(draft) !== filters.q) setDraft(filters.q);
  }
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );
  function onSearchChange(value: string) {
    setDraft(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => update({ q: value }, true), SEARCH_DEBOUNCE_MS);
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    update({ q: draft }, true);
  }

  function clearFilters() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setDraft('');
    setParams(new URLSearchParams());
  }

  // --- The list ----------------------------------------------------------------

  const items: readonly MessageHistoryItem[] = list.data?.pages.flatMap((page) => page.items) ?? [];
  const selected =
    opened ?? (items[0] ? { kind: items[0].subject.kind, id: items[0].subject.id } : null);
  const selectedItem =
    (selected &&
      items.find(
        (item) => item.subject.kind === selected.kind && item.subject.id === selected.id,
      )) ??
    null;

  const rowButtonId = (item: MessageHistoryItem) =>
    `mh-row-${item.subject.kind}-${item.subject.id}`;
  const threadHeading = useRef<HTMLHeadingElement>(null);
  /** After "More": the first new row takes the focus, so the keyboard carries on from there. */
  const focusRow = useRef<number | null>(null);
  useEffect(() => {
    const index = focusRow.current;
    if (index === null || items.length <= index) return;
    focusRow.current = null;
    const item = items[index];
    if (item) document.getElementById(rowButtonId(item))?.focus();
  });
  /** Opened on a phone: the thread's heading takes the focus once that thread is on screen. */
  const focusThread = useRef<string | null>(null);
  const shownThread = selected ? threadParam(selected) : null;
  useEffect(() => {
    if (focusThread.current === null || focusThread.current !== shownThread) return;
    focusThread.current = null;
    threadHeading.current?.focus();
  });

  function openThread(item: MessageHistoryItem) {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        copy.set('thread', threadParam(item.subject));
        return copy;
      },
      { replace: true },
    );
    // Stacked on a phone, the thread is below the list: the focus goes to it.
    if (window.matchMedia?.(STACKED_QUERY).matches) {
      focusThread.current = threadParam(item.subject);
    }
  }

  function backToList() {
    const target = selectedItem ? document.getElementById(rowButtonId(selectedItem)) : null;
    (target ?? document.getElementById(listTitleId))?.focus();
  }

  const filtered =
    filters.kind !== 'all' || filters.unansweredOnly || historySearchText(filters.q) !== '';

  let body;
  if (violations.length > 0) {
    body = (
      <p className="yc-alert yc-mh-pad" role="alert">
        {t('messageHistory.errors.refused')}
      </p>
    );
  } else if (list.isPending) {
    body = (
      <p className="yc-empty-line" role="status">
        {t('loading')}
      </p>
    );
  } else if (list.isError && !list.data) {
    body = (
      <div className="yc-mh-pad">
        <QueryFailureNotice error={list.error} onRetry={() => void list.refetch()} />
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="yc-empty">
        <h3 className="yc-h2">{t('messageHistory.empty.title')}</h3>
        <p>{filtered ? t('messageHistory.empty.filtered') : t('messageHistory.empty.hint')}</p>
        {filtered ? (
          <button type="button" className="yc-btn yc-btn-sec yc-btn-sm" onClick={clearFilters}>
            {t('messageHistory.empty.reset')}
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <div className="yc-tscroll">
        <table className="yc-tbl yc-mh-tbl" aria-busy={list.isPlaceholderData || undefined}>
          <caption className="yc-sr">{t('messageHistory.table.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('messageHistory.table.when')}</th>
              <th scope="col">{t('messageHistory.table.guest')}</th>
              <th scope="col">{t('messageHistory.table.subject')}</th>
              <th scope="col" className="yc-num">
                {t('messageHistory.table.messages')}
              </th>
              <th scope="col">{t('messageHistory.table.staff')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isOpen =
                selected?.kind === item.subject.kind && selected.id === item.subject.id;
              const staff = item.staffNames.map(firstName).join(', ');
              return (
                <tr key={item.conversationId} className={isOpen ? 'is-on' : undefined}>
                  <td>{whenLabel(t, item.lastLocal, today, locale)}</td>
                  <th scope="row">
                    <button
                      type="button"
                      id={rowButtonId(item)}
                      className="yc-mh-guest"
                      aria-current={isOpen ? 'true' : undefined}
                      onClick={() => openThread(item)}
                    >
                      {shortName(item.subject.guestName)}
                    </button>
                  </th>
                  <td className="yc-mh-wrap">
                    {subjectParts(t, item, locale).map((part, index) => (
                      <Fragment key={index}>
                        {index > 0 ? ' · ' : null}
                        <span className="yc-mh-part">{part}</span>
                      </Fragment>
                    ))}
                  </td>
                  <td className="yc-num">
                    {item.messageCount}
                    {item.unanswered ? (
                      <span className="yc-mh-open">{t('messageHistory.table.unanswered')}</span>
                    ) : null}
                  </td>
                  <td className="yc-mh-staff">
                    {staff || (
                      <>
                        <span aria-hidden="true">{'—'}</span>
                        <span className="yc-sr">{t('messageHistory.table.noStaff')}</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <form
        role="search"
        aria-label={t('messageHistory.filters.label')}
        className="yc-mh-filters"
        onSubmit={onSubmit}
      >
        <div className="yc-fld">
          <label htmlFor={fromId}>{t('messageHistory.filters.from')}</label>
          <input
            id={fromId}
            type="date"
            className="yc-ctl"
            value={filters.from}
            min={oldestHistoryDate(today)}
            max={today}
            required
            aria-invalid={fromError ? true : undefined}
            aria-describedby={fromError ? fromErrorId : undefined}
            onChange={(event) => update({ from: event.target.value })}
          />
          {fromError ? (
            <span id={fromErrorId} className="yc-err">
              {fromError}
            </span>
          ) : null}
        </div>
        <div className="yc-fld">
          <label htmlFor={toId}>{t('messageHistory.filters.to')}</label>
          <input
            id={toId}
            type="date"
            className="yc-ctl"
            value={filters.to}
            min={isLocalDate(filters.from) ? filters.from : oldestHistoryDate(today)}
            max={today}
            required
            aria-invalid={toError ? true : undefined}
            aria-describedby={toError ? toErrorId : undefined}
            onChange={(event) => update({ to: event.target.value })}
          />
          {toError ? (
            <span id={toErrorId} className="yc-err">
              {toError}
            </span>
          ) : null}
        </div>
        <div className="yc-fld yc-fld-grow">
          <label htmlFor={searchId}>{t('messageHistory.filters.search')}</label>
          <div className="yc-search">
            <SearchIcon />
            <input
              id={searchId}
              type="search"
              className="yc-ctl"
              value={draft}
              maxLength={MESSAGE_HISTORY_QUERY_MAX}
              autoComplete="off"
              enterKeyHint="search"
              placeholder={t('messageHistory.filters.searchPlaceholder')}
              aria-invalid={searchError ? true : undefined}
              aria-describedby={searchError ? searchErrorId : undefined}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
          {searchError ? (
            <span id={searchErrorId} className="yc-err">
              {searchError}
            </span>
          ) : null}
        </div>
        <div
          className="yc-chips yc-mh-kinds"
          role="group"
          aria-label={t('messageHistory.filters.kind')}
        >
          {MESSAGE_HISTORY_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={kind === filters.kind ? 'yc-chip is-on' : 'yc-chip'}
              aria-pressed={kind === filters.kind}
              onClick={() => update({ kind })}
            >
              {t(`messageHistory.filters.kinds.${kind}`)}
            </button>
          ))}
        </div>
        <label className="yc-check-line yc-mh-check">
          <input
            type="checkbox"
            checked={filters.unansweredOnly}
            onChange={(event) => update({ unansweredOnly: event.target.checked })}
          />
          {t('messageHistory.filters.unansweredOnly')}
        </label>
      </form>

      <div className="yc-mh-layout">
        <section className="yc-card yc-mh-list" aria-labelledby={listTitleId}>
          <h2 id={listTitleId} className="yc-sr" tabIndex={-1}>
            {t('messageHistory.table.label')}
          </h2>
          {body}
          {items.length > 0 && violations.length === 0 ? (
            <div className="yc-mh-foot">
              <span role="status" aria-atomic="true">
                {list.isPlaceholderData
                  ? t('messageHistory.updating')
                  : t('messageHistory.shown', { count: items.length })}
              </span>
              {list.hasNextPage ? (
                <button
                  type="button"
                  className="yc-btn yc-btn-sec yc-btn-sm"
                  disabled={list.isFetchingNextPage}
                  onClick={() => {
                    focusRow.current = items.length;
                    void list.fetchNextPage();
                  }}
                >
                  {list.isFetchingNextPage ? t('loading') : t('messageHistory.more')}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {selected ? (
          <HistoryThread
            key={threadParam(selected)}
            subject={selected}
            item={selectedItem}
            timeZoneId={timeZoneId}
            today={today}
            headingRef={threadHeading}
            onBack={backToList}
          />
        ) : (
          <section className="yc-card yc-mh-thread yc-mh-none">
            <p className="yc-mh-note">{t('messageHistory.thread.pick')}</p>
            <p className="yc-mh-privacy">{t('messageHistory.thread.privacy')}</p>
          </section>
        )}
      </div>
    </>
  );
}
