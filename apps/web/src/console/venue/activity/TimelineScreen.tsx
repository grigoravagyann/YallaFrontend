import {
  ACTIVITY_TIMELINE_SUBJECTS,
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
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { shortName } from '../../../messages/messageText';
import { ChevronLeftIcon } from '../../ui/icons';
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
        <p className="yc-card yc-empty-line">{t('activity.timeline.gone')}</p>
      </div>
    );
  }

  return (
    <div className="yc-page yc-tl-page">
      {back}
      {query.isPending ? (
        <p className="yc-card yc-empty-line" role="status">
          {t('loading')}
        </p>
      ) : query.isError ? (
        <div className="yc-card yc-ov-pad">
          <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : query.data === null ? (
        <p className="yc-card yc-empty-line">{t('activity.timeline.gone')}</p>
      ) : (
        <Timeline timeline={query.data} timeZoneId={timeZoneId} />
      )}
    </div>
  );
}

function titleOf(t: TFunction, timeline: ActivityTimeline): string {
  switch (timeline.subject.type) {
    case 'tab':
      return timeline.tableLabel
        ? t('activity.timeline.titleTab', { label: timeline.tableLabel })
        : t('activity.timeline.titleBill');
    case 'takeaway':
      return t('activity.timeline.titleTakeaway', { code: timeline.code ?? '' });
    default:
      return t('activity.timeline.titleBooking', {
        guest: shortName(timeline.guestName ?? '') || t('activity.who.theGuest'),
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
  const seconds = entry.params['seconds'];
  if (typeof seconds === 'number') return durationLabel(t, seconds);
  return deviceLabel(t, entry);
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

  const time = (utc: string) => formatTime(utc, zone, locale);
  const transfers = timeline.entries.filter((entry) => entry.action === 'table.transferred');
  const lastTransfer = transfers.at(-1);

  // The sub line: when, how many, whose — "Today 17:12–18:20 · 4 people · waiter Aram (from Lilit at 17:40)".
  const when = (() => {
    const start = timeline.startedAtUtc ?? timeline.entries[0]?.occurredAtUtc ?? null;
    if (!start) return null;
    const day = branchDayKey(start, zone);
    const dayText =
      day === today ? t('activity.timeline.today') : localDateLabel(day, today, locale);
    const end = timeline.endedAtUtc;
    return end
      ? t('activity.timeline.whenRange', { day: dayText, from: time(start), to: time(end) })
      : t('activity.timeline.whenOpen', { day: dayText, from: time(start) });
  })();
  const server = timeline.server
    ? lastTransfer
      ? t('activity.timeline.serverFrom', {
          name: shortName(timeline.server.name),
          from: shortName(
            typeof lastTransfer.params['fromName'] === 'string'
              ? lastTransfer.params['fromName']
              : lastTransfer.actor.name,
          ),
          time: time(lastTransfer.occurredAtUtc),
        })
      : t('activity.timeline.server', { name: shortName(timeline.server.name) })
    : null;
  const sub = [
    when,
    timeline.partySize ? t('activity.part.party', { count: timeline.partySize }) : null,
    timeline.subject.type !== 'tab' && timeline.guestName ? shortName(timeline.guestName) : null,
    server,
  ]
    .filter(Boolean)
    .join(' · ');

  // People who did something here, in the order they first did.
  const people: { readonly key: string; readonly label: string }[] = [];
  for (const entry of timeline.entries) {
    const key = entry.actor.staffMemberId ?? entry.actor.kind;
    if (people.some((person) => person.key === key)) continue;
    people.push({ key, label: whoShort(t, entry) });
  }
  const steps = timeline.entries.filter(
    (entry) => who === 'all' || (entry.actor.staffMemberId ?? entry.actor.kind) === who,
  );

  const totals = timeline.totals;
  const method = totals?.paidBy ? t(`activity.timeline.method.${totals.paidBy}`) : null;

  return (
    <>
      <div className="yc-tl-head">
        <span className="yc-tl-mark" aria-hidden="true">
          {timeline.subject.type === 'tab'
            ? (timeline.tableLabel ?? '—')
            : timeline.subject.type === 'takeaway'
              ? 'T'
              : (timeline.tableLabel ?? '·')}
        </span>
        <div className="yc-tl-title">
          <h1 className="yc-h1">{titleOf(t, timeline)}</h1>
          {sub ? <p className="yc-sub">{sub}</p> : null}
        </div>
        {totals && totals.paidAmd > 0 ? (
          <div className="yc-tl-total">
            <b>{dram(totals.paidAmd, locale)}</b>
            <span className="yc-muted">
              {[
                method,
                totals.tipAmd > 0
                  ? t('activity.part.tip', { amount: dram(totals.tipAmd, locale) })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ) : totals ? (
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
            <div className="yc-chips" role="group" aria-label={t('activity.timeline.byPerson')}>
              {[{ key: 'all', label: t('activity.timeline.everyone') }, ...people].map((person) => (
                <button
                  key={person.key}
                  type="button"
                  className={who === person.key ? 'yc-chip yc-chip-sm is-on' : 'yc-chip yc-chip-sm'}
                  aria-pressed={who === person.key}
                  onClick={() => setWho(person.key)}
                >
                  {person.label}
                </button>
              ))}
            </div>
          ) : null}
          {steps.length === 0 ? (
            <p className="yc-muted">{t('activity.timeline.noSteps')}</p>
          ) : (
            <ol className="yc-tl-list">
              {steps.map((entry) => {
                const note = noteOf(t, entry);
                const seconds = entry.params['seconds'];
                const speed = typeof seconds === 'number' ? durationLabel(t, seconds) : null;
                const details = detailParts(t, entry, locale).filter(
                  // The table is the page's own: said once, in the title. How
                  // fast goes under the step, not in it.
                  (part) =>
                    part !== speed &&
                    (!timeline.tableLabel ||
                      part !== t('activity.part.table', { label: timeline.tableLabel })),
                );
                return (
                  <li key={entry.id} className="yc-tl-step">
                    <span className="yc-tl-time">{time(entry.occurredAtUtc)}</span>
                    <i className={`yc-tl-dot ${dotTone(entry)}`} aria-hidden="true" />
                    <span className="yc-tl-what">
                      <span>
                        <b>{whoShort(t, entry)}</b>
                        {' · '}
                        {[actionLabel(t, entry), ...details].join(' · ')}
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

        {timeline.subject.type === 'tab' ? (
          <section className="yc-card yc-tl-items" aria-labelledby={itemsId}>
            <h2 id={itemsId} className="yc-h2">
              {t('activity.timeline.items')}
            </h2>
            {timeline.items.length === 0 ? (
              <p className="yc-muted">{t('activity.timeline.noItems')}</p>
            ) : (
              <div className="yc-tscroll">
                <table className="yc-tbl">
                  <caption className="yc-sr">{t('activity.timeline.itemsCaption')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('activity.timeline.itemWhat')}</th>
                      <th scope="col">{t('activity.timeline.itemWho')}</th>
                      <th scope="col" className="yc-num">
                        {t('activity.timeline.itemAmount')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.items.map((item) => (
                      <tr key={item.lineId} className={item.voided ? 'is-dim' : undefined}>
                        <td className="yc-wrap">
                          {item.voided ? (
                            <>
                              <s>
                                {t('activity.timeline.line', {
                                  count: item.quantity,
                                  name: item.name,
                                })}
                              </s>
                              <span className="yc-sr"> {t('activity.timeline.voided')}</span>
                            </>
                          ) : (
                            t('activity.timeline.line', { count: item.quantity, name: item.name })
                          )}
                          {item.comped ? (
                            <span className="yc-act-tag is-quiet yc-tl-comp">
                              {t('activity.timeline.comped')}
                            </span>
                          ) : null}
                        </td>
                        <td className="yc-wrap">
                          {item.addedBy
                            ? shortName(item.addedBy.name)
                            : t('activity.timeline.guestOrdered')}
                          {item.voidedBy ? (
                            <>
                              {' · '}
                              <span className="yc-tl-void">
                                {t('activity.timeline.voidedBy', {
                                  name: shortName(item.voidedBy.name),
                                })}
                              </span>
                            </>
                          ) : null}
                        </td>
                        <td className="yc-num">
                          {item.voided ? (
                            <s>{dram(item.amountAmd, locale)}</s>
                          ) : (
                            dram(item.amountAmd, locale)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totals ? (
                    <tfoot>
                      <tr className="yc-tl-sum">
                        <th scope="row" colSpan={2}>
                          {t('activity.timeline.total')}
                        </th>
                        <td className="yc-num">{dram(totals.itemsAmd, locale)}</td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}
            {totals && totals.paidAmd > 0 ? (
              <p className="yc-tl-paid">
                {[
                  totals.serviceChargeAmd > 0
                    ? t('activity.timeline.paidWithService', {
                        paid: dram(totals.paidAmd, locale),
                        service: dram(totals.serviceChargeAmd, locale),
                      })
                    : t('activity.timeline.paid', { paid: dram(totals.paidAmd, locale) }),
                  totals.discountAmd > 0
                    ? t('activity.timeline.discount', { amount: dram(totals.discountAmd, locale) })
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
