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
} from '@yalla/api';
import { useMessageHistory } from '@yalla/api/react';
import { branchDayKey, type Locale, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { firstName, shortName } from '../../../messages/messageText';
import {
  ChipGroup,
  DataTable,
  DateField,
  EmptyLine,
  EmptyState,
  LoadingLine,
  NoValue,
  PagedFooter,
  QueryFailure,
  TableHead,
  pickParam,
  putParam,
  usePagedRows,
  useUrlFilters,
  type UrlFilterCodec,
} from '../../kit';
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
        <EmptyLine card>{t('menu.noBranch')}</EmptyLine>
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

/** A row's button, by its conversation's subject: the focus returns to it from the thread. */
const rowButtonId = (item: MessageHistoryItem) => `mh-row-${item.subject.kind}-${item.subject.id}`;

const conversationIdOf = (item: MessageHistoryItem) => item.conversationId;

/**
 * The server's `from` for a given `to` (six days before it, never before the
 * kept year); today−6 while `to` is not a day.
 */
function defaultFromFor(to: string, today: string): string {
  return isLocalDate(to) ? defaultHistoryFrom(to, today) : defaultMessageHistoryFilters(today).from;
}

/**
 * The filters in the address, the server's defaults for whatever it leaves
 * out: `to` today, `from` six days before `to` — so `?to=2026-05-01` reads
 * the week the server would. Each is written only when it is not the default.
 */
function historyCodec(today: string): UrlFilterCodec<MessageHistoryFilters> {
  return {
    read: (params) => {
      const to = params.get('to') ?? today;
      return {
        from: params.get('from') ?? defaultFromFor(to, today),
        to,
        kind: pickParam(params.get('kind'), MESSAGE_HISTORY_KINDS, 'all'),
        q: (params.get('q') ?? '').slice(0, MESSAGE_HISTORY_QUERY_MAX),
        unansweredOnly: params.get('unanswered') === '1',
      };
    },
    write: (params, next) => {
      putParam(params, 'from', next.from === defaultFromFor(next.to, today) ? null : next.from);
      putParam(params, 'to', next.to === today ? null : next.to);
      putParam(params, 'kind', next.kind === 'all' ? null : next.kind);
      const q = historySearchText(next.q);
      putParam(params, 'q', q === '' ? null : q);
      putParam(params, 'unanswered', next.unansweredOnly ? '1' : null);
    },
  };
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
  const today = branchDayKey(new Date(), timeZoneId as TimeZone);
  const { params, filters, update, setParam, clear } = useUrlFilters(historyCodec(today));
  const opened = parseThread(params.get('thread'));

  const searchId = useId();
  const listTitleId = useId();
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
    searchTimer.current = setTimeout(
      () => update({ q: value }, { replace: true }),
      SEARCH_DEBOUNCE_MS,
    );
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    update({ q: draft }, { replace: true });
  }

  function clearFilters() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setDraft('');
    clear();
  }

  // --- The list ----------------------------------------------------------------

  /** After "More": the first new row takes the focus, so the keyboard carries on from there. */
  const paged = usePagedRows(list, conversationIdOf, (item) =>
    document.getElementById(rowButtonId(item))?.focus(),
  );
  const items = paged.rows;
  const selected =
    opened ?? (items[0] ? { kind: items[0].subject.kind, id: items[0].subject.id } : null);
  const selectedItem =
    (selected &&
      items.find(
        (item) => item.subject.kind === selected.kind && item.subject.id === selected.id,
      )) ??
    null;

  const threadHeading = useRef<HTMLHeadingElement>(null);
  /** Opened on a phone: the thread's heading takes the focus once that thread is on screen. */
  const focusThread = useRef<string | null>(null);
  const shownThread = selected ? threadParam(selected) : null;
  useEffect(() => {
    if (focusThread.current === null || focusThread.current !== shownThread) return;
    focusThread.current = null;
    threadHeading.current?.focus();
  });

  function openThread(item: MessageHistoryItem) {
    setParam('thread', threadParam(item.subject), { replace: true });
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
    body = <LoadingLine />;
  } else if (list.isError && !list.data) {
    body = <QueryFailure query={list} frame="list" />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        title={t('messageHistory.empty.title')}
        action={
          filtered ? (
            <button type="button" className="yc-btn yc-btn-sec yc-btn-sm" onClick={clearFilters}>
              {t('messageHistory.empty.reset')}
            </button>
          ) : null
        }
      >
        {filtered ? t('messageHistory.empty.filtered') : t('messageHistory.empty.hint')}
      </EmptyState>
    );
  } else {
    body = (
      <DataTable
        className="yc-mh-tbl"
        caption={t('messageHistory.table.caption')}
        busy={list.isPlaceholderData}
      >
        <TableHead
          columns={[
            { label: t('messageHistory.table.when') },
            { label: t('messageHistory.table.guest') },
            { label: t('messageHistory.table.subject') },
            { label: t('messageHistory.table.messages'), numeric: true },
            { label: t('messageHistory.table.staff') },
          ]}
        />
        <tbody>
          {items.map((item) => {
            const isOpen = selected?.kind === item.subject.kind && selected.id === item.subject.id;
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
                  {staff || <NoValue label={t('messageHistory.table.noStaff')} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
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
        <DateField
          label={t('messageHistory.filters.from')}
          value={filters.from}
          min={oldestHistoryDate(today)}
          max={today}
          required
          error={fromError}
          onChange={(from) => update({ from })}
        />
        <DateField
          label={t('messageHistory.filters.to')}
          value={filters.to}
          min={isLocalDate(filters.from) ? filters.from : oldestHistoryDate(today)}
          max={today}
          required
          error={toError}
          onChange={(to) => update({ to })}
        />
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
        <ChipGroup
          className="yc-mh-kinds"
          label={t('messageHistory.filters.kind')}
          value={filters.kind}
          options={MESSAGE_HISTORY_KINDS.map((kind) => ({
            value: kind,
            label: t(`messageHistory.filters.kinds.${kind}`),
          }))}
          onChange={(kind) => update({ kind })}
        />
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
            <PagedFooter
              status={
                list.isPlaceholderData
                  ? t('messageHistory.updating')
                  : t('messageHistory.shown', { count: items.length })
              }
              moreLabel={t('messageHistory.more')}
              hasMore={paged.hasMore}
              loadingMore={paged.loadingMore}
              onMore={paged.more}
            />
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
