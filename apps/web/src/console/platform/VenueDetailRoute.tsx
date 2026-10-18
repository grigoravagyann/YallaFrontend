import {
  ApiError,
  NotFoundError,
  describeFailure,
  venueTierSummary,
  type ConsoleBranch,
  type ConsoleVenueDetail,
} from '@yalla/api';
import { useRestoreVenue, useStaff } from '@yalla/api/react';
import { formatDate } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useConsoleVenue, useResumeVenue, useUpdateVenue } from '../../data/queries';
import { newCommandId } from '../../lib/commandId';
import { ErrorState, errorKindFor } from '../ui/ErrorState';
import { PauseIcon, RestoreIcon, TrashIcon } from '../ui/icons';
import { Tabs, panelId, tabId } from '../ui/Tabs';
import { useToast } from '../ui/toast';
import { AddBranchDialog } from './venue/AddBranchDialog';
import { BookingsPanel } from './venue/BookingsPanel';
import { EditVenueDialog } from './venue/EditVenueDialog';
import { OverviewPanel } from './venue/OverviewPanel';
import { StaffPanel } from './venue/StaffPanel';
import { SuspendVenueDialog } from './venue/SuspendVenueDialog';
import { useVenueTypeLabel } from './venue/venueFields';
import { DeleteVenueDialog } from './venues/DeleteVenueDialog';
import { TierDialog } from './venues/TierDialog';
import { VenueThumb } from './venues/VenueThumb';

/** Every venue in the pilot is in Yerevan. */
const CONSOLE_TIME_ZONE = 'Asia/Yerevan';

type Tab = 'overview' | 'staff' | 'bookings';
const TABS: readonly Tab[] = ['overview', 'staff', 'bookings'];
const TAB_PREFIX = 'venue';

type Shown =
  | { readonly kind: 'edit' }
  | { readonly kind: 'suspend' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'branch' }
  | { readonly kind: 'tier'; readonly branch: ConsoleBranch };

/** Focus what a selector names once the render that brings it back has happened. */
function focusSoon(selector: string) {
  setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 0);
}

/**
 * One venue, for the platform admin (VenueDetail artboard; HANDOFF section 8
 * step 3).
 *
 * - **Header**: the venue's picture, name, state, plan, type and web address,
 *   with Edit, Suspend and Delete. A suspended venue carries a banner with
 *   Resume; a deleted one a banner with Restore and nothing else to change.
 * - **Tabs** on a roving tabindex, the selected one in the address
 *   (`?tab=staff`) so a link can open it: Overview (numbers, the branches with
 *   each one's own plan, readiness, details), Staff (the wizard and sign-ins,
 *   shown once), Bookings (totals only).
 * - **Suspend and delete undo** from their toast; a delete goes back to the
 *   list, where the undo still stands.
 *
 * The `venueId` in the URL is not a scope claim: a platform admin's token
 * covers every venue, which is why this route exists only in their router; the
 * server checks anyway.
 */
export function VenueDetailRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const typeLabel = useVenueTypeLabel();
  const [params, setParams] = useSearchParams();
  const query = useConsoleVenue(venueId);
  const staff = useStaff(venueId);
  const resume = useResumeVenue();
  const restore = useRestoreVenue();
  const update = useUpdateVenue();
  const [shown, setShown] = useState<Shown | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * The venue's state now, for an Undo pressed later: an Undo of a
   * suspension that the banner's Resume already lifted must not resume twice.
   */
  const latestStatus = useRef(query.data?.status);
  useEffect(() => {
    latestStatus.current = query.data?.status;
  });

  const tabParam = params.get('tab');
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'overview';
  const selectTab = (next: Tab) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === 'overview') copy.delete('tab');
        else copy.set('tab', next);
        return copy;
      },
      { replace: true },
    );

  if (query.isLoading) {
    return (
      <p className="yc-empty-line" role="status">
        {t('loading')}
      </p>
    );
  }
  const venue = query.data;
  if (!venue) {
    const error = query.error;
    // The mock answers null and the server 404s: either way, not here.
    const kind =
      !error || error instanceof NotFoundError ? 'notFound' : errorKindFor(describeFailure(error));
    return (
      <ErrorState
        kind={kind}
        reference={error instanceof ApiError ? error.requestId : null}
        onRetry={() => query.refetch()}
      />
    );
  }

  const deleted = venue.status === 'deleted';
  const suspended = venue.status === 'suspended';
  const summary = venueTierSummary(venue);
  const activeStaff = (staff.data ?? []).filter((member) => member.isActive).length;

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

  /** The toast's Undo of a suspension: only while the venue is still suspended. */
  async function undoSuspend(current: ConsoleVenueDetail) {
    if (latestStatus.current !== 'suspended') return;
    await resumeVenue(current);
  }

  async function resumeVenue(current: ConsoleVenueDetail) {
    if (await run(() => resume.mutateAsync({ venueId: current.id, commandId: newCommandId() }))) {
      focusSoon('[data-suspend]');
      toast.say(t('venuePage.toast.activeAgain', { name: current.name }));
    }
  }

  async function restoreVenue(current: ConsoleVenueDetail) {
    if (await run(() => restore.mutateAsync({ venueId: current.id, commandId: newCommandId() }))) {
      toast.say(t('venues.toast.restored', { name: current.name }));
    }
  }

  return (
    <>
      <nav aria-label={t('venuePage.crumbs')}>
        <ol className="yc-crumbs">
          <li>
            <Link to="/platform/venues">{t('venues.title')}</Link>
          </li>
          <li aria-current="page">{venue.name}</li>
        </ol>
      </nav>

      {suspended ? (
        <div className="yc-banner yc-banner-grey" role="status">
          <PauseIcon />
          <span className="yc-grow">
            <b>
              {venue.suspendedAtUtc
                ? t('venuePage.banner.suspendedSince', {
                    date: formatDate(venue.suspendedAtUtc, CONSOLE_TIME_ZONE, locale),
                  })
                : t('venuePage.banner.suspended')}
            </b>{' '}
            {t('venuePage.banner.suspendedBody')}
          </span>
          <button
            type="button"
            className="yc-btn yc-btn-pri yc-btn-sm"
            data-resume=""
            aria-busy={resume.isPending}
            onClick={() => void resumeVenue(venue)}
          >
            {t('venuePage.banner.resume')}
          </button>
        </div>
      ) : null}
      {deleted ? (
        <div className="yc-banner yc-banner-grey" role="status">
          <TrashIcon />
          <span className="yc-grow">
            <b>{t('venuePage.banner.deleted')}</b> {t('venuePage.banner.deletedBody')}
          </span>
          <button
            type="button"
            className="yc-btn yc-btn-pri yc-btn-sm"
            aria-busy={restore.isPending}
            onClick={() => void restoreVenue(venue)}
          >
            <RestoreIcon />
            {t('venuePage.banner.restore')}
          </button>
        </div>
      ) : null}

      <div className="yc-head">
        <VenueThumb venue={venue} large />
        <div className="yc-head-t">
          <h1 className="yc-h1">{venue.name}</h1>
          <div className="yc-head-m">
            <span
              className={
                venue.status === 'active'
                  ? 'yc-pill yc-pill-green'
                  : deleted
                    ? 'yc-pill yc-pill-red'
                    : 'yc-pill yc-pill-grey'
              }
            >
              <span className="yc-dot" aria-hidden="true" />
              {t(`status.${venue.status}`)}
            </span>
            {summary.kind !== 'none' ? (
              <span className="yc-pill yc-pill-brand">
                {summary.kind === 'mixed'
                  ? t('venues.tierSummary.mixed', { paid: summary.paid, total: summary.total })
                  : summary.kind === 'paid'
                    ? t('tier.paid')
                    : t('tier.free')}
              </span>
            ) : null}
            <span>{[typeLabel(venue.type), venue.cuisine].filter(Boolean).join(' · ')}</span>
            <span aria-hidden="true">·</span>
            <span>yalla.am/{venue.slug}</span>
          </div>
        </div>
        {deleted ? null : (
          <div className="yc-head-a">
            <button
              type="button"
              className="yc-btn yc-btn-sec"
              data-edit=""
              onClick={() => setShown({ kind: 'edit' })}
            >
              {t('venuePage.edit')}
            </button>
            {venue.status === 'active' ? (
              <button
                type="button"
                className="yc-btn yc-btn-sec"
                data-suspend=""
                onClick={() => setShown({ kind: 'suspend' })}
              >
                {t('venuePage.suspend')}
              </button>
            ) : null}
            <button
              type="button"
              className="yc-btn yc-btn-dl"
              data-delete=""
              onClick={() => setShown({ kind: 'delete' })}
            >
              {t('venuePage.delete')}
            </button>
          </div>
        )}
      </div>

      {failure ? (
        <p className="yc-alert" role="alert">
          {failure}
        </p>
      ) : null}

      <Tabs
        label={t('venuePage.tabs.label')}
        idPrefix={TAB_PREFIX}
        selected={tab}
        onSelect={selectTab}
        tabs={[
          { id: 'overview', label: t('venuePage.tabs.overview') },
          {
            id: 'staff',
            label: t('venuePage.tabs.staff'),
            ...(staff.data ? { badge: activeStaff } : {}),
          },
          { id: 'bookings', label: t('venuePage.tabs.bookings') },
        ]}
      />

      <div
        className="yc-panel"
        role="tabpanel"
        id={panelId(TAB_PREFIX, tab)}
        aria-labelledby={tabId(TAB_PREFIX, tab)}
      >
        {tab === 'overview' ? (
          <OverviewPanel
            venue={venue}
            onBranchPlan={deleted ? null : (branch) => setShown({ kind: 'tier', branch })}
            onAddBranch={deleted ? null : () => setShown({ kind: 'branch' })}
          />
        ) : tab === 'staff' ? (
          <StaffPanel venue={venue} canChange={!deleted} />
        ) : (
          <BookingsPanel venueId={venue.id} />
        )}
      </div>

      {shown?.kind === 'edit' ? (
        <EditVenueDialog
          venue={venue}
          onClose={() => setShown(null)}
          onSaved={(previous) => {
            setShown(null);
            toast.say(t('venuePage.toast.saved'), {
              undo: () =>
                void run(() =>
                  update.mutateAsync({ venueId: venue.id, commandId: newCommandId(), ...previous }),
                ).then((done) => {
                  if (done) toast.say(t('venuePage.toast.undone'));
                }),
            });
          }}
        />
      ) : null}

      {shown?.kind === 'suspend' ? (
        <SuspendVenueDialog
          venue={venue}
          onClose={() => setShown(null)}
          onSuspended={() => {
            setShown(null);
            focusSoon('[data-resume]');
            toast.say(t('venuePage.toast.suspended', { name: venue.name }), {
              undo: () => void undoSuspend(venue),
            });
          }}
        />
      ) : null}

      {shown?.kind === 'delete' ? (
        <DeleteVenueDialog
          venue={venue}
          onClose={() => setShown(null)}
          returnFocusTo={() => document.querySelector<HTMLElement>('[data-delete]')}
          onDeleted={(gone) => {
            setShown(null);
            // Back to the list: the venue is hidden there now, and the undo
            // brings it back where the person is.
            navigate('/platform/venues');
            toast.say(t('venues.toast.deleted', { name: gone.name }), {
              undo: () =>
                void restore.mutateAsync({ venueId: gone.id, commandId: newCommandId() }).then(
                  () => toast.say(t('venues.toast.undeleted', { name: gone.name })),
                  // A failure is said as one: an alert, not a confirmation.
                  () => toast.say(t('venue.failed'), { tone: 'error' }),
                ),
              focusUndo: true,
              // The page that had the Delete button is gone: the list's search.
              fallbackFocus: () => document.getElementById('venues-q'),
            });
          }}
          onSuspendedInstead={(current) => {
            setShown(null);
            focusSoon('[data-resume]');
            toast.say(t('venues.toast.suspendedInstead', { name: current.name }), {
              undo: () => void undoSuspend(venue),
            });
          }}
        />
      ) : null}

      {shown?.kind === 'branch' ? (
        <AddBranchDialog
          venue={venue}
          onClose={() => setShown(null)}
          onAdded={(name) => {
            setShown(null);
            toast.say(t('venuePage.toast.branchAdded', { name }));
          }}
        />
      ) : null}

      {shown?.kind === 'tier' ? (
        <TierDialog
          venue={venue}
          branch={shown.branch}
          onClose={() => setShown(null)}
          onDone={(message) => {
            setShown(null);
            toast.say(message);
          }}
          returnFocusTo={() =>
            document.querySelector<HTMLElement>(`[data-branch-tier="${shown.branch.id}"]`)
          }
        />
      ) : null}
    </>
  );
}
