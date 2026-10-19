import { useTranslation } from '@yalla/i18n';
import { Route, Routes } from 'react-router-dom';
import { BranchRoute } from './BranchRoute';
import { LanguageSwitcher } from './language';
import { ManageBookingRoute } from './ManageBookingRoute';
import { NotFoundPage } from './PageStates';
import { useDocumentLocale } from '../useDocumentLocale';
import { VenueRoute } from './VenueRoute';

/**
 * The public route group.
 *
 * Three routes and a catch-all, all unauthenticated, under one top bar: the
 * wordmark and the language switch, and nothing else (public-page HANDOFF:
 * own top bar, no sidebar, mobile first). No Yalla navigation, no sign-in
 * link, no app badge — a visitor arrived here for one venue, from a link
 * somebody sent them, and every element that is not about that venue is an
 * element competing with it. The one honest mention of the app is on the
 * booking confirmation, and only when `VITE_APP_URL` says there is one.
 */
export function PublicApp() {
  const { t } = useTranslation('public');
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
          {t('appName', { ns: 'common' })}
        </a>
        <LanguageSwitcher />
      </header>

      <Routes>
        <Route path="/:venueSlug" element={<VenueRoute />} />
        <Route path="/:venueSlug/:branchSlug" element={<BranchRoute />} />
        {/* Nested under the branch so no top-level word has to be reserved
            away from venue slugs. See `publicRoutes.ts`. */}
        <Route path="/:venueSlug/:branchSlug/booking/:token" element={<ManageBookingRoute />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
