import type { MenuItemPerformance, ReportQuery } from '@yalla/api';
import { useMenuReport } from '@yalla/api/react';
import { formatDram, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { Link } from 'react-router-dom';
import { DataTable, TableHead } from '../../kit';
import { menuItemHref } from '../menuAnchors';
import { menuCsv } from './csv';
import { CsvButton, ReportCard } from './ReportCard';

export interface MenuSectionProps {
  readonly query: ReportQuery | null;
  readonly locale: Locale;
  readonly onCsv: (title: string, fileSection: 'menu', text: string) => void;
}

/** The artboard's lists are five long: the head of each ranking. */
const RANKED = 5;

function Ranking({
  title,
  items,
  valueOf,
}: {
  readonly title: string;
  readonly items: readonly MenuItemPerformance[];
  readonly valueOf: (item: MenuItemPerformance) => string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <div className="yc-rp-body">
      <h3 className="yc-h3">{title}</h3>
      {items.length === 0 ? (
        <p className="yc-help">{t('reports.menu.noneSold')}</p>
      ) : (
        <ol className="yc-rp-rank">
          {items.slice(0, RANKED).map((item) => (
            <li key={item.menuItemId}>
              <Link to={menuItemHref(item.menuItemId)}>{item.name}</Link>
              <span>{valueOf(item)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * What sold, what did not, and what was sent back (Reports artboard, "Menu").
 *
 * Two rankings rather than one score, because the dish everyone orders and
 * the dish that brings the money in are usually different. The dishes nobody
 * ordered are each a link into the menu editor — the one report that reliably
 * changes what a venue does tomorrow — and the voided lines say why, in the
 * waiter's words.
 */
export function MenuSection({ query, locale, onCsv }: MenuSectionProps) {
  const { t } = useTranslation(['admin', 'common']);
  const report = useMenuReport(query);
  const data = report.data;
  const number = new Intl.NumberFormat(locale);
  const title = t('reports.menu.title');
  const empty = Boolean(data) && data!.topByCount.length === 0 && data!.neverOrdered.length === 0;

  return (
    <ReportCard
      title={title}
      cap={t('reports.menu.cap')}
      isLoading={report.isLoading}
      error={report.error}
      onRetry={() => void report.refetch()}
      isEmpty={empty}
      actions={
        <CsvButton
          label={title}
          disabled={!data || empty}
          onClick={() => data && onCsv(title, 'menu', menuCsv(data))}
        />
      }
    >
      {data ? (
        <>
          <div className="yc-rp-split is-even">
            <div className="yc-rp-divide">
              <Ranking
                title={t('reports.menu.topByCount')}
                items={data.topByCount}
                valueOf={(item) =>
                  t('reports.menu.times', {
                    count: item.quantity,
                    formatted: number.format(item.quantity),
                  })
                }
              />
            </div>
            <Ranking
              title={t('reports.menu.topByRevenue')}
              items={data.topByRevenue}
              valueOf={(item) => formatDram(Math.round(item.revenueAmd), locale)}
            />
          </div>
          <div className="yc-rp-body yc-rp-top">
            <h3 className="yc-h3">
              {t('reports.menu.neverOrdered.title', { count: data.neverOrdered.length })}
            </h3>
            {data.neverOrdered.length === 0 ? (
              <p className="yc-help">{t('reports.menu.neverOrdered.none')}</p>
            ) : (
              <>
                <p className="yc-help">{t('reports.menu.neverOrdered.blurb')}</p>
                <ul className="yc-rp-never">
                  {data.neverOrdered.map((item) => (
                    <li key={item.menuItemId}>
                      <Link to={menuItemHref(item.menuItemId)}>{item.name}</Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="yc-h3">{t('reports.menu.voids.title')}</h3>
            {data.voids.length === 0 ? (
              <p className="yc-help">{t('reports.menu.voids.none')}</p>
            ) : (
              <>
                <DataTable caption={t('reports.menu.voids.title')} phone="cards">
                  <TableHead
                    columns={[
                      { label: t('reports.menu.voids.item') },
                      { label: t('reports.menu.voids.reason') },
                      { label: t('reports.menu.voids.count'), numeric: true },
                    ]}
                  />
                  <tbody>
                    {data.voids.map((line) => (
                      <tr key={`${line.menuItemId}-${line.reason}`}>
                        <th scope="row">
                          <Link to={menuItemHref(line.menuItemId)}>{line.name}</Link>
                        </th>
                        <td>{line.reason}</td>
                        <td className="yc-num">{number.format(line.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
                <p className="yc-help">{t('reports.menu.voids.help')}</p>
              </>
            )}
          </div>
        </>
      ) : null}
    </ReportCard>
  );
}
