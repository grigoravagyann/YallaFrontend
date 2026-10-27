import {
  venueFeatureSummary,
  venueFeatures,
  type BranchReadiness,
  type ConsoleBranch,
  type ConsoleVenueDetail,
  type StaffMember,
} from '@yalla/api';
import { useBranchesReadiness, useStaff, useVenueBookingsSummary } from '@yalla/api/react';
import { formatDate } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useFeatureText } from '../../ui/featureText';
import { AlertCircleIcon, CheckIcon, ChevronRightIcon, PlusIcon } from '../../ui/icons';
import { DataTable } from '../../kit';

/** Every venue in the pilot is in Yerevan. */
const CONSOLE_TIME_ZONE = 'Asia/Yerevan';

export interface OverviewPanelProps {
  readonly venue: ConsoleVenueDetail;
  /** Opens "Add a branch"; absent on a deleted venue. */
  readonly onAddBranch: (() => void) | null;
}

/**
 * The venue page's Overview tab (VenueDetail artboard): four numbers, the
 * branches with what the platform allows each one (its Features page) and the
 * way into its public page, rooms and reviews, what is still not ready for
 * guests, and the venue's details.
 *
 * Every number is the source's or absent: an open-tab count nobody reported is
 * "not reported", never a zero that says the floor is clear.
 */
export function OverviewPanel({ venue, onAddBranch }: OverviewPanelProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const bookings = useVenueBookingsSummary(venue.id, 30);
  const staff = useStaff(venue.id);
  const branchesId = useId();
  const factsId = useId();

  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const knowsTabs = venue.branches.some((branch) => branch.openTabCount !== null);
  // Today's bookings per branch ride on the summary already read for the card above.
  const today = new Map(
    (bookings.data?.byBranch ?? []).map((branch) => [branch.branchId, branch.todayCount]),
  );
  const branchesWithTabs = venue.branches.filter((branch) => (branch.openTabCount ?? 0) > 0);
  const owner = (staff.data ?? []).find((member) => member.role === 'owner' && member.isActive);
  const summary = venueFeatures(venue);
  const text = useFeatureText();

  const kpis: { label: string; value: ReactNode; foot: ReactNode }[] = [
    {
      label: t('venuePage.kpi.branches'),
      value: number(venue.branchCount),
      foot: t('venuePage.kpi.tables', { count: venue.tableCount }),
    },
    {
      label: t('venuePage.kpi.bookings30'),
      value: bookings.data ? number(bookings.data.total) : '—',
      foot: bookings.data
        ? t('venuePage.kpi.pending', { count: bookings.data.byStatus.pending })
        : '',
    },
    {
      label: t('venuePage.kpi.openTabs'),
      value: typeof venue.openTabCount === 'number' ? number(venue.openTabCount) : '—',
      foot:
        typeof venue.openTabCount !== 'number'
          ? t('venuePage.kpi.notReported')
          : knowsTabs && branchesWithTabs.length > 0
            ? t('venuePage.kpi.openTabsAt', { count: branchesWithTabs.length })
            : '',
    },
    {
      label: t('venuePage.kpi.rating'),
      value:
        typeof venue.rating === 'number'
          ? `★ ${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(venue.rating)}`
          : '—',
      foot:
        venue.rating === undefined
          ? t('venuePage.kpi.notReported')
          : venue.rating === null
            ? t('venuePage.kpi.noReviews')
            : t('venuePage.kpi.reviews', {
                count: venue.reviewCount ?? 0,
                n: number(venue.reviewCount ?? 0),
              }),
    },
  ];

  return (
    <div className="yc-panel-body">
      <div className="yc-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="yc-card yc-kpi">
            <span className="yc-kpi-l">{kpi.label}</span>
            <span className="yc-kpi-n">{kpi.value}</span>
            <span className="yc-kpi-f">{kpi.foot}</span>
          </div>
        ))}
      </div>

      <div className="yc-g2">
        <section className="yc-card" aria-labelledby={branchesId}>
          <div className="yc-card-h">
            <div>
              <h2 className="yc-h2" id={branchesId}>
                {t('venuePage.branches.title')}
              </h2>
              <p className="yc-cap">{t('venuePage.branches.cap')}</p>
            </div>
            {onAddBranch ? (
              <button
                type="button"
                className="yc-btn yc-btn-sec yc-btn-sm"
                data-addbr=""
                onClick={onAddBranch}
              >
                <PlusIcon />
                {t('venuePage.branches.add')}
              </button>
            ) : null}
          </div>
          {venue.branches.length === 0 ? (
            <p className="yc-empty-line">{t('venuePage.branches.empty')}</p>
          ) : (
            <DataTable labelledBy={branchesId} phone="cards">
              <thead>
                <tr>
                  <th scope="col">{t('venuePage.branches.name')}</th>
                  <th scope="col" className="yc-num">
                    {t('venuePage.branches.tables')}
                  </th>
                  <th scope="col" className="yc-num">
                    {t('venuePage.branches.today')}
                  </th>
                  {knowsTabs ? (
                    <th scope="col" className="yc-num">
                      {t('venuePage.branches.openTabs')}
                    </th>
                  ) : null}
                  <th scope="col">{t('venuePage.branches.features')}</th>
                  <th scope="col">{t('venuePage.branches.manage')}</th>
                </tr>
              </thead>
              <tbody>
                {venue.branches.map((branch) => (
                  <BranchRow
                    key={branch.id}
                    venueId={venue.id}
                    branch={branch}
                    today={today.get(branch.id) ?? null}
                    knowsTabs={knowsTabs}
                  />
                ))}
              </tbody>
            </DataTable>
          )}
        </section>

        <Readiness venue={venue} owner={owner} ownerKnown={staff.isSuccess} />
      </div>

      <section className="yc-card" aria-labelledby={factsId}>
        <div className="yc-card-h">
          <h2 className="yc-h2" id={factsId}>
            {t('venuePage.facts.title')}
          </h2>
        </div>
        <dl className="yc-facts">
          <dt>{t('venuePage.facts.owner')}</dt>
          <dd>
            {owner ? owner.fullName : t('venuePage.facts.noOwner')}
            {owner?.email ? <span>{owner.email}</span> : null}
          </dd>
          <dt>{t('venuePage.facts.features')}</dt>
          <dd>
            {text.summary(summary)}
            <span>
              {summary.kind === 'custom' && summary.features
                ? text.list(summary.features)
                : t(`venuePage.facts.featuresAre.${summary.kind}`)}
            </span>
          </dd>
          {venue.createdAtUtc ? (
            <>
              <dt>{t('venuePage.facts.added')}</dt>
              <dd>{formatDate(venue.createdAtUtc, CONSOLE_TIME_ZONE, locale)}</dd>
            </>
          ) : null}
          <dt>{t('venuePage.facts.publicPage')}</dt>
          <dd>yalla.am/{venue.slug}</dd>
        </dl>
      </section>
    </div>
  );
}

function BranchRow({
  venueId,
  branch,
  today,
  knowsTabs,
}: {
  readonly venueId: string;
  readonly branch: ConsoleBranch;
  /** `null` until the summary has answered: not a zero nobody counted. */
  readonly today: number | null;
  readonly knowsTabs: boolean;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const text = useFeatureText();
  const features = text.summary(venueFeatureSummary([branch]));
  const base = `/platform/venues/${venueId}/branches/${branch.id}`;
  return (
    <tr>
      <td>
        <div className="yc-pn">{branch.name}</div>
        {branch.address ? <div className="yc-pe">{branch.address}</div> : null}
        {branch.tableCount === 0 ? (
          <span className="yc-pill yc-pill-amber yc-pill-under">
            {t('venuePage.branches.isNew')}
          </span>
        ) : null}
      </td>
      <td className="yc-num">{branch.tableCount}</td>
      <td className="yc-num">{today ?? '—'}</td>
      {knowsTabs ? <td className="yc-num">{branch.openTabCount ?? '—'}</td> : null}
      <td>
        <Link
          className="yc-featl"
          to={`${base}/features`}
          data-branch-features={branch.id}
          aria-label={t('venuePage.branches.featuresLink', { features, branch: branch.name })}
        >
          {features}
          <ChevronRightIcon />
        </Link>
      </td>
      <td>
        {/* A platform admin holds no branch claim, so these pages take the
            branch from here rather than from a venue section. */}
        <div className="yc-blinks">
          <Link to={`${base}/public`}>{t('platform.venue.publicPageLink')}</Link>
          <Link to={`${base}/floorplan`}>{t('nav.floorplan')}</Link>
          <Link to={`${base}/reviews`}>{t('platform.venue.reviewsLink')}</Link>
        </div>
      </td>
    </tr>
  );
}

interface Line {
  readonly key: string;
  readonly label: string;
  readonly done: boolean;
  readonly value: string;
}

/**
 * What a guest would miss, branch by branch rolled into one list: tables,
 * dishes, hours, the cover and the owner's sign-in. Read from each branch's
 * own readiness (`GET /api/branches/{id}/readiness`), never guessed.
 */
function Readiness({
  venue,
  owner,
  ownerKnown,
}: {
  readonly venue: ConsoleVenueDetail;
  readonly owner: StaffMember | undefined;
  readonly ownerKnown: boolean;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  const answers = useBranchesReadiness(venue.branches.map((branch) => branch.id));
  const loading = answers.some((answer) => answer.isLoading);
  const failed = answers.some((answer) => answer.isError);
  const all = answers
    .map((answer) => answer.data)
    .filter((data): data is BranchReadiness => data !== undefined);

  const lines: Line[] = [];
  if (all.length === venue.branches.length && all.length > 0) {
    const tables = all.reduce((sum, branch) => sum + branch.tableCount, 0);
    const tablesDone = all.every((branch) => branch.floorPlanDrawn && branch.tablesLabelled);
    lines.push({
      key: 'tables',
      label: t('venuePage.readiness.tables'),
      done: tablesDone,
      value: tablesDone
        ? t('venuePage.readiness.tablesValue', { count: tables })
        : t('venuePage.readiness.tablesMissing'),
    });
    const dishes = all.reduce((sum, branch) => sum + branch.menuItemCount, 0);
    const unfinished = all.reduce((sum, branch) => sum + branch.incompleteMenuItemCount, 0);
    lines.push({
      key: 'menu',
      label: t('venuePage.readiness.menu'),
      done: all.every((branch) => branch.menuComplete),
      value:
        dishes === 0
          ? t('venuePage.readiness.menuEmpty')
          : unfinished > 0
            ? t('venuePage.readiness.menuIncomplete', { count: unfinished })
            : t('venuePage.readiness.menuValue', { count: dishes }),
    });
    const withHours = all.filter((branch) => branch.openingHoursSet).length;
    lines.push({
      key: 'hours',
      label: t('venuePage.readiness.hours'),
      done: withHours === all.length,
      value:
        withHours === 0
          ? t('venuePage.readiness.hoursMissing')
          : t('venuePage.readiness.hoursValue', { count: withHours }),
    });
  }
  if (venue.coverThumbnailUrl !== undefined) {
    lines.push({
      key: 'photo',
      label: t('venuePage.readiness.photo'),
      done: venue.coverThumbnailUrl !== null,
      value:
        venue.coverThumbnailUrl !== null
          ? t('venuePage.readiness.photoOk')
          : t('venuePage.readiness.photoMissing'),
    });
  }
  if (ownerKnown) {
    lines.push({
      key: 'owner',
      label: t('venuePage.readiness.owner'),
      done: Boolean(owner?.hasPasswordSignIn),
      value: !owner
        ? t('venuePage.readiness.ownerMissing')
        : owner.hasPasswordSignIn
          ? t('venuePage.readiness.ownerOk')
          : t('venuePage.readiness.ownerAwaiting'),
    });
  }
  const done = lines.filter((line) => line.done).length;

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('venuePage.readiness.title')}
          </h2>
          <p className="yc-cap">{t('venuePage.readiness.cap')}</p>
        </div>
        {lines.length > 0 && !loading ? (
          <span
            className={done === lines.length ? 'yc-pill yc-pill-green' : 'yc-pill yc-pill-amber'}
          >
            {t('venuePage.readiness.score', { done, total: lines.length })}
          </span>
        ) : null}
      </div>
      {loading ? (
        <p className="yc-empty-line" role="status">
          {t('loading')}
        </p>
      ) : (
        <ul className="yc-check">
          {lines.map((line) => (
            <li key={line.key} className={line.done ? undefined : 'is-todo'}>
              <span className="yc-ck">{line.done ? <CheckIcon /> : <AlertCircleIcon />}</span>
              <span className="yc-sr">
                {line.done ? t('venuePage.readiness.ready') : t('venuePage.readiness.notReady')}
              </span>
              <b>{line.label}</b>
              <span className="yc-ck-v">{line.value}</span>
            </li>
          ))}
          {failed ? (
            <li className="is-todo">
              <span className="yc-ck">
                <AlertCircleIcon />
              </span>
              <span className="yc-ck-v">{t('venuePage.readiness.failed')}</span>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
