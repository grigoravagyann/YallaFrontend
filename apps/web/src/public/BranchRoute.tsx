import { nextHalfHour, type PublicBranch, type TableAvailability } from '@yalla/api';
import {
  isOfflinePaused,
  usePublicBranch,
  usePublicGateway,
  usePublicMenu,
} from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FindUs, OpeningHours } from './BranchDetails';
import { FreeTables, OpenBadge } from './LiveCount';
import { MenuSection } from './MenuSection';
import { applyPageMeta } from './meta';
import { FailedPage, LoadingPage, NotAvailablePage, NotFoundPage } from './PageStates';
import { RoomSection } from './RoomSection';
import { defaultSelection, slotInstant, type SlotSelection } from './slots';

/**
 * `/{venueSlug}/{branchSlug}` — the page this whole task is about.
 *
 * The order of what is on it is the order somebody scanning a phone needs, and
 * it is not the order a venue would choose:
 *
 * 1. the venue — name, cover, type, one line;
 * 2. **open or shut right now**, and until when — tonight, not a weekly table;
 * 3. **how many tables are free**, the largest thing after the name and the
 *    only fact on this page that no other website can tell them;
 * 4. the room;
 * 5. the menu;
 * 6. where it is, and the week's hours behind a tap.
 *
 * Nothing else. No reviews, no ratings, no social links, no newsletter, and no
 * app banner — a button that opens an app store is not a feature, it is a dead
 * end with a logo, and it would sit exactly where the free-table count belongs.
 */

/** The booking panel, its verification and its calendar file — none of it needed to read the page. */
const BookingSheet = lazy(() => import('./BookingSheet'));

export function BranchRoute() {
  const { venueSlug, branchSlug } = useParams<{ venueSlug: string; branchSlug: string }>();
  const branchQuery = usePublicBranch({ venueSlug, branchSlug });

  if (branchQuery.isLoading) return <LoadingPage />;

  if (branchQuery.isError || isOfflinePaused(branchQuery)) {
    return (
      <FailedPage
        offline={isOfflinePaused(branchQuery)}
        error={branchQuery.error}
        onRetry={() => void branchQuery.refetch()}
      />
    );
  }

  // Null is a slug pair that does not resolve — including one whose halves both
  // exist but belong to different venues. A 404, never a redirect to the right
  // venue: a redirect is an oracle for enumerating a chain's branches.
  if (!branchQuery.data) return <NotFoundPage />;

  if (branchQuery.data.status !== 'live') {
    return <NotAvailablePage venueName={branchQuery.data.venue.name} />;
  }

  return <BranchPage branch={branchQuery.data} />;
}

function BranchPage({ branch }: { readonly branch: PublicBranch }) {
  const { t } = useTranslation('public');
  const { locale } = useLocale();
  const publicGateway = usePublicGateway();
  const menuQuery = usePublicMenu(branch.id);

  const [selection, setSelection] = useState<SlotSelection>(() =>
    defaultSelection(branch.timeZoneId),
  );
  const [chosen, setChosen] = useState<TableAvailability | null>(null);
  const [takenTableLabel, setTakenTableLabel] = useState<string | null>(null);

  /*
   * Defence in depth behind `RoomSection`, which already refuses to store an
   * unusable selection.
   *
   * The page must never be able to reach a render it cannot complete: there is
   * no error boundary anywhere in this app, so a throw here unmounts the whole
   * tree and a stranger who opened a link gets a white tab. The default slot is
   * the same one the page opened on, so falling back to it costs the diner
   * nothing they chose.
   */
  const slotUtc = useMemo(() => {
    const instant = slotInstant(selection, branch.timeZoneId);
    return (instant ?? nextHalfHour(new Date())).toISOString();
  }, [selection, branch.timeZoneId]);

  /*
   * The unfurl tags, corrected for anything that runs JavaScript.
   *
   * Read `meta.ts` before concluding this makes shared links work: WhatsApp's
   * fetcher and every other unfurler take the static shell and never execute
   * this. What it genuinely fixes is the document title, the `lang` attribute,
   * and the in-app browsers that *do* run the page before offering a share
   * sheet.
   */
  useEffect(() => {
    let cancelled = false;
    const canonicalUrl = new URL(
      `/${branch.venue.slug}/${branch.slug}`,
      window.location.origin,
    ).toString();

    void publicGateway
      .getBranchMeta({
        venueSlug: branch.venue.slug,
        branchSlug: branch.slug,
        canonicalUrl,
        locale,
      })
      .then((meta) => {
        if (!cancelled && meta) applyPageMeta(meta);
      })
      .catch(() => {
        // The meta endpoint is the least important call on the page. A failure
        // leaves the shell's own generic tags in place, which is the state
        // every crawler sees anyway.
      });

    return () => {
      cancelled = true;
    };
  }, [publicGateway, branch.venue.slug, branch.slug, locale]);

  return (
    <main className="pub-page">
      <Cover branch={branch} />

      <header className="pub-head">
        <h1 className="display">{branch.venue.name}</h1>
        <p className="pub-branch-name">{branch.name}</p>
        <p className="pub-muted">
          {t(`venue.type.${branch.venue.type}`, { ns: 'diner' })}
          {branch.venue.description ? ` · ${branch.venue.description}` : ''}
        </p>

        <OpenBadge openState={branch.openState} timeZoneId={branch.timeZoneId} locale={locale} />
        <FreeTables branch={branch} locale={locale} />

        {!branch.openState.isOpen && branch.acceptsWebBookings ? (
          <p className="pub-muted">{t('booking.closedNotice')}</p>
        ) : null}
      </header>

      <RoomSection
        branch={branch}
        selection={selection}
        onSelectionChange={(next) => {
          setSelection(next);
          setChosen(null);
        }}
        slotUtc={slotUtc}
        selectedTableId={chosen?.tableId ?? null}
        onTableTap={(availability) => {
          setTakenTableLabel(null);
          setChosen(availability);
        }}
        takenTableLabel={takenTableLabel}
      />

      {chosen && branch.acceptsWebBookings ? (
        <Suspense fallback={<div className="pub-sheet is-loading" aria-hidden="true" />}>
          <BookingSheet
            branch={branch}
            availability={chosen}
            slotUtc={slotUtc}
            partySize={selection.partySize}
            onClose={() => setChosen(null)}
            onTableTaken={setTakenTableLabel}
          />
        </Suspense>
      ) : null}

      <MenuSection menu={menuQuery.data} />
      <FindUs branch={branch} />
      <OpeningHours branch={branch} locale={locale} />
    </main>
  );
}

/**
 * The cover photo, or nothing at all.
 *
 * Eager rather than lazy — it is the top of the page and lazy-loading the one
 * image above the fold delays the thing that makes the page look like a place.
 * `width`/`height` are set so the space is reserved before the bytes arrive,
 * and a venue with no cover, or a URL that fails, renders no box rather than a
 * grey rectangle pretending a photo is coming.
 */
function Cover({ branch }: { readonly branch: PublicBranch }) {
  const [failed, setFailed] = useState(false);
  const photo = branch.venue.coverPhoto;

  if (!photo || failed) return null;

  return (
    <div className="pub-cover">
      <img
        src={photo.cardUrl}
        alt=""
        width={photo.width ?? 1600}
        height={photo.height ?? 900}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
