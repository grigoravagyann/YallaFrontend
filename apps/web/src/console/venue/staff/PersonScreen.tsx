import {
  STAFF_RECENT_LISTS,
  performanceRange,
  type ActivityEntry,
  type PerformancePeriod,
  type PerformanceRange,
  type StaffMemberPerformance,
  type StaffRecentList,
} from '@yalla/api';
import { useStaffMemberPerformance, useStaffRecent } from '@yalla/api/react';
import { branchDayKey, type Locale, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { shortName } from '../../../messages/messageText';
import {
  DataTable,
  EmptyLine,
  LoadingLine,
  PagedFooter,
  QueryFailure,
  TableHead,
  putParam,
  usePagedRows,
  useUrlFilters,
  type UrlFilterCodec,
} from '../../kit';
import { initialsOf } from '../../ui/ConsoleShell';
import { ChevronLeftIcon } from '../../ui/icons';
import { Tabs, panelId, tabId } from '../../ui/Tabs';
import {
  actionLabel,
  detailParts,
  dram,
  durationLabel,
  subjectLink,
  timeLabel,
  whenLabel,
} from '../activity/activityText';
import { useVenueOutlet } from '../VenueLayout';
import { SalesChart } from './SalesChart';
import { PeriodChips, periodCaption, periodFrom } from './StaffResults';

/** The period in the address, today left out. */
const personCodec: UrlFilterCodec<{ readonly period: PerformancePeriod }> = {
  read: (params) => ({ period: periodFrom(params.get('period')) }),
  write: (params, next) => putParam(params, 'period', next.period === 'today' ? null : next.period),
};

const entryIdOf = (item: ActivityEntry) => item.id;

/**
 * One person's results (2026-10-24, the Person board): their figures over
 * today, seven or thirty days, sales by day (a week at least), and what they
 * did — orders, messages answered, bookings decided, cash taken, calls
 * claimed — one list at a time (the route's `list`), a page at a time by its
 * cursor. `/venue/staff/:staffMemberId`, from Staff → Results.
 */
export function PersonScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const { branchId, branchName, timeZoneId } = useVenueOutlet();
  const { staffMemberId } = useParams();
  const { filters, update } = useUrlFilters(personCodec);
  const today = branchDayKey(new Date(), timeZoneId as TimeZone);
  const period = filters.period;
  const range = performanceRange(period, today);
  const query = useStaffMemberPerformance(branchId ?? undefined, staffMemberId, range);
  const person = query.data ?? null;

  const back = (
    <Link
      to={`/venue/staff?tab=results${period === 'today' ? '' : `&period=${period}`}`}
      className="yc-lnk yc-lnk-back yc-tl-back"
    >
      <ChevronLeftIcon />
      {t('person.back')}
    </Link>
  );

  if (!branchId || !staffMemberId) {
    return (
      <div className="yc-page">
        {back}
        <EmptyLine card>{t('person.gone')}</EmptyLine>
      </div>
    );
  }

  return (
    <div className="yc-page yc-pp-page">
      {back}
      {query.isPending ? (
        <LoadingLine card />
      ) : query.isError && !query.data ? (
        <QueryFailure query={query} frame="card" />
      ) : person === null ? (
        <EmptyLine card>{t('person.gone')}</EmptyLine>
      ) : (
        <>
          <div className="yc-pp-head">
            <span className="yc-pp-av" aria-hidden="true">
              {initialsOf(person.name)}
            </span>
            <div className="yc-pp-title">
              <h1 className="yc-h1">{person.name}</h1>
              <p className="yc-sub">
                {[t(`role.${person.role}`), branchName].filter(Boolean).join(' · ')}
              </p>
            </div>
            <PeriodChips
              value={period}
              onChange={(next) => update({ period: next }, { replace: true })}
            />
          </div>

          <Kpis person={person} locale={locale} caption={periodCaption(t, range, today, locale)} />

          <figure className="yc-card yc-pp-chart">
            {/* The server's series: a week ending on the day at least, so never one bar. */}
            <figcaption className="yc-h2">
              {t('person.chart.title', { count: person.daily.length })}
            </figcaption>
            <SalesChart daily={person.daily} today={today} locale={locale} />
          </figure>

          <RecentLists
            key={`${person.staffMemberId}-${range.from}`}
            branchId={branchId}
            person={person}
            range={range}
            timeZoneId={timeZoneId}
            today={today}
          />
        </>
      )}
    </div>
  );
}

function Kpis({
  person,
  locale,
  caption,
}: {
  readonly person: StaffMemberPerformance;
  readonly locale: Locale;
  readonly caption: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const f = person.figures;
  const none = t('person.kpi.none');
  const tipShare =
    f.salesAmd > 0
      ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
          f.tipsAmd / f.salesAmd,
        )
      : null;
  const tiles: readonly { label: string; value: string; sub: string | null }[] = [
    {
      label: t('person.kpi.sales'),
      value: dram(f.salesAmd, locale),
      sub: t('person.kpi.tables', { count: f.tables }),
    },
    {
      label: t('person.kpi.guests'),
      value: new Intl.NumberFormat(locale).format(f.guests),
      sub:
        f.averageCheckAmd !== null
          ? t('person.kpi.avgCheck', { amount: dram(f.averageCheckAmd, locale) })
          : null,
    },
    {
      label: t('person.kpi.tips'),
      value: dram(f.tipsAmd, locale),
      sub: tipShare ? t('person.kpi.tipShare', { share: tipShare }) : null,
    },
    {
      label: t('person.kpi.calls'),
      value: durationLabel(t, f.callMedianSeconds) ?? none,
      sub: t('person.kpi.callsSub', { count: f.callsClaimed }),
    },
    {
      label: t('person.kpi.replies'),
      value: durationLabel(t, f.replyMedianSeconds) ?? none,
      sub: t('person.kpi.repliesSub', { count: f.messagesAnswered }),
    },
    {
      label: t('person.kpi.approvals'),
      value: new Intl.NumberFormat(locale).format(f.approvals),
      sub: t('person.kpi.declinedSub', { count: f.declines }),
    },
    {
      label: t('person.kpi.cash'),
      value: dram(f.cashAmd, locale),
      sub: t('person.kpi.cashSub', { count: f.cashPayments }),
    },
  ];
  return (
    <section className="yc-pp-kpis" aria-label={t('person.kpi.label', { period: caption })}>
      {tiles.map((tile) => (
        <div key={tile.label} className="yc-card yc-pp-kpi">
          <span className="yc-kpi-l">{tile.label}</span>
          <b className="yc-pp-kpi-n">{tile.value}</b>
          {tile.sub ? <span className="yc-kpi-f">{tile.sub}</span> : null}
        </div>
      ))}
    </section>
  );
}

const LIST_LABEL: Readonly<Record<StaffRecentList, string>> = {
  orders: 'person.lists.orders',
  messages: 'person.lists.messages',
  bookings: 'person.lists.bookings',
  cash: 'person.lists.cash',
  calls: 'person.lists.calls',
};

/** The second and fourth columns of each list, per the board. */
function columnsOf(list: StaffRecentList): readonly [string, string, string, string] {
  switch (list) {
    case 'messages':
      return ['person.col.time', 'person.col.guest', 'person.col.reply', 'person.col.speed'];
    case 'bookings':
      return ['person.col.time', 'person.col.guest', 'person.col.what', 'person.col.decision'];
    case 'cash':
      return ['person.col.time', 'person.col.what', 'person.col.amount', 'person.col.tip'];
    case 'calls':
      return ['person.col.time', 'person.col.table', 'person.col.what', 'person.col.response'];
    default:
      return ['person.col.time', 'person.col.table', 'person.col.what', 'person.col.amount'];
  }
}

function cellsOf(
  t: TFunction,
  list: StaffRecentList,
  item: ActivityEntry,
  locale: Locale,
): readonly [string, string, string] {
  const table = item.tableLabel ? t('activity.part.table', { label: item.tableLabel }) : '—';
  const guest = item.guestName ? shortName(item.guestName) : '—';
  const amount = item.amountAmd !== null ? dram(item.amountAmd, locale) : '—';
  const speed = durationLabel(t, item.seconds) ?? '—';
  const what = [actionLabel(t, item, locale), ...detailParts(t, item, locale)]
    .filter((part) => part !== table && part !== amount)
    .join(' · ');
  switch (list) {
    case 'messages': {
      const text = item.params['text'];
      return [
        item.tableLabel ? `${guest} · ${table}` : guest,
        typeof text === 'string'
          ? t('activity.part.quote', { text })
          : actionLabel(t, item, locale),
        speed,
      ];
    }
    case 'bookings':
      return [
        guest,
        [table, typeof item.params['localTime'] === 'string' ? item.params['localTime'] : null]
          .filter((part) => part && part !== '—')
          .join(' · ') || '—',
        [
          actionLabel(t, item, locale),
          item.reason ? `«${item.reason}»` : durationLabel(t, item.seconds),
        ]
          .filter(Boolean)
          .join(' · '),
      ];
    case 'cash': {
      const tip = item.params['tipAmd'];
      const code = item.subject.code;
      return [
        item.tableLabel ? table : (code ?? '—'),
        amount,
        typeof tip === 'number' && tip > 0 ? dram(tip, locale) : '—',
      ];
    }
    case 'calls':
      return [
        table,
        detailParts(t, item, locale)
          .filter((part) => part !== table && part !== speed)
          .join(' · ') || '—',
        speed,
      ];
    default:
      return [table, what, amount];
  }
}

function RecentLists({
  branchId,
  person,
  range,
  timeZoneId,
  today,
}: {
  readonly branchId: string;
  readonly person: StaffMemberPerformance;
  readonly range: PerformanceRange;
  readonly timeZoneId: string;
  readonly today: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const prefix = useId().replace(/:/gu, '');
  const [list, setList] = useState<StaffRecentList>('orders');
  return (
    <section className="yc-pp-lists" aria-label={t('person.lists.label')}>
      <Tabs
        label={t('person.lists.label')}
        idPrefix={prefix}
        selected={list}
        onSelect={setList}
        tabs={STAFF_RECENT_LISTS.map((id) => ({ id, label: t(LIST_LABEL[id]) }))}
      />
      <div
        role="tabpanel"
        id={panelId(prefix, list)}
        aria-labelledby={tabId(prefix, list)}
        className="yc-card yc-pp-panel"
      >
        <RecentList
          key={list}
          branchId={branchId}
          person={person}
          range={range}
          list={list}
          timeZoneId={timeZoneId}
          today={today}
          locale={locale}
        />
      </div>
    </section>
  );
}

function RecentList({
  branchId,
  person,
  range,
  list,
  timeZoneId,
  today,
  locale,
}: {
  readonly branchId: string;
  readonly person: StaffMemberPerformance;
  readonly range: PerformanceRange;
  readonly list: StaffRecentList;
  readonly timeZoneId: string;
  readonly today: string;
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  // One list at a time, a page at a time by the server's cursor.
  const recent = useStaffRecent(branchId, person.staffMemberId, range, list);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const paged = usePagedRows(recent, entryIdOf, (_, index) => rowRefs.current[index]?.focus());
  const items = paged.rows;
  const multiDay = range.from !== range.to;
  const [c1, c2, c3, c4] = columnsOf(list);
  const amountLast = list === 'cash' || list === 'orders';

  if (recent.isPending) return <LoadingLine />;
  if (recent.isError && items.length === 0) {
    return <QueryFailureNotice error={recent.error} onRetry={() => void recent.refetch()} />;
  }
  if (items.length === 0) return <EmptyLine>{t('person.lists.empty')}</EmptyLine>;
  return (
    <>
      <DataTable className="yc-pp-tbl" caption={t(LIST_LABEL[list])}>
        <TableHead
          columns={[
            { label: t(c1) },
            { label: t(c2) },
            { label: t(c3) },
            { label: t(c4), numeric: amountLast },
          ]}
        />
        <tbody>
          {items.map((item, index) => {
            const [a, b, c] = cellsOf(t, list, item, locale);
            const link = subjectLink(item);
            const when = multiDay
              ? whenLabel(t, item, timeZoneId, today, locale)
              : timeLabel(item, timeZoneId, locale);
            return (
              <tr
                key={item.id}
                tabIndex={-1}
                ref={(row) => {
                  rowRefs.current[index] = row;
                }}
              >
                <th scope="row" className="yc-pp-when">
                  {link ? <Link to={link.to}>{when}</Link> : when}
                </th>
                <td className="yc-wrap">{a}</td>
                <td className="yc-wrap">{b}</td>
                <td className={amountLast ? 'yc-num' : undefined}>{c}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <PagedFooter
        status={t('person.lists.shown', { count: items.length })}
        moreLabel={t('person.lists.more')}
        hasMore={paged.hasMore}
        loadingMore={paged.loadingMore}
        onMore={paged.more}
      >
        {recent.isFetchNextPageError ? (
          <QueryFailureNotice error={recent.error} onRetry={() => void recent.fetchNextPage()} />
        ) : null}
      </PagedFooter>
    </>
  );
}
