import type { MenuItemPerformance, ReportQuery } from '@yalla/api';
import { useMenuReport } from '@yalla/api/react';
import { formatDram, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { Link } from 'react-router-dom';
import { menuItemHref } from '../menuAnchors';
import { ReportSectionFrame } from './ReportSection';

export interface MenuSectionProps {
  readonly query: ReportQuery | null;
  readonly locale: Locale;
}

function PerformanceList({
  items,
  valueOf,
}: {
  readonly items: readonly MenuItemPerformance[];
  /** Formats the one value column — a count in one list, dram in the other. */
  readonly valueOf: (item: MenuItemPerformance) => string;
}) {
  const { t } = useTranslation(['admin', 'common']);

  if (items.length === 0) return <p className="muted">{t('reports.menu.noneSold')}</p>;

  return (
    <table className="report-table">
      <thead>
        <tr>
          <th scope="col">{t('reports.menu.item')}</th>
          <th scope="col">{t('reports.menu.category')}</th>
          <th scope="col" className="numeric">
            {t('reports.menu.value')}
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.menuItemId}>
            <th scope="row">
              <Link to={menuItemHref(item.menuItemId)}>{item.name}</Link>
            </th>
            <td>{item.categoryName}</td>
            <td className="numeric">{valueOf(item)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * What sold, what did not, and what got sent back.
 *
 * Two lists rather than one combined score, because the dish everyone orders
 * and the dish that makes the money are usually different and a single ranking
 * hides both. The never-ordered list is given the most prominence of anything
 * in this section: it is the only report in the product that reliably changes
 * what a venue does tomorrow, and every row in it is a link into the editor.
 */
export function MenuSection({ query, locale }: MenuSectionProps) {
  const { t } = useTranslation(['admin', 'common']);
  const report = useMenuReport(query);
  const data = report.data;

  return (
    <ReportSectionFrame
      section="menu"
      titleKey="reports.menu.title"
      blurbKey="reports.menu.blurb"
      query={query}
      isLoading={report.isLoading}
      error={report.error}
      onRetry={() => void report.refetch()}
      isEmpty={Boolean(data) && data!.topByCount.length === 0 && data!.neverOrdered.length === 0}
    >
      {data ? (
        <>
          <div className="report-columns">
            <div className="report-block">
              <h4 className="report-chart-title">{t('reports.menu.topByCount')}</h4>
              <PerformanceList
                items={data.topByCount}
                valueOf={(item) => item.quantity.toLocaleString(locale)}
              />
            </div>

            <div className="report-block">
              <h4 className="report-chart-title">{t('reports.menu.topByRevenue')}</h4>
              <PerformanceList
                items={data.topByRevenue}
                valueOf={(item) => formatDram(item.revenueAmd, locale)}
              />
            </div>
          </div>

          <div className="report-block report-highlight">
            <h4 className="report-chart-title">
              {t('reports.menu.neverOrdered.title', { count: data.neverOrdered.length })}
            </h4>
            <p className="muted">{t('reports.menu.neverOrdered.blurb')}</p>

            {data.neverOrdered.length === 0 ? (
              <p className="muted">{t('reports.menu.neverOrdered.none')}</p>
            ) : (
              <ul className="report-never-ordered">
                {data.neverOrdered.map((item) => (
                  <li key={item.menuItemId}>
                    <Link to={menuItemHref(item.menuItemId)}>{item.name}</Link>
                    <span className="muted small"> · {item.categoryName}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="report-block">
            <h4 className="report-chart-title">{t('reports.menu.voids.title')}</h4>
            <p className="muted">{t('reports.menu.voids.blurb')}</p>

            {data.voids.length === 0 ? (
              <p className="muted">{t('reports.menu.voids.none')}</p>
            ) : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th scope="col">{t('reports.menu.item')}</th>
                    <th scope="col">{t('reports.menu.voids.reason')}</th>
                    <th scope="col" className="numeric">
                      {t('reports.menu.voids.count')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.voids.map((line) => (
                    <tr key={`${line.menuItemId}-${line.reason}`}>
                      <th scope="row">
                        <Link to={menuItemHref(line.menuItemId)}>{line.name}</Link>
                      </th>
                      <td>{line.reason}</td>
                      <td className="numeric">{line.count.toLocaleString(locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </ReportSectionFrame>
  );
}
