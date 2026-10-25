import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_MONEY_KEPT_DAYS,
  ACTIVITY_QUERY_MAX,
  ValidationError,
  activitySearchText,
  activityViolations,
  addLocalDays,
  isLocalDate,
  type ActivityCategoryFilter,
  type ActivityEntry,
  type ActivityFilters,
  type ActivityWho,
  type FieldViolation,
  type StaffMember,
} from '@yalla/api';
import { useActivity, useConsoleGateway, useStaff } from '@yalla/api/react';
import { branchDayKey, type Locale, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useCurrentUser } from '../../../auth/useCurrentUser';
import { shortName } from '../../../messages/messageText';
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
  useFileExport,
  usePagedRows,
  useUrlFilters,
  type UrlFilterCodec,
} from '../../kit';
import { PageHeader } from '../../ui/PageHeader';
import { DownloadIcon, SearchIcon } from '../../ui/icons';
import { useVenueOutlet } from '../VenueLayout';
import {
  actionLabel,
  changeLine,
  detailParts,
  deviceLabel,
  kindLabel,
  kindTone,
  subjectLink,
  timeLabel,
  whatLabel,
  whenLabel,
  whoLabel,
} from './activityText';

/** How long the search waits after the last key before it asks. */
const SEARCH_DEBOUNCE_MS = 350;
/** Panes stack below this width (`console.css`): picking an entry moves the focus to it. */
const STACKED_QUERY = '(max-width: 1179px)';

const KINDS: readonly ActivityCategoryFilter[] = ['all', ...ACTIVITY_CATEGORIES];

/** A row's button, by the entry: the focus returns to it from the detail. */
const rowButtonId = (entry: Pick<ActivityEntry, 'id'>) => `act-row-${entry.id}`;

/**
 * The venue console's History (2026-10-24, the Main board): who did what at
 * the branch on one day, when, and from which device — for the owner, the
 * general manager and the branch manager (their own branch).
 *
 * - **The filters live in the address** (`date`, `who`, `kind`, `q`, and the
 *   open `entry`), so Back and a reload keep them. The day, the person and
 *   the kind are new history entries; the search and the open entry replace
 *   the current one.
 * - **The detail beside the list** says who, when and from where, what
 *   changed and why, and opens the bill's, the booking's or the order's
 *   whole timeline.
 * - **CSV** downloads the server's own file for the filters on screen.
 */
export function ActivityScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId, branchName, timeZoneId } = useVenueOutlet();
  const [, setParams] = useSearchParams();

  // Another branch is another list: the open entry closes, the filters stay.
  const shownBranch = useRef(branchId);
  useEffect(() => {
    if (shownBranch.current !== null && shownBranch.current !== branchId) {
      setParams(
        (current) => {
          const copy = new URLSearchParams(current);
          copy.delete('entry');
          return copy;
        },
        { replace: true },
      );
    }
    shownBranch.current = branchId;
  }, [branchId, setParams]);

  return (
    <div className="yc-page">
      {branchId ? (
        <ActivityHistory
          key={branchId}
          branchId={branchId}
          branchName={branchName ?? ''}
          timeZoneId={timeZoneId}
        />
      ) : (
        <>
          <PageHeader title={t('activity.title')} />
          <EmptyLine card>{t('menu.noBranch')}</EmptyLine>
        </>
      )}
    </div>
  );
}

function parseWho(value: string | null): ActivityWho {
  if (!value) return { kind: 'everyone' };
  if (value === 'system') return { kind: 'system' };
  return { kind: 'staff', staffMemberId: value };
}

function whoParam(who: ActivityWho): string | null {
  return who.kind === 'everyone' ? null : who.kind === 'system' ? 'system' : who.staffMemberId;
}

/** The filters in the address, each written only when it is not the default. */
function activityCodec(today: string): UrlFilterCodec<ActivityFilters> {
  return {
    read: (params) => ({
      date: params.get('date') ?? today,
      who: parseWho(params.get('who')),
      category: pickParam(params.get('kind'), KINDS, 'all'),
      q: (params.get('q') ?? '').slice(0, ACTIVITY_QUERY_MAX),
    }),
    write: (params, next) => {
      putParam(params, 'date', next.date === today ? null : next.date);
      putParam(params, 'who', whoParam(next.who));
      putParam(params, 'kind', next.category === 'all' ? null : next.category);
      const q = activitySearchText(next.q);
      putParam(params, 'q', q === '' ? null : q);
      // Another list: the entry open on the last one may not be on this one.
      params.delete('entry');
    },
  };
}

const entryIdOf = (entry: ActivityEntry) => entry.id;

function violationText(t: TFunction, violation: FieldViolation | undefined): string | null {
  if (!violation) return null;
  if (violation.field === 'q') {
    return t('activity.errors.searchTooLong', { max: ACTIVITY_QUERY_MAX });
  }
  if (violation.field !== 'date') return t('activity.errors.refused');
  switch (violation.bound) {
    case 'required':
      return t('activity.errors.badDate');
    case 'max':
      return t('activity.errors.future');
    case 'min':
      return t('activity.errors.tooOld');
    default:
      return t('activity.errors.refused');
  }
}

function ActivityHistory({
  branchId,
  branchName,
  timeZoneId,
}: {
  readonly branchId: string;
  readonly branchName: string;
  readonly timeZoneId: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const gateway = useConsoleGateway();
  const location = useLocation();
  const { user } = useCurrentUser();
  const today = branchDayKey(new Date(), timeZoneId as TimeZone);
  const { params, filters, update, setParam, clear } = useUrlFilters(activityCodec(today));
  const openId = params.get('entry');

  const whoId = useId();
  const searchId = useId();
  const listTitleId = useId();
  const searchErrorId = useId();
  const detailHeadingId = useId();

  // --- The people of the branch, for "Who" -----------------------------------

  const staff = useStaff(user?.scope.venueId ?? undefined);
  const people: readonly StaffMember[] = useMemo(
    () =>
      (staff.data ?? [])
        .filter((member) => member.branchId === null || member.branchId === branchId)
        .filter((member) => member.role !== 'kitchen' || member.isActive)
        .slice()
        .sort((a, b) => a.fullName.localeCompare(b.fullName, locale)),
    [staff.data, branchId, locale],
  );
  /** Anybody of the venue by id, a deactivated person too: who made a device's code. */
  const nameOf = useCallback(
    (staffMemberId: string) =>
      staff.data?.find((member) => member.id === staffMemberId)?.fullName ?? null,
    [staff.data],
  );

  // --- The filters -------------------------------------------------------------

  const blank: FieldViolation[] =
    filters.date.trim() === ''
      ? [{ field: 'date', message: 'date is a date, yyyy-MM-dd.', bound: 'required' }]
      : [];
  const local = blank.length > 0 ? blank : [...activityViolations(filters, today)];
  const list = useActivity(branchId, filters, local.length === 0);
  const server =
    list.error instanceof ValidationError && !list.isFetching ? list.error.violations : [];
  const violations = local.length > 0 ? local : server;
  const firstFor = (field: string) => violations.find((violation) => violation.field === field);
  const dateError = violationText(t, firstFor('date'));
  const searchError = violationText(t, firstFor('q'));

  const [draft, setDraft] = useState(filters.q);
  const [seenQ, setSeenQ] = useState(filters.q);
  if (filters.q !== seenQ) {
    setSeenQ(filters.q);
    if (activitySearchText(draft) !== filters.q) setDraft(filters.q);
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

  // --- CSV ---------------------------------------------------------------------

  const csv = useFileExport();
  function exportCsv() {
    if (violations.length > 0) return;
    // A day over the server's file limit says so, and how to narrow it.
    void csv.run(() => gateway.exportActivityCsv(branchId, filters), t('activity.csvReady'));
  }

  // --- The list ------------------------------------------------------------------

  const paged = usePagedRows(list, entryIdOf, (entry) =>
    document.getElementById(rowButtonId(entry))?.focus(),
  );
  const items = paged.rows;
  const selected = items.find((entry) => entry.id === openId) ?? items[0] ?? null;
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const focusDetail = useRef<string | null>(null);
  useEffect(() => {
    if (focusDetail.current === null || focusDetail.current !== selected?.id) return;
    focusDetail.current = null;
    detailHeading.current?.focus();
  });

  // Stable while the search is typed, so the rows (memoised below) are not redrawn per key.
  const openEntry = useCallback(
    (entry: ActivityEntry) => {
      setParam('entry', entry.id, { replace: true });
      if (window.matchMedia?.(STACKED_QUERY).matches) focusDetail.current = entry.id;
    },
    [setParam],
  );

  const filtered =
    filters.category !== 'all' ||
    filters.who.kind !== 'everyone' ||
    activitySearchText(filters.q) !== '';
  const isToday = filters.date === today;

  let body;
  if (violations.length > 0) {
    // A link with a bad day or person in it: say so, and offer the way back to today.
    body = (
      <div className="yc-mh-pad yc-act-refused">
        <p className="yc-alert" role="alert">
          {t('activity.errors.refused')}
        </p>
        <button type="button" className="yc-btn yc-btn-sec yc-btn-sm" onClick={clearFilters}>
          {t('activity.empty.reset')}
        </button>
      </div>
    );
  } else if (list.isPending) {
    body = <LoadingLine />;
  } else if (list.isError && !list.data) {
    body = <QueryFailure query={list} frame="list" />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        title={t('activity.empty.title')}
        action={
          filtered ? (
            <button type="button" className="yc-btn yc-btn-sec yc-btn-sm" onClick={clearFilters}>
              {t('activity.empty.reset')}
            </button>
          ) : null
        }
      >
        {filtered ? t('activity.empty.filtered') : t('activity.empty.hint')}
      </EmptyState>
    );
  } else {
    body = (
      <ActivityTable
        items={items}
        selectedId={selected?.id ?? null}
        busy={list.isPlaceholderData}
        timeZoneId={timeZoneId}
        locale={locale}
        nameOf={nameOf}
        onOpen={openEntry}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={t('activity.title')}
        sub={t('activity.sub', { branch: branchName })}
        actions={
          <button
            type="button"
            className="yc-btn yc-btn-sec"
            onClick={exportCsv}
            disabled={csv.busy || violations.length > 0}
            aria-busy={csv.busy || undefined}
          >
            <DownloadIcon />
            {csv.busy ? t('activity.csvPreparing') : t('activity.csv')}
          </button>
        }
      />

      <form
        role="search"
        aria-label={t('activity.filters.label')}
        className="yc-mh-filters"
        onSubmit={onSubmit}
      >
        <DateField
          label={t('activity.filters.date')}
          // A day the address got wrong shows as empty (with its error), not as text the input refuses.
          value={isLocalDate(filters.date) ? filters.date : ''}
          min={addLocalDays(today, -ACTIVITY_MONEY_KEPT_DAYS)}
          max={today}
          required
          error={dateError}
          onChange={(date) => update({ date })}
        />
        <div className="yc-fld">
          <label htmlFor={whoId}>{t('activity.filters.who')}</label>
          <select
            id={whoId}
            className="yc-ctl"
            value={whoParam(filters.who) ?? ''}
            onChange={(event) => update({ who: parseWho(event.target.value || null) })}
          >
            <option value="">{t('activity.filters.everyone')}</option>
            {people.map((member) => (
              <option key={member.id} value={member.id}>
                {t('activity.filters.person', {
                  name: shortName(member.fullName),
                  role: t(`role.${member.role}`),
                })}
              </option>
            ))}
            {/* Somebody filtered for from the address and not (or no longer) on the list. */}
            {filters.who.kind === 'staff' &&
            !people.some(
              (member) => filters.who.kind === 'staff' && member.id === filters.who.staffMemberId,
            ) ? (
              <option value={filters.who.staffMemberId}>{t('activity.filters.someone')}</option>
            ) : null}
            <option value="system">{t('activity.filters.system')}</option>
          </select>
        </div>
        <div className="yc-fld yc-fld-grow">
          <label htmlFor={searchId}>{t('activity.filters.search')}</label>
          <div className="yc-search">
            <SearchIcon />
            <input
              id={searchId}
              type="search"
              className="yc-ctl"
              value={draft}
              maxLength={ACTIVITY_QUERY_MAX}
              autoComplete="off"
              enterKeyHint="search"
              placeholder={t('activity.filters.searchPlaceholder')}
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
      </form>
      <ChipGroup
        className="yc-act-kinds"
        label={t('activity.filters.kind')}
        value={filters.category}
        options={KINDS.map((kind) => ({ value: kind, label: kindLabel(t, kind) }))}
        onChange={(category) => update({ category })}
      />

      <div className="yc-mh-layout">
        <section className="yc-card yc-mh-list" aria-labelledby={listTitleId}>
          <h2 id={listTitleId} className="yc-sr" tabIndex={-1}>
            {t('activity.table.label')}
          </h2>
          {body}
          {items.length > 0 && violations.length === 0 ? (
            <PagedFooter
              status={
                list.isPlaceholderData
                  ? t('activity.updating')
                  : isToday
                    ? t('activity.shownToday', { count: items.length })
                    : t('activity.shown', { count: items.length })
              }
              moreLabel={t('activity.more')}
              hasMore={paged.hasMore}
              loadingMore={paged.loadingMore}
              onMore={paged.more}
            />
          ) : null}
        </section>

        {selected && violations.length === 0 ? (
          <EntryDetail
            entry={selected}
            nameOf={nameOf}
            timeZoneId={timeZoneId}
            today={today}
            headingId={detailHeadingId}
            headingRef={detailHeading}
            from={`${location.pathname}${location.search}`}
            onBack={() => {
              const row = document.getElementById(rowButtonId(selected));
              (row ?? document.getElementById(listTitleId))?.focus();
            }}
          />
        ) : (
          <aside
            className="yc-card yc-act-detail yc-mh-none"
            aria-label={t('activity.detail.label')}
          >
            <p className="yc-mh-note">{t('activity.detail.pick')}</p>
          </aside>
        )}
      </div>
    </>
  );
}

/**
 * The feed's table. Memoised: typing in the search (the draft, before its
 * debounce) and the footer's status redraw the page, never a few hundred rows
 * of formatted labels.
 */
const ActivityTable = memo(function ActivityTable({
  items,
  selectedId,
  busy,
  timeZoneId,
  locale,
  nameOf,
  onOpen,
}: {
  readonly items: readonly ActivityEntry[];
  readonly selectedId: string | null;
  readonly busy: boolean;
  readonly timeZoneId: string;
  readonly locale: Locale;
  readonly nameOf: (staffMemberId: string) => string | null;
  readonly onOpen: (entry: ActivityEntry) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <DataTable className="yc-act-tbl" caption={t('activity.table.caption')} busy={busy}>
      <TableHead
        columns={[
          { label: t('activity.table.time') },
          { label: t('activity.table.who') },
          { label: t('activity.table.what') },
          { label: t('activity.table.device') },
        ]}
      />
      <tbody>
        {items.map((entry) => {
          const isOpen = selectedId === entry.id;
          const device = deviceLabel(t, entry);
          return (
            <tr
              key={entry.id}
              className={[isOpen ? 'is-on' : '', entry.isMoney ? 'is-money' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <td className="yc-num-time">{timeLabel(entry, timeZoneId, locale)}</td>
              <td className="yc-act-who">{whoLabel(t, entry)}</td>
              <th scope="row" className="yc-act-what">
                <button
                  type="button"
                  id={rowButtonId(entry)}
                  className="yc-act-pick"
                  aria-current={isOpen ? 'true' : undefined}
                  onClick={() => onOpen(entry)}
                >
                  <span className={`yc-act-tag ${kindTone(entry)}`}>
                    {kindLabel(t, entry.category)}
                  </span>{' '}
                  {whatLabel(t, entry, locale, nameOf)}
                </button>
              </th>
              <td className="yc-act-dev">
                {device ?? <NoValue label={t('activity.device.none')} />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
});

function EntryDetail({
  entry,
  nameOf,
  timeZoneId,
  today,
  headingId,
  headingRef,
  from,
  onBack,
}: {
  readonly entry: ActivityEntry;
  readonly nameOf: (staffMemberId: string) => string | null;
  readonly timeZoneId: string;
  readonly today: string;
  readonly headingId: string;
  readonly headingRef: Ref<HTMLHeadingElement>;
  /** The History address, so the timeline's "back" returns to these filters. */
  readonly from: string;
  readonly onBack: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const change = changeLine(entry, locale);
  const link = subjectLink(entry);
  const device = deviceLabel(t, entry);
  // What changed has its own block below: said once.
  const details = detailParts(t, entry, locale, nameOf).filter(
    (part) => !change || part !== `${change.before} → ${change.after}`,
  );
  return (
    <aside className="yc-card yc-act-detail" aria-labelledby={headingId}>
      <span className={`yc-act-tag ${kindTone(entry)}`}>{kindLabel(t, entry.category)}</span>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="yc-act-dh">
        {actionLabel(t, entry, locale)}
      </h2>
      {details.length > 0 ? <p className="yc-act-dsub">{details.join(' · ')}</p> : null}
      <dl className="yc-act-dl">
        <dt>{t('activity.detail.who')}</dt>
        <dd className="yc-act-strong">{whoLabel(t, entry)}</dd>
        <dt>{t('activity.detail.when')}</dt>
        <dd>{whenLabel(t, entry, timeZoneId, today, locale)}</dd>
        <dt>{t('activity.detail.device')}</dt>
        <dd>{device ?? '—'}</dd>
      </dl>
      {change || entry.reason ? (
        <div className="yc-act-change">
          <span className="yc-act-change-h">{t('activity.detail.changed')}</span>
          {change ? (
            <span>
              <s className="yc-act-before">
                <span className="yc-sr">{t('activity.detail.before')} </span>
                {change.before}
              </s>{' '}
              <span aria-hidden="true">→</span>{' '}
              <b className="yc-act-after">
                <span className="yc-sr">{t('activity.detail.after')} </span>
                {change.after}
              </b>
            </span>
          ) : null}
          {entry.reason ? (
            <span className="yc-muted">
              {t('activity.detail.reason', { reason: entry.reason })}
            </span>
          ) : null}
        </div>
      ) : null}
      {link ? (
        <Link className="yc-btn yc-btn-sec yc-act-open" to={link.to} state={{ from }}>
          {t(link.labelKey)}
        </Link>
      ) : null}
      <button type="button" className="yc-mh-back yc-btn yc-btn-sec yc-btn-sm" onClick={onBack}>
        {t('activity.detail.back')}
      </button>
    </aside>
  );
}
