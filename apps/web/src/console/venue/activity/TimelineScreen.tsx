import {
  ACTIVITY_TIMELINE_SUBJECTS,
  timelineLinesAmd,
  type ActivityEntry,
  type ActivitySubjectType,
  type ActivityTimeline,
} from '@yalla/api';
import { useActivityTimeline } from '@yalla/api/react';
import { branchDayKey, formatTime, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useId, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { shortName } from '../../../messages/messageText';
import { ChipGroup, DataTable, EmptyLine, LoadingLine, QueryFailure, TableHead } from '../../kit';
import { CalendarIcon, ChevronLeftIcon, TabIcon } from '../../ui/icons';
import { localDateLabel } from '../messageHistory/historyText';
import { useVenueOutlet } from '../VenueLayout';
import {
  actionLabel,
  detailParts,
  deviceLabel,
  dram,
  durationLabel,
  whoShort,
} from './activityText';

/**
 * One bill's, one booking's or one takeaway order's whole story (2026-10-24,
 * the Check board): who did what, in order, filterable by person — and for a
 * bill, every dish with who took it and who voided it, and what was paid.
 *
 * `/venue/history/:subjectType/:subjectId`, reached from a History row; Back
 * returns to the History address it came from, filters and all.
 */
export function TimelineScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId, timeZoneId } = useVenueOutlet();
  const params = useParams();
  const location = useLocation();
  const type = ACTIVITY_TIMELINE_SUBJECTS.includes(params['subjectType'] as ActivitySubjectType)
    ? (params['subjectType'] as ActivitySubjectType)
    : null;
  const id = params['subjectId'] ?? '';
  const subject = type && id ? { type, id } : null;
  const query = useActivityTimeline(branchId ?? undefined, subject);
  const from =
    typeof (location.state as { from?: unknown } | null)?.from === 'string'
      ? (location.state as { from: string }).from
      : '/venue/history';

  const back = (
    <Link to={from} className="yc-lnk yc-lnk-back yc-tl-back">
      <ChevronLeftIcon />
      {t('activity.timeline.back')}
    </Link>
  );

  if (!subject || !branchId) {
    return (
      <div className="yc-page">
        {back}
        <EmptyLine card>{t('activity.timeline.gone')}</EmptyLine>
      </div>
    );
  }

  return (
    <div className="yc-page yc-tl-page">
      {back}
      {query.isPending ? (
        <LoadingLine card />
      ) : query.isError ? (
        <QueryFailure query={query} frame="card" />
      ) : query.data === null ? (
        <EmptyLine card>{t('activity.timeline.gone')}</EmptyLine>
      ) : (
        <Timeline timeline={query.data} timeZoneId={timeZoneId} />
      )}
    </div>
  );
}

function titleOf(t: TFunction, timeline: ActivityTimeline): string {
  switch (timeline.subject.type) {
    case 'tab':
      return timeline.tab?.tableLabel
        ? t('activity.timeline.titleTab', { label: timeline.tab.tableLabel })
        : t('activity.timeline.titleBill');
    case 'takeaway':
      return t('activity.timeline.titleTakeaway', {
        code:
          timeline.takeaway?.code ??
          timeline.entries.find((entry) => entry.subject.code)?.subject.code ??
          '',
      });
    default:
      return t('activity.timeline.titleBooking', {
        guest:
          shortName(
            timeline.booking?.guestName ??
              timeline.entries.find((entry) => entry.guestName)?.guestName ??
              '',
          ) || t('activity.who.theGuest'),
      });
  }
}

/** A step's dot: money red, a hand-over amber, the rest the brand. */
function dotTone(entry: ActivityEntry): string {
  if (entry.action === 'table.transferred') return 'is-handover';
  if (entry.isMoney && entry.category !== 'payment') return 'is-money';
  return '';
}

/** The muted line under a step: why, how fast, or from where. */
function noteOf(t: TFunction, entry: ActivityEntry): string | null {
  if (entry.reason) return t('activity.timeline.reason', { reason: entry.reason });
  if (entry.seconds !== null) return durationLabel(t, entry.seconds);
  return deviceLabel(t, entry);
}

/** Who did something here, for the chips: the staff the server names, then the guest and SHURJ. */
function peopleOf(
  t: TFunction,
  timeline: ActivityTimeline,
): readonly { readonly key: string; readonly label: string }[] {
  const out: { key: string; label: string }[] = [];
  const add = (key: string, label: string) => {
    if (!out.some((one) => one.key === key)) out.push({ key, label });
  };
  for (const entry of timeline.entries) {
    const key = entry.actor.staffMemberId ?? entry.actor.kind;
    const named = timeline.people.find((one) => one.staffMemberId === entry.actor.staffMemberId);
    add(key, named ? (named.name.split(/\s+/u)[0] ?? named.name) : whoShort(t, entry));
  }
  return out;
}

function Timeline({
  timeline,
  timeZoneId,
}: {
  readonly timeline: ActivityTimeline;
  readonly timeZoneId: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const stepsId = useId();
  const itemsId = useId();
  const zone = timeZoneId as TimeZone;
  const today = branchDayKey(new Date(), zone);
  const [who, setWho] = useState<string | 'all'>('all');
  const { tab, booking, takeaway } = timeline;

  const time = (utc: string) => formatTime(utc, zone, locale);
  const dayText = (day: string) =>
    day === today ? t('activity.timeline.today') : localDateLabel(day, today, locale);

  // The sub line: when, how many, whose — "Today 17:12–18:20 · 4 people · waiter Aram (from Lilit at 17:40)".
  const when = (() => {
    if (booking) {
      return booking.localDate
        ? t('activity.detail.dated', { date: dayText(booking.localDate), time: booking.localTime })
        : null;
    }
    const start =
      tab?.seatedAtUtc ?? takeaway?.createdAtUtc ?? timeline.entries[0]?.occurredAtUtc ?? null;
    if (!start) return null;
    const day = dayText(branchDayKey(start, zone));
    const end = tab ? tab.closedAtUtc : (takeaway?.collectedAtUtc ?? null);
    return end
      ? t('activity.timeline.whenRange', { day, from: time(start), to: time(end) })
      : t('activity.timeline.whenOpen', { day, from: time(start) });
  })();
  const servers = tab?.servers ?? [];
  const current = servers.at(-1);
  const before = servers.at(-2);
  const server = current
    ? before
      ? t('activity.timeline.serverFrom', {
          name: shortName(current.name),
          from: shortName(before.name),
          time: time(current.fromUtc),
        })
      : t('activity.timeline.server', { name: shortName(current.name) })
    : null;
  const partySize = tab?.partySize ?? booking?.partySize ?? 0;
  const guest = booking?.guestName ?? takeaway?.guestName ?? null;
  const sub = [
    when,
    partySize > 0 ? t('activity.part.party', { count: partySize }) : null,
    guest ? shortName(guest) : null,
    booking?.tableLabel ? t('activity.part.table', { label: booking.tableLabel }) : null,
    server,
  ]
    .filter(Boolean)
    .join(' · ');

  const people = peopleOf(t, timeline);
  const steps = timeline.entries.filter(
    (entry) => who === 'all' || (entry.actor.staffMemberId ?? entry.actor.kind) === who,
  );

  const lines = timeline.lines;
  const linesAmd = timelineLinesAmd(lines);
  const paidAmd = tab?.paidAmd ?? takeaway?.paidAmd ?? 0;
  const tipsAmd = tab?.tipsAmd ?? 0;
  const method = takeaway?.paymentMethod
    ? t(`activity.timeline.method.${takeaway.paymentMethod}`)
    : null;
  const adjustmentsAmd = tab ? Math.max(0, linesAmd - tab.subtotalAmd) : 0;
  // "Still open" only for what is: a bill closed unpaid or abandoned, or a
  // takeaway declined, cancelled or not collected, is over with nothing paid.
  const stillOpen = tab
    ? tab.status === 'open' ||
      tab.status === 'closing' ||
      (tab.status === 'unknown' && tab.closedAtUtc === null)
    : takeaway
      ? // `TakeawayStatus` 1 sent, 2 accepted, 3 ready.
        takeaway.status >= 1 && takeaway.status <= 3
      : false;
  // The tile: the table's label (the title and sub line say it in words), a
  // takeaway's T, or — a booking with no table yet — its kind as an icon
  // that says so, never a stray separator.
  const markLabel =
    timeline.subject.type === 'takeaway'
      ? 'T'
      : timeline.subject.type === 'tab'
        ? (tab?.tableLabel ?? '').trim()
        : (booking?.tableLabel ?? '').trim();

  return (
    <>
      <div className="yc-tl-head">
        {markLabel ? (
          <span className="yc-tl-mark" aria-hidden="true">
            {markLabel}
          </span>
        ) : (
          <span
            className="yc-tl-mark is-empty"
            role="img"
            aria-label={t('activity.timeline.noTable')}
          >
            {timeline.subject.type === 'tab' ? <TabIcon /> : <CalendarIcon />}
          </span>
        )}
        <div className="yc-tl-title">
          <h1 className="yc-h1">{titleOf(t, timeline)}</h1>
          {sub ? <p className="yc-sub">{sub}</p> : null}
        </div>
        {paidAmd > 0 ? (
          <div className="yc-tl-total">
            <b>{dram(paidAmd, locale)}</b>
            <span className="yc-muted">
              {[
                method,
                tipsAmd > 0 ? t('activity.part.tip', { amount: dram(tipsAmd, locale) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ) : stillOpen ? (
          <div className="yc-tl-total">
            <span className="yc-muted">{t('activity.timeline.open')}</span>
          </div>
        ) : null}
      </div>

      <div className="yc-tl-layout">
        <section className="yc-card yc-tl-steps" aria-labelledby={stepsId}>
          <h2 id={stepsId} className="yc-h2">
            {t('activity.timeline.steps')}
          </h2>
          {people.length > 1 ? (
            <ChipGroup
              small
              label={t('activity.timeline.byPerson')}
              value={who}
              options={[{ key: 'all', label: t('activity.timeline.everyone') }, ...people].map(
                (person) => ({ value: person.key, label: person.label }),
              )}
              onChange={setWho}
            />
          ) : null}
          {steps.length === 0 ? (
            <p className="yc-muted">{t('activity.timeline.noSteps')}</p>
          ) : (
            <ol className="yc-tl-list">
              {steps.map((entry) => {
                const note = noteOf(t, entry);
                const speed = entry.seconds !== null ? durationLabel(t, entry.seconds) : null;
                const tableLabel = tab?.tableLabel ?? null;
                const details = detailParts(t, entry, locale).filter(
                  // The table is the page's own: said once, in the title. How
                  // fast goes under the step, not in it.
                  (part) =>
                    part !== speed &&
                    (!tableLabel || part !== t('activity.part.table', { label: tableLabel })),
                );
                return (
                  <li key={entry.id} className="yc-tl-step">
                    <span className="yc-tl-time">{time(entry.occurredAtUtc)}</span>
                    <i className={`yc-tl-dot ${dotTone(entry)}`} aria-hidden="true" />
                    <span className="yc-tl-what">
                      <span>
                        <b>{whoShort(t, entry)}</b>
                        {' · '}
                        {[actionLabel(t, entry, locale), ...details].join(' · ')}
                      </span>
                      {note ? (
                        <span className={entry.reason ? 'yc-tl-note is-reason' : 'yc-tl-note'}>
                          {note}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {timeline.subject.type === 'tab' || lines.length > 0 ? (
          <section className="yc-card yc-tl-items" aria-labelledby={itemsId}>
            <h2 id={itemsId} className="yc-h2">
              {t('activity.timeline.items')}
            </h2>
            {lines.length === 0 ? (
              <p className="yc-muted">{t('activity.timeline.noItems')}</p>
            ) : (
              <DataTable caption={t('activity.timeline.itemsCaption')}>
                <TableHead
                  columns={[
                    { label: t('activity.timeline.itemWhat') },
                    { label: t('activity.timeline.itemWho') },
                    { label: t('activity.timeline.itemAmount'), numeric: true },
                  ]}
                />
                <tbody>
                  {lines.map((line) => {
                    // A voided line's total is zero: struck through, it shows what it was.
                    const worth = line.voided
                      ? line.unitPriceAmd * line.quantity
                      : line.lineTotalAmd;
                    return (
                      <tr key={line.lineId} className={line.voided ? 'is-dim' : undefined}>
                        <td className="yc-wrap">
                          {line.voided ? (
                            <>
                              <s>
                                {t('activity.timeline.line', {
                                  count: line.quantity,
                                  name: line.name,
                                })}
                              </s>
                              <span className="yc-sr"> {t('activity.timeline.voided')}</span>
                            </>
                          ) : (
                            t('activity.timeline.line', { count: line.quantity, name: line.name })
                          )}
                        </td>
                        <td className="yc-wrap">
                          {line.addedByGuest
                            ? [t('activity.timeline.guestOrdered'), line.addedBy?.name]
                                .filter(Boolean)
                                .join(' · ')
                            : line.addedBy
                              ? shortName(line.addedBy.name)
                              : '—'}
                          {line.voidedBy ? (
                            <>
                              {' · '}
                              <span className="yc-tl-void">
                                {t('activity.timeline.voidedBy', {
                                  name: shortName(line.voidedBy.name),
                                })}
                              </span>
                            </>
                          ) : null}
                        </td>
                        <td className="yc-num">
                          {line.voided ? <s>{dram(worth, locale)}</s> : dram(worth, locale)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="yc-tl-sum">
                    <th scope="row" colSpan={2}>
                      {t('activity.timeline.total')}
                    </th>
                    <td className="yc-num">{dram(linesAmd, locale)}</td>
                  </tr>
                </tfoot>
              </DataTable>
            )}
            {tab && tab.paidAmd > 0 ? (
              <p className="yc-tl-paid">
                {[
                  tab.serviceChargeAmd > 0
                    ? t('activity.timeline.paidWithService', {
                        paid: dram(tab.paidAmd, locale),
                        service: dram(tab.serviceChargeAmd, locale),
                      })
                    : t('activity.timeline.paid', { paid: dram(tab.paidAmd, locale) }),
                  adjustmentsAmd > 0
                    ? t('activity.timeline.discount', { amount: dram(adjustmentsAmd, locale) })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </>
  );
}
