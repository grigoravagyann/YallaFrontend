import {
  ApiError,
  describeFailure,
  venueTierSummary,
  type ConsoleVenue,
  type VenueReadinessIssue,
} from '@yalla/api';
import { isOfflinePaused, useAllConsoleVenues, useRestoreVenue } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useResumeVenue, useSuspendVenue } from '../../data/queries';
import { newCommandId } from '../../lib/commandId';
import { Dialog } from '../ui/Dialog';
import { ErrorState, errorKindFor } from '../ui/ErrorState';
import {
  AlertCircleIcon,
  ChevronsUpDownIcon,
  PauseIcon,
  PlusIcon,
  RestoreIcon,
  SearchIcon,
  TrashIcon,
} from '../ui/icons';
import { OnceLinkDialog } from '../ui/OnceLinkDialog';
import { PageHeader } from '../ui/PageHeader';
import { useToast } from '../ui/toast';
import { CreateVenueDialog, type CreatedVenue } from './venues/CreateVenueDialog';
import { DeleteVenueDialog } from './venues/DeleteVenueDialog';
import { RowMenu, type RowMenuItem } from './venues/RowMenu';
import { TierDialog } from './venues/TierDialog';
import { VenueThumb } from './venues/VenueThumb';
import {
  DEFAULT_FILTERS,
  STATUS_FILTERS,
  TIER_FILTERS,
  filterVenues,
  isFiltered,
  nextSort,
  sortVenues,
  type SortDirection,
  type SortKey,
  type StatusFilter,
  type TierFilter,
  type VenueListFilters,
} from './venues/venueList';

type Translate = ReturnType<typeof useTranslation>['t'];

/** Every venue in the pilot is in Yerevan. */
const CONSOLE_TIME_ZONE = 'Asia/Yerevan';

const SKELETON_ROWS = 6;

const STATUS_LABEL: Readonly<Record<StatusFilter, string>> = {
  live: 'venues.filter.statusLive',
  active: 'venues.filter.statusActive',
  suspended: 'venues.filter.statusSuspended',
  deleted: 'venues.filter.statusDeleted',
  all: 'venues.filter.statusAll',
};

const TIER_LABEL: Readonly<Record<TierFilter, string>> = {
  all: 'venues.filter.tierAll',
  paid: 'venues.filter.tierPaid',
  free: 'venues.filter.tierFree',
  mixed: 'venues.filter.tierMixed',
};

const PILL: Readonly<Record<ConsoleVenue['status'], string>> = {
  active: 'yc-pill yc-pill-green',
  suspended: 'yc-pill yc-pill-grey',
  deleted: 'yc-pill yc-pill-red',
};

type Shown =
  | { readonly kind: 'tier'; readonly venue: ConsoleVenue; readonly from: 'button' | 'menu' }
  | { readonly kind: 'delete'; readonly venue: ConsoleVenue }
  | { readonly kind: 'create' }
  | { readonly kind: 'once'; readonly created: Exclude<CreatedVenue, { kind: 'plain' }> };

/**
 * Every venue on the platform (Venues artboard; HANDOFF section 8 step 2).
 *
 * - **Search, status and plan filters, sortable columns**, all in place over
 *   the whole platform read once. Deleted venues are hidden by default and
 *   counted in the header, so "where did it go" has an answer on screen.
 * - **The plan column** summarises the branches' plans — the tier is per
 *   branch — and its button switches all of them, with a confirm that says
 *   what changes and the server's refusal named by branch.
 * - **The ⋮ menu** (arrow keys, Escape) has the plan, suspend or resume, and
 *   delete; a deleted venue's has restore.
 * - **Suspend and delete undo** from their toast. Delete is soft, typed by
 *   name, and refused while the venue is in use, with suspend offered instead.
 * - **Adding a venue** is a three-step dialog; an owner given there is issued
 *   a sign-in link, shown once.
 *
 * The newer columns (rating, cuisine) are drawn only when the source reports
 * them: a column of dashes would read as "none" when nobody asked.
 */
export function VenuesRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const query = useAllConsoleVenues();
  const suspend = useSuspendVenue();
  const resume = useResumeVenue();
  const restore = useRestoreVenue();

  const [filters, setFilters] = useState<VenueListFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'name',
    direction: 1,
  });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // `/platform/venues/new`, the old create page's address, lands here asking
  // for the dialog (see `App`).
  const [shown, setShown] = useState<Shown | null>(() =>
    (location.state as { create?: boolean } | null)?.create ? { kind: 'create' } : null,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  // The request for the dialog is taken once: a reload must not reopen it.
  useEffect(() => {
    if (!(location.state as { create?: boolean } | null)?.create) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  /** A row whose ⋮ takes the focus once it is on screen again (after an undo). */
  const focusRow = useRef<string | null>(null);
  const kebabOf = useCallback(
    (venueId: string) => document.querySelector<HTMLElement>(`[data-kebab="${venueId}"]`),
    [],
  );
  const tierButtonOf = (venueId: string) =>
    document.querySelector<HTMLElement>(`[data-tier="${venueId}"]`);
  useEffect(() => {
    const id = focusRow.current;
    if (!id) return;
    const kebab = kebabOf(id);
    if (kebab) {
      focusRow.current = null;
      kebab.focus();
    }
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const visible = useMemo(
    () => sortVenues(filterVenues(all, filters, locale), sort.key, sort.direction, locale),
    [all, filters, sort, locale],
  );
  const live = all.filter((venue) => venue.status !== 'deleted').length;
  const deleted = all.length - live;
  const filtered = isFiltered(filters);
  const takenSlugs = useMemo(() => new Set(all.map((venue) => venue.slug)), [all]);
  const showRating = all.some((venue) => venue.rating !== undefined);
  const showCuisine = all.some((venue) => venue.cuisine !== undefined);

  const setFilter = <K extends keyof VenueListFilters>(key: K, value: VenueListFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setFailure(null);
    try {
      await action();
      return true;
    } catch {
      setFailure(t('venue.failed'));
      return false;
    }
  }

  async function suspendVenue(venue: ConsoleVenue) {
    const done = await run(() =>
      suspend.mutateAsync({ venueId: venue.id, commandId: newCommandId() }),
    );
    if (!done) return;
    kebabOf(venue.id)?.focus();
    toast.say(t('venues.toast.suspended', { name: venue.name }), {
      undo: () => void undoSuspend(venue),
    });
  }

  async function undoSuspend(venue: ConsoleVenue) {
    if (await run(() => resume.mutateAsync({ venueId: venue.id, commandId: newCommandId() }))) {
      focusRow.current = venue.id;
      toast.say(t('venues.toast.activeAgain', { name: venue.name }));
    }
  }

  async function resumeVenue(venue: ConsoleVenue) {
    if (await run(() => resume.mutateAsync({ venueId: venue.id, commandId: newCommandId() }))) {
      kebabOf(venue.id)?.focus();
      toast.say(t('venues.toast.resumed', { name: venue.name }));
    }
  }

  async function restoreVenue(venue: ConsoleVenue, undo: boolean) {
    if (await run(() => restore.mutateAsync({ venueId: venue.id, commandId: newCommandId() }))) {
      focusRow.current = venue.id;
      toast.say(t(undo ? 'venues.toast.undeleted' : 'venues.toast.restored', { name: venue.name }));
    }
  }

  function menuItems(venue: ConsoleVenue): RowMenuItem[] {
    if (venue.status === 'deleted') {
      return [
        {
          key: 'restore',
          label: t('venues.menu.restore'),
          icon: <RestoreIcon />,
          onSelect: () => void restoreVenue(venue, false),
        },
      ];
    }
    const summary = venueTierSummary(venue);
    const items: RowMenuItem[] = [];
    if (summary.kind !== 'none') {
      items.push({
        key: 'tier',
        label: t(
          summary.kind === 'paid'
            ? 'venues.menu.toFree'
            : summary.kind === 'free'
              ? 'venues.menu.toPaid'
              : 'venues.menu.changeTier',
        ),
        icon: <ChevronsUpDownIcon />,
        onSelect: () => setShown({ kind: 'tier', venue, from: 'menu' }),
      });
    }
    items.push(
      venue.status === 'active'
        ? {
            key: 'suspend',
            label: t('venues.menu.suspend'),
            icon: <PauseIcon />,
            onSelect: () => void suspendVenue(venue),
          }
        : {
            key: 'resume',
            label: t('venues.menu.resume'),
            icon: <RestoreIcon />,
            onSelect: () => void resumeVenue(venue),
          },
      {
        key: 'delete',
        label: t('venues.menu.delete'),
        icon: <TrashIcon />,
        danger: true,
        onSelect: () => setShown({ kind: 'delete', venue }),
      },
    );
    return items;
  }

  function afterCreate(created: CreatedVenue) {
    // Back to the whole list, so the new row is on screen.
    setFilters(DEFAULT_FILTERS);
    if (created.kind === 'plain') {
      setShown(null);
      toast.say(t('venues.toast.created', { name: created.venue.name }));
      return;
    }
    setShown({ kind: 'once', created });
  }

  const header = (key: SortKey, label: string, numeric = false) => {
    const on = sort.key === key;
    return (
      <th
        scope="col"
        className={numeric ? 'yc-num' : undefined}
        aria-sort={on ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          className={on ? 'yc-sortb is-on' : 'yc-sortb'}
          onClick={() => setSort((current) => nextSort(current, key))}
        >
          {label}
          <span className="yc-ar" aria-hidden="true">
            {on ? (sort.direction === 1 ? '↑' : '↓') : '↕'}
          </span>
        </button>
      </th>
    );
  };

  const offline = isOfflinePaused(query);
  const columns = 6 + (showRating ? 1 : 0) + (showCuisine ? 1 : 0);

  const subLine = query.data
    ? [
        t('venues.count', { count: live }),
        deleted ? t('venues.deletedCount', { count: deleted }) : null,
        filtered ? t('venues.shownCount', { count: visible.length }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const footLine = [
    filtered
      ? t('venues.footOf', { shown: visible.length, total: all.length })
      : t('venues.count', { count: visible.length }),
    filters.status === 'live' && deleted ? t('venues.deletedHidden') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  let body;
  if (offline || (query.isError && !query.data)) {
    const error = query.error;
    body = (
      <ErrorState
        kind={offline ? 'offline' : errorKindFor(describeFailure(error))}
        reference={error instanceof ApiError ? error.requestId : null}
        onRetry={() => query.refetch()}
      />
    );
  } else if (query.isLoading) {
    body = (
      <div className="yc-tscroll">
        <table className="yc-tbl" aria-busy="true">
          <caption className="yc-sr">{t('venues.loading')}</caption>
          <tbody>
            {Array.from({ length: SKELETON_ROWS }, (_, row) => (
              <tr key={row} aria-hidden="true">
                <td>
                  <div className="yc-vcell">
                    <span className="yc-sk yc-sk-thumb" />
                    <span className="yc-sk-lines">
                      <span className="yc-sk yc-sk-name" />
                      <span className="yc-sk yc-sk-slug" />
                    </span>
                  </div>
                </td>
                {Array.from({ length: columns - 1 }, (_, cell) => (
                  <td key={cell}>
                    <span className="yc-sk yc-sk-cell" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (all.length === 0) {
    body = (
      <div className="yc-empty">
        <span className="yc-empty-ic">
          <PlusIcon />
        </span>
        <h2 className="yc-h2">{t('venues.empty.first')}</h2>
      </div>
    );
  } else if (visible.length === 0) {
    const onlyDeleted = filters.status === 'deleted' && !filters.query.trim();
    body = (
      <div className="yc-empty">
        <span className="yc-empty-ic">
          <SearchIcon />
        </span>
        <h2 className="yc-h2">
          {onlyDeleted ? t('venues.empty.deletedTitle') : t('venues.empty.title')}
        </h2>
        <p>{onlyDeleted ? t('venues.empty.deletedBody') : t('venues.empty.body')}</p>
        <button
          type="button"
          className="yc-btn yc-btn-sec"
          onClick={() => setFilters(DEFAULT_FILTERS)}
        >
          {t('venues.empty.clear')}
        </button>
      </div>
    );
  } else {
    body = (
      <>
        {/* Scrolls sideways on a phone rather than squeezing eight columns. */}
        <div className="yc-tscroll">
          <table className="yc-tbl">
            <thead>
              <tr>
                {header('name', t('venues.column.name'))}
                <th scope="col">{t('venues.column.category')}</th>
                {showCuisine ? <th scope="col">{t('venues.column.cuisine')}</th> : null}
                {showRating ? header('rating', t('venues.column.rating'), true) : null}
                {header('tables', t('venues.column.tables'), true)}
                <th scope="col">{t('venues.column.tier')}</th>
                <th scope="col">{t('venues.column.status')}</th>
                <th scope="col">
                  <span className="yc-sr">{t('venues.column.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((venue) => (
                <VenueRow
                  key={venue.id}
                  venue={venue}
                  showRating={showRating}
                  showCuisine={showCuisine}
                  locale={locale}
                  menuOpen={menuFor === venue.id}
                  onMenu={(open) => setMenuFor(open ? venue.id : null)}
                  menuItems={menuItems(venue)}
                  onTier={() => setShown({ kind: 'tier', venue, from: 'button' })}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="yc-foot">{footLine}</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('venues.title')}
        sub={subLine}
        actions={
          <button
            ref={addRef}
            type="button"
            className="yc-btn yc-btn-pri"
            onClick={() => setShown({ kind: 'create' })}
          >
            <PlusIcon />
            {t('venues.new')}
          </button>
        }
      />

      <div className="yc-tools">
        <div className="yc-fld yc-fld-grow">
          <label htmlFor="venues-q">{t('venues.filter.search')}</label>
          <div className="yc-search">
            <SearchIcon />
            <input
              id="venues-q"
              className="yc-ctl"
              type="search"
              autoComplete="off"
              placeholder={t('venues.filter.searchPlaceholder')}
              value={filters.query}
              onChange={(event) => setFilter('query', event.target.value)}
            />
          </div>
        </div>
        <div className="yc-fld">
          <label htmlFor="venues-status">{t('venues.filter.status')}</label>
          <select
            id="venues-status"
            className="yc-ctl"
            value={filters.status}
            onChange={(event) => setFilter('status', event.target.value as StatusFilter)}
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {t(STATUS_LABEL[value])}
              </option>
            ))}
          </select>
        </div>
        <div className="yc-fld">
          <label htmlFor="venues-tier">{t('venues.filter.tier')}</label>
          <select
            id="venues-tier"
            className="yc-ctl"
            value={filters.tier}
            onChange={(event) => setFilter('tier', event.target.value as TierFilter)}
          >
            {TIER_FILTERS.map((value) => (
              <option key={value} value={value}>
                {t(TIER_LABEL[value])}
              </option>
            ))}
          </select>
        </div>
      </div>

      {failure ? (
        <p className="yc-alert" role="alert">
          <AlertCircleIcon />
          {failure}
        </p>
      ) : null}

      <section className="yc-card" aria-label={t('venues.list')}>
        {body}
      </section>

      {shown?.kind === 'tier' ? (
        <TierDialog
          venue={shown.venue}
          onClose={() => setShown(null)}
          onDone={(message) => {
            setShown(null);
            toast.say(message);
          }}
          returnFocusTo={() =>
            shown.from === 'button' ? tierButtonOf(shown.venue.id) : kebabOf(shown.venue.id)
          }
        />
      ) : null}

      {shown?.kind === 'delete' ? (
        <DeleteVenueDialog
          venue={shown.venue}
          onClose={() => setShown(null)}
          returnFocusTo={() => kebabOf(shown.venue.id)}
          onDeleted={(venue) => {
            setShown(null);
            toast.say(t('venues.toast.deleted', { name: venue.name }), {
              undo: () => void restoreVenue(venue, true),
              focusUndo: true,
            });
          }}
          onSuspendedInstead={(venue) => {
            setShown(null);
            toast.say(t('venues.toast.suspendedInstead', { name: venue.name }), {
              undo: () => void undoSuspend(venue),
            });
          }}
        />
      ) : null}

      {shown?.kind === 'create' ? (
        <CreateVenueDialog
          takenSlugs={takenSlugs}
          onClose={() => setShown(null)}
          onCreated={afterCreate}
        />
      ) : null}

      {shown?.kind === 'once' ? (
        shown.created.kind === 'withLink' ? (
          <OnceLinkDialog
            title={t('venues.once.title', { name: shown.created.venue.name })}
            link={shown.created.link}
            pin={shown.created.pin}
            venueHref={`/platform/venues/${shown.created.venue.id}`}
            timeZoneId={CONSOLE_TIME_ZONE}
            onDone={() => {
              const name = shown.created.venue.name;
              setShown(null);
              addRef.current?.focus();
              toast.say(t('venues.toast.listed', { name }));
            }}
          />
        ) : (
          <OwnerFailedDialog
            name={shown.created.venue.name}
            venueId={shown.created.venue.id}
            reason={shown.created.reason}
            onClose={() => {
              setShown(null);
              addRef.current?.focus();
            }}
          />
        )
      ) : null}
    </>
  );
}

/** The venue was made; its owner was not. Said in a dialog, because it needs doing. */
function OwnerFailedDialog({
  name,
  venueId,
  reason,
  onClose,
}: {
  readonly name: string;
  readonly venueId: string;
  readonly reason: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <Dialog title={t('venues.once.title', { name })} onClose={onClose}>
      <p className="yc-alert yc-alert-warn" role="alert">
        {t('venues.add.ownerFailed', { reason })}
      </p>
      <div className="yc-acts">
        <Link className="yc-btn yc-btn-sec" to={`/platform/venues/${venueId}`}>
          {t('venues.once.openVenue')}
        </Link>
        <button type="button" className="yc-btn yc-btn-pri" data-autofocus="" onClick={onClose}>
          {t('venues.once.done')}
        </button>
      </div>
    </Dialog>
  );
}

interface VenueRowProps {
  readonly venue: ConsoleVenue;
  readonly showRating: boolean;
  readonly showCuisine: boolean;
  readonly locale: string;
  readonly menuOpen: boolean;
  readonly onMenu: (open: boolean) => void;
  readonly menuItems: readonly RowMenuItem[];
  readonly onTier: () => void;
}

/** One decimal, in the reader's own numerals: "4.7", "4,7". */
const oneDecimal = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    value,
  );

function VenueRow({
  venue,
  showRating,
  showCuisine,
  locale,
  menuOpen,
  onMenu,
  menuItems,
  onTier,
}: VenueRowProps) {
  const { t } = useTranslation(['admin', 'common']);
  const deleted = venue.status === 'deleted';
  const summary = venueTierSummary(venue);
  const tierLabel =
    summary.kind === 'mixed'
      ? t('venues.tierSummary.mixed', { paid: summary.paid, total: summary.total })
      : summary.kind === 'none'
        ? t('venues.tierSummary.none')
        : summary.kind === 'paid'
          ? t('tier.paid')
          : t('tier.free');
  const typeLabel =
    venue.type === 'cafe'
      ? t('create.typeCafe')
      : venue.type === 'restaurant'
        ? t('create.typeRestaurant')
        : t('create.typeBar');
  const issue = !deleted && venue.readinessIssue ? issueText(venue.readinessIssue, t) : null;
  const subline = [venue.slug, venue.district].filter(Boolean).join(' · ');
  const reviews = venue.reviewCount ?? 0;

  return (
    <tr className={venue.status === 'active' ? undefined : 'is-dim'}>
      <td>
        <div className="yc-vcell">
          <VenueThumb venue={venue} />
          <div className="yc-vtext">
            <Link className="yc-vname" to={`/platform/venues/${venue.id}`}>
              {venue.name}
            </Link>
            <div className="yc-slug">{subline}</div>
            {issue ? (
              <div className="yc-issue">
                <AlertCircleIcon />
                {issue}
              </div>
            ) : null}
          </div>
        </div>
      </td>
      <td>{typeLabel}</td>
      {showCuisine ? <td className="yc-wrap">{venue.cuisine ?? '—'}</td> : null}
      {showRating ? (
        <td className="yc-num">
          {typeof venue.rating === 'number' ? (
            <>
              <span aria-hidden="true">
                {t('venues.rating', {
                  rating: oneDecimal(venue.rating, locale),
                  count: new Intl.NumberFormat(locale).format(reviews),
                })}
              </span>
              <span className="yc-sr">
                {t('venues.ratingSr', { rating: oneDecimal(venue.rating, locale), count: reviews })}
              </span>
            </>
          ) : (
            <>
              <span aria-hidden="true">—</span>
              <span className="yc-sr">{t('venues.noRating')}</span>
            </>
          )}
        </td>
      ) : null}
      <td className="yc-num">{venue.tableCount}</td>
      <td>
        {deleted || summary.kind === 'none' ? (
          <span className="yc-tier-text">{tierLabel}</span>
        ) : (
          <button
            type="button"
            className={`yc-tier is-${summary.kind}`}
            data-tier={venue.id}
            aria-label={t('venues.tierButton', { tier: tierLabel })}
            onClick={onTier}
          >
            {tierLabel}
            <ChevronsUpDownIcon />
          </button>
        )}
      </td>
      <td>
        <span className={PILL[venue.status]}>
          <span className="yc-dot" aria-hidden="true" />
          {t(`status.${venue.status}`)}
        </span>
      </td>
      <td className="yc-mcell">
        <RowMenu
          id={venue.id}
          label={t('venues.menu.label', { name: venue.name })}
          items={menuItems}
          open={menuOpen}
          onOpenChange={onMenu}
        />
      </td>
    </tr>
  );
}

function issueText(issue: VenueReadinessIssue, t: Translate): string {
  const text =
    issue.kind === 'incompleteDishes'
      ? t('venues.issue.incompleteDishes', { count: issue.count ?? 0 })
      : t(`venues.issue.${issue.kind}`);
  return issue.branchName
    ? t('venues.issue.atBranch', { issue: text, branch: issue.branchName })
    : text;
}
