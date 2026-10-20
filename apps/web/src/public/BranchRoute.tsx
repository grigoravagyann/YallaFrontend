import type { PublicBranch, TableAvailability } from '@yalla/api';
import { usePublicBranch, usePublicGateway, usePublicMenu } from '@yalla/api/react';
import { useLocale } from '@yalla/i18n';
import { Suspense, lazy, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AboutSection } from './AboutSection';
import { BookingCard } from './BookingCard';
import { FindUs, OpeningHours } from './BranchDetails';
import { useBranchDetail } from './branchDetail';
import { BranchLine, FactsLine, HeaderActions, TypeLine } from './BranchHeader';
import { isBookingColumnSticky } from './layout';
import { BranchStatus } from './LiveCount';
import { MenuSection } from './MenuSection';
import { applyPageMeta } from './meta';
import { PhotoGallery } from './PhotoGallery';
import {
  FailedPage,
  LoadingPage,
  NotAvailablePage,
  NotFoundPage,
  pageState,
  StaleNotice,
} from './PageStates';
import { ReviewsSection } from './ReviewsSection';
import { RoomSection } from './RoomSection';
import { defaultSelection, slotInstant, type SlotSelection } from './slots';

/**
 * `/{venueSlug}/{branchSlug}` — the page this whole task is about.
 *
 * In the order somebody scanning a phone needs it (public-page HANDOFF §2, the
 * Main artboard), not the order a venue would choose:
 *
 * 1. the photos, and the venue — name, branch, type · cuisine, rating ·
 *    district · price;
 * 2. **open or shut right now**, and until when — tonight, not a weekly table —
 *    with **how many tables are free**, the one fact on this page no other
 *    website can tell them; then call, the address and share;
 * 3. the booking column (beside everything from 960px);
 * 4. the room;
 * 5. the menu, about, and reviews with the venue's replies;
 * 6. the week's hours and how to find the place.
 *
 * Two reads feed it. `PublicBranch` (by slug) carries everything above the
 * room and is the page: until it answers there is a skeleton, and it is what
 * the not-found, unavailable and failure states are about. The branch's
 * listing (`PublicBranchDetail`, by id) adds the cuisine, rating, price,
 * district, about, amenities, website, gallery and reviews; each section says
 * on its own what it does while that loads or when it fails, so a review list
 * that did not load never hides the free tables.
 *
 * Still nothing else: no social links, no newsletter and no app banner — a
 * button that opens an app store is a dead end with a logo, and it would sit
 * exactly where the free-table count belongs.
 */

/** The booking panel, its verification and its calendar file — none of it needed to read the page. */
const BookingSheet = lazy(() => import('./BookingSheet'));

export function BranchRoute() {
  const { venueSlug, branchSlug } = useParams<{ venueSlug: string; branchSlug: string }>();
  const branchQuery = usePublicBranch({ venueSlug, branchSlug });
  const state = pageState(branchQuery);

  if (state === 'loading') return <LoadingPage />;

  if (state) {
    return (
      <FailedPage
        offline={state === 'offline'}
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
    return (
      <NotAvailablePage
        venueName={branchQuery.data.venue.name}
        phoneE164={branchQuery.data.phoneE164}
      />
    );
  }

  return <BranchPage branch={branchQuery.data} stale={<StaleNotice query={branchQuery} />} />;
}

function BranchPage({
  branch,
  stale,
}: {
  readonly branch: PublicBranch;
  /** The line saying the page may be out of date, when it may. */
  readonly stale: ReactNode;
}) {
  const { locale } = useLocale();
  const publicGateway = usePublicGateway();
  const menuQuery = usePublicMenu(branch.id);
  const { detail, failed: detailFailed, retry: retryDetail } = useBranchDetail(branch.id);

  // The first slot the venue would accept — past its lead time and inside its
  // hours — rather than the next half hour, which at 01:21 is "too soon".
  // The whole sitting has to fit before closing, as the server checks it.
  const slotRules = useMemo(
    () => ({
      minLeadMinutes: branch.policy.minLeadMinutes,
      turnTimeMinutes: branch.policy.turnTimeMinutes,
      weeklyHours: branch.weeklyHours,
    }),
    [branch.policy.minLeadMinutes, branch.policy.turnTimeMinutes, branch.weeklyHours],
  );
  const [selection, setSelection] = useState<SlotSelection>(() =>
    defaultSelection(branch.timeZoneId, new Date(), slotRules),
  );
  const [chosen, setChosen] = useState<TableAvailability | null>(null);
  const [takenTableLabel, setTakenTableLabel] = useState<string | null>(null);
  /**
   * Which column the booking panel opens in: the booking column when it is
   * sticky beside the room, under the room otherwise. Decided when the panel
   * opens and kept for its life, through taps on other tables too — a window
   * resized mid-booking must not remount a panel holding a verified phone.
   */
  const [panelInAside, setPanelInAside] = useState(false);
  const bookingHeadingId = useId();

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
    const fallback = slotInstant(
      defaultSelection(branch.timeZoneId, new Date(), slotRules),
      branch.timeZoneId,
    );
    return (instant ?? fallback ?? new Date()).toISOString();
  }, [selection, branch.timeZoneId, slotRules]);

  /*
   * The unfurl tags, corrected for anything that runs JavaScript.
   *
   * Read `meta.ts` before concluding this makes shared links work: WhatsApp's
   * fetcher and every other unfurler take the static shell and never execute
   * this. What it genuinely fixes is the document title and the in-app browsers
   * that *do* run the page before offering a share sheet. The `lang` attribute
   * used to be on that list; `useDocumentLocale` owns it now, because it has to
   * follow the language the reader picked rather than the one the meta route
   * chose.
   */
  useEffect(() => {
    let cancelled = false;
    const canonicalUrl = new URL(
      `/${branch.venue.slug}/${branch.slug}`,
      window.location.origin,
    ).toString();

    void publicGateway
      .getBranchMeta({
        branchId: branch.id,
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
  }, [publicGateway, branch.id, branch.venue.slug, branch.slug, locale]);

  const panel =
    chosen && branch.acceptsWebBookings ? (
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
    ) : null;

  /*
   * Three slots, in the order a phone reads them: the top (photos, name, open
   * state), the booking column, and the rest (room, menu, address, hours).
   * From 960px the booking column moves to the right of both and stays there
   * as the page scrolls (public-page HANDOFF §3, the Desktop artboard).
   */
  return (
    <main className="pub-layout">
      <div className="pub-col pub-col-top">
        <PhotoGallery
          cover={branch.venue.coverPhoto}
          gallery={detail?.gallery ?? []}
          loading={detail === undefined}
        />

        <header className="pub-head">
          <h1 className="display">{branch.venue.name}</h1>
          <BranchLine branch={branch} />
          <TypeLine branch={branch} detail={detail} />
          <FactsLine detail={detail} locale={locale} />

          <div className="pub-now">
            <BranchStatus branch={branch} locale={locale} />
          </div>
          {stale}
          <HeaderActions branch={branch} />
        </header>
      </div>

      {/* A region rather than an `<aside>`: booking is the page's main task,
          not complementary to it. */}
      <section className="pub-aside" id="book" aria-labelledby={bookingHeadingId}>
        <BookingCard
          branch={branch}
          selection={selection}
          onSelectionChange={(next) => {
            setSelection(next);
            setChosen(null);
          }}
          slotUtc={slotUtc}
          headingId={bookingHeadingId}
        />
        {panelInAside ? panel : null}
      </section>

      <div className="pub-col pub-col-rest">
        <RoomSection
          branch={branch}
          selection={selection}
          slotUtc={slotUtc}
          selectedTableId={chosen?.tableId ?? null}
          onTableTap={(availability) => {
            setTakenTableLabel(null);
            // Only for a panel about to open: an open one stays where it is.
            if (!chosen) setPanelInAside(isBookingColumnSticky());
            setChosen(availability);
          }}
          takenTableLabel={takenTableLabel}
        />
        {panelInAside ? null : panel}

        <MenuSection menu={menuQuery.data} />
        <AboutSection branch={branch} detail={detail} />
        <ReviewsSection
          branchId={branch.id}
          detail={detail}
          failed={detailFailed}
          onRetry={retryDetail}
          locale={locale}
        />
        <OpeningHours branch={branch} locale={locale} />
        <FindUs branch={branch} detail={detail} />
      </div>
    </main>
  );
}
