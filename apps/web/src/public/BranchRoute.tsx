import type { PublicBranch, TableAvailability } from '@yalla/api';
import { usePublicBranch, usePublicGateway, usePublicMenu, useSlotFloor } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AboutSection } from './AboutSection';
import {
  BookingCard,
  ChosenTableLine,
  type ChosenTable,
  type SelectionChange,
} from './BookingCard';
import { FindUs, OpeningHours } from './BranchDetails';
import { useBranchDetail } from './branchDetail';
import { BranchLine, FactsLine, HeaderActions, TypeLine } from './BranchHeader';
import { isBookingColumnSticky, stickyColumnRoom } from './layout';
import { Icon } from './icons';
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
import { branchToday, defaultSelection, slotInstant, type SlotSelection } from './slots';
import { isPickable, pickTableFor, roomOf } from './tablePick';
import { useSettled } from './useSettled';

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
  // The day's first guess; the booking card moves it to the day's default
  // time (the first that confirms at once) when the server's day answers.
  const [selection, setSelection] = useState<SlotSelection>(() =>
    defaultSelection(branch.timeZoneId, new Date(), slotRules),
  );
  const { t } = useTranslation('public');
  /**
   * The table chosen in the room — tapped, or chosen for the visitor. Kept
   * when the day, time or party changes, for as long as the room's answer for
   * the new slot still gives it.
   */
  const [picked, setPicked] = useState<{ readonly id: string; readonly label: string } | null>(
    null,
  );
  /**
   * The booking panel, once "Book table N" opened it: the table's answer at
   * that moment, and which column it opened in — the booking column when that
   * is sticky beside the room, under the room otherwise. Decided when the
   * panel opens and kept for its life, through taps on other tables too: a
   * window resized mid-booking must not remount a panel holding a verified
   * phone and the attempt's command id.
   */
  const [panel, setPanel] = useState<{
    readonly availability: TableAvailability;
    readonly inAside: boolean;
  } | null>(null);
  /**
   * A booking was just made from the panel. Its table is no longer free —
   * because of the visitor — so it is not "lost", and the time is left where
   * it was booked, until the visitor changes something (review S1).
   */
  const [booked, setBooked] = useState(false);
  /** The table lost to somebody else while confirming, said where the panel was. */
  const [taken, setTaken] = useState<{ readonly label: string; readonly inAside: boolean } | null>(
    null,
  );
  /** What happened to the chosen table, said on the card: chosen for you, none fits, gone. */
  const [tableNote, setTableNote] = useState<string | null>(null);
  /** The room on screen, which "Choose for me" looks in first. */
  const [roomShown, setRoomShown] = useState<string | null>(null);
  /** The Book button that opened the panel, which has the focus back when it closes. */
  const opener = useRef<HTMLElement | null>(null);
  /** Set when the visitor closes the panel, for the effect that hands the focus back. */
  const refocus = useRef(false);
  const bookingHeadingId = useId();
  /**
   * The booking column is taller than the window — a day of thirty-odd times —
   * so it flows with the page rather than sticking as a box that hides its own
   * foot (QA 1). Measured, because only the content knows its height.
   */
  const aside = useRef<HTMLElement | null>(null);
  const [asideTall, setAsideTall] = useState(false);
  useEffect(() => {
    const node = aside.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const content = [...node.children].reduce(
        (sum, child) => sum + child.getBoundingClientRect().height,
        0,
      );
      setAsideTall(content > stickyColumnRoom());
    };
    const observer = new ResizeObserver(measure);
    for (const child of node.children) observer.observe(child);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  });

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
   * The room's answer for the slot — the same query the room draws from and
   * polls (`RoomSection`), read here without a second poll: it says which
   * table is chosen, whether it is still to be had, and which one "Choose for
   * me" takes. `current` only once it is the answer for this slot and party:
   * the previous slot's answer stays on screen while the next one loads.
   */
  const floorQuery = useSlotFloor({
    branchId: branch.id,
    // Settled as the room settles it, so the two read one key (review S5).
    slotUtc: useSettled(slotUtc),
    partySize: selection.partySize,
    timeZoneId: branch.timeZoneId,
  });
  const floor = floorQuery.data ?? undefined;
  const current =
    floor &&
    !floorQuery.isPlaceholderData &&
    floor.partySize === selection.partySize &&
    Date.parse(floor.slotUtc) === Date.parse(slotUtc)
      ? floor
      : undefined;

  /*
   * A chosen table the new slot no longer gives — a time it is booked at, a
   * party it is too small for — is let go, and the card says so. Not while the
   * panel is open on it: a table taken mid-booking is the server's 409 to tell.
   * Adjusted during render, React's pattern for state that follows a prop.
   */
  if (picked && !panel && !booked && current) {
    const table = current.plan.tables.find((entry) => entry.id === picked.id);
    if (!table || !isPickable(table) || !roomOf(table, branch.rooms)) {
      setPicked(null);
      setTableNote(t('booking.table.lost', { label: picked.label }));
    }
  }

  const pickedTable = picked
    ? floor?.plan.tables.find((table) => table.id === picked.id)
    : undefined;
  const chosenTable: ChosenTable | null =
    picked && branch.acceptsWebBookings
      ? {
          label: pickedTable?.label ?? picked.label,
          seats: pickedTable?.seats ?? null,
          roomName: (pickedTable && roomOf(pickedTable, branch.rooms)?.name) ?? null,
          availability:
            current?.tables.find((entry) => entry.tableId === picked.id && entry.isBookable) ??
            null,
        }
      : null;

  /** The focus back on the Book button once the panel has closed and it shows again. */
  useEffect(() => {
    if (panel || !refocus.current) return;
    refocus.current = false;
    if (opener.current?.isConnected) opener.current.focus();
  }, [panel]);

  const choose = (id: string, label: string) => {
    setTaken(null);
    setTableNote(null);
    setBooked(false);
    setPicked({ id, label });
  };

  /**
   * The selection moved. By the visitor: a new attempt — the panel closes, and
   * what the page said about the last one goes. By the card keeping the time on
   * one that can be had (`automatic`): the visitor did nothing, so a "just
   * taken" notice, and the focus on it, stay (review B2).
   */
  const changeSelection = (next: SlotSelection, how?: SelectionChange) => {
    setSelection(next);
    if (how?.automatic) return;
    setPanel(null);
    setTaken(null);
    setTableNote(null);
    setBooked(false);
  };

  const openPanel = () => {
    const availability = chosenTable?.availability;
    if (!availability) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTaken(null);
    setPanel((open) => open ?? { availability, inAside: isBookingColumnSticky() });
  };

  const closePanel = () => {
    refocus.current = true;
    setPanel(null);
    if (booked) {
      // The table is the visitor's now; the card is ready for another.
      setPicked(null);
      setTableNote(null);
    }
  };

  const pickForMe = () => {
    if (!current) {
      // Said, not ignored: the room is on its way, or did not come (review S9).
      setTableNote(t(floorQuery.isError ? 'booking.table.roomFailed' : 'booking.table.checking'));
      return;
    }
    const table = pickTableFor({
      tables: current.plan.tables,
      rooms: branch.rooms,
      partySize: selection.partySize,
      currentRoomId: roomShown,
    });
    if (!table) {
      setPicked(null);
      setTableNote(t('booking.table.noneFits', { count: selection.partySize }));
      return;
    }
    choose(table.id, table.label);
    setTableNote(
      t('booking.table.chosen', {
        label: table.label,
        seats: t('booking.seats', { count: table.seats }),
        room: roomOf(table, branch.rooms)?.name ?? '',
      }),
    );
  };

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

  const sheet =
    panel && branch.acceptsWebBookings ? (
      <Suspense fallback={<div className="pub-sheet is-loading" aria-hidden="true" />}>
        <BookingSheet
          branch={branch}
          availability={panel.availability}
          slotUtc={slotUtc}
          partySize={selection.partySize}
          onClose={closePanel}
          onBooked={() => setBooked(true)}
          onTableTaken={(label) => {
            // Said where the panel was, which then has the focus — not the
            // Book button, which is no longer the next thing to press.
            setTaken({ label, inAside: panel.inAside });
            setPicked(null);
            setTableNote(null);
            opener.current = null;
          }}
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
          {branch.acceptsWebBookings ? (
            // On a phone the booking card is below the header; from 960px it
            // is beside it, and this link is not drawn (`public.css`).
            <a
              className="pub-button pub-button-primary pub-only-phone pub-head-book"
              href="#book"
              // The keyboard follows the scroll to the card (review N15).
              onClick={() => document.getElementById(bookingHeadingId)?.focus()}
            >
              <Icon name="calendar" />
              {t('booking.pick')}
            </a>
          ) : null}
          <HeaderActions branch={branch} />
        </header>
      </div>

      {/* A region rather than an `<aside>`: booking is the page's main task,
          not complementary to it. */}
      <section
        className={asideTall ? 'pub-aside is-tall' : 'pub-aside'}
        id="book"
        aria-labelledby={bookingHeadingId}
        ref={aside}
      >
        <BookingCard
          branch={branch}
          selection={selection}
          // A new slot is a new attempt: the panel closes, and the table stays
          // chosen while the new slot still gives it.
          onSelectionChange={changeSelection}
          slotUtc={slotUtc}
          headingId={bookingHeadingId}
          floor={floor}
          table={chosenTable}
          onBook={openPanel}
          onPickForMe={pickForMe}
          roomReady={current !== undefined}
          tableNote={tableNote}
          takenTableLabel={taken?.inAside ? taken.label : null}
          panelOpen={panel !== null}
          panelInColumn={panel?.inAside ?? false}
          holdTime={booked}
        />
        {panel?.inAside ? sheet : null}
      </section>

      <div className="pub-col pub-col-rest">
        <RoomSection
          branch={branch}
          selection={selection}
          slotUtc={slotUtc}
          selectedTableId={picked?.id ?? null}
          onTableTap={(availability) => {
            choose(availability.tableId, availability.tableLabel);
            // An open panel follows the table tapped — a new attempt (see
            // `BookingSheet`) — and stays in the column it opened in.
            setPanel((open) => (open ? { ...open, availability } : open));
          }}
          takenTableLabel={taken && !taken.inAside ? taken.label : null}
          onRoomShown={setRoomShown}
          footer={
            chosenTable ? (
              <PhoneBookingBar
                table={chosenTable}
                selection={selection}
                today={branchToday(branch.timeZoneId)}
                hidden={panel !== null}
                onBook={openPanel}
              />
            ) : null
          }
        />
        {panel && !panel.inAside ? sheet : null}

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

/**
 * The phone's booking bar (Main artboard): once a table is chosen, under the
 * room the visitor chose it in — the booking card is a screen above by then.
 * The sticky card does this job on a desktop, so the bar is not drawn there
 * (`public.css`). Hidden, not unmounted, while the panel it opens is open, so
 * the focus can come back to it.
 */
function PhoneBookingBar({
  table,
  selection,
  today,
  hidden,
  onBook,
}: {
  readonly table: ChosenTable;
  readonly selection: SlotSelection;
  readonly today: string;
  readonly hidden: boolean;
  readonly onBook: () => void;
}) {
  const { t } = useTranslation('public');
  return (
    <div className="pub-pickbar" hidden={hidden}>
      <ChosenTableLine table={table} selection={selection} today={today} />
      <button
        type="button"
        className="pub-button pub-button-primary"
        disabled={!table.availability}
        onClick={onBook}
      >
        {t('booking.table.book', { label: table.label })}
      </button>
    </div>
  );
}
