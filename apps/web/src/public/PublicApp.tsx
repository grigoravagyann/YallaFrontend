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
 * Three routes and a catch-all, all unauthenticated. There is deliberately no
 * layout chrome beyond the language bar: no Yalla navigation, no sign-in link,
 * no app banner. A visitor arrived here for one venue, from a link somebody
 * sent them, and every element that is not about that venue is an element
 * competing with the free-table count.
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
      phone held at arm's length. Using the console scale here would set body
      text at 15px for the one surface most likely to be read outdoors.
    */
    <div className="pub" data-surface="diner">
      {/*
        The language bar sits above everything, in the page's own flow rather
        than in a footer or behind a globe icon. This page is where a tourist
        meets the product, and a switcher they cannot find costs the visit.
      */}
      <header className="pub-top">
        <span className="pub-wordmark">{t('appName', { ns: 'common' })}</span>
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
