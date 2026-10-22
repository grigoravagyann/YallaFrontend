import { Route, Routes } from 'react-router-dom';
import { BranchRoute } from './BranchRoute';
import { LanguageSwitcher } from './language';
import { ManageBookingRoute } from './ManageBookingRoute';
import { NotFoundPage } from './PageStates';
import { useDocumentLocale } from '../useDocumentLocale';
import { VenueRoute } from './VenueRoute';
import { Wordmark } from '../components/Wordmark';

/**
 * The public route group.
 *
 * Four routes and a catch-all, all unauthenticated, under one top bar: the
 * wordmark and the language switch, and nothing else (public-page HANDOFF:
 * own top bar, no sidebar, mobile first). No SHURJ navigation, no sign-in
 * link, no app badge — a visitor arrived here for one venue, from a link
 * somebody sent them, and every element that is not about that venue is an
 * element competing with it. The one honest mention of the app is on the
 * booking confirmation, and only when `VITE_APP_URL` says there is one.
 */
export function PublicApp() {
  // This surface has its own entry point, so it does not inherit the console's
  // shell — it has to adopt the hook itself.
  useDocumentLocale();

  return (
    /*
      `data-surface="diner"` is the type scale, not the app. The tokens carry
      three scales chosen by reading distance — console at a desk, staff at two
      metres, diner at arm's length on a phone — and this page is read on a
      phone held at arm's length.
    */
    <div className="pub" data-surface="diner" id="top">
      {/*
        The bar stays at the top as the page scrolls, so the language switch is
        always one tap away: this page is where a tourist meets the product, and
        a switcher they cannot find costs the visit.
      */}
      <header className="pub-bar">
        <a className="pub-wordmark" href="#top">
          <Wordmark />
        </a>
        <LanguageSwitcher />
      </header>

      <Routes>
        {/*
          The manage link every reminder carries: `/booking/{token}`, with no
          venue in it — the page learns the branch from the answer. First, so
          it can never be read as a venue called "booking" with a branch named
          after a token (the backend reserves `booking` as a slug). It is a
          public-bundle path on purpose: `booking` is not in
          `RESERVED_FIRST_SEGMENTS`, which would hand it to the console.
        */}
        <Route path="/booking/:token" element={<ManageBookingRoute />} />
        <Route path="/:venueSlug" element={<VenueRoute />} />
        <Route path="/:venueSlug/:branchSlug" element={<BranchRoute />} />
        {/* The long form the confirmation showed before the short one: kept,
            because those links are already in people's chats. */}
        <Route path="/:venueSlug/:branchSlug/booking/:token" element={<ManageBookingRoute />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
