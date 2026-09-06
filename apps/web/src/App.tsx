import type { ConsoleUser } from '@yalla/api';
import { useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { onSignedOut } from './auth/authSession';
import { Forbidden, LoadingScreen, RequireRole } from './auth/RequireRole';
import { SignInRoute } from './auth/SignInRoute';
import { PLATFORM_ROLES, VENUE_ROLES, landingPathFor, useCurrentUser } from './auth/useCurrentUser';
import { QueryFailureNotice } from './components/QueryFailureNotice';
import { ConsoleLayout } from './console/ConsoleLayout';
import { CreateVenueRoute } from './console/platform/CreateVenueRoute';
import { VenueDetailRoute } from './console/platform/VenueDetailRoute';
import { VenuesRoute } from './console/platform/VenuesRoute';
import { VenueLayout } from './console/venue/VenueLayout';
import { FloorPlanEditorScreen } from './console/venue/floorplan/FloorPlanEditorScreen';
import { MenuEditorScreen } from './console/venue/menu/MenuEditorScreen';
import { OpeningHoursScreen } from './console/venue/hours/OpeningHoursScreen';
import { ReservationPolicyScreen } from './console/venue/policy/ReservationPolicyScreen';
import { VenueOverviewScreen } from './console/venue/VenueOverviewScreen';
import { VenuePlaceholder } from './console/venue/VenuePlaceholder';

/**
 * Behind `lazy()` because it is the only screen in the console that needs a
 * charting library, and Recharts is not small. Everything else in the venue
 * section loads with the shell; this arrives when somebody asks for it.
 */
const ReportsScreen = lazy(() =>
  import('./console/venue/reports/ReportsScreen').then((module) => ({
    default: module.ReportsScreen,
  })),
);
import { usingMockData } from './data/gateway';
import { DevFloorPlanRoute } from './routes/DevFloorPlanRoute';
import { DevTokensRoute } from './routes/DevTokensRoute';
import { StaffRoute } from './staff/StaffRoute';

/**
 * The router, built from the role.
 *
 * This is the substance of the permission model, not a convenience: a route a
 * role cannot use is **not registered**. A waiter's route tree contains no
 * `/platform/venues` element to hide, so there is nothing to reveal by editing
 * CSS, replaying a bundle, or typing a URL — the path simply falls through to
 * the catch-all.
 *
 * Two supporting rules:
 *
 * - Scope is never a route parameter the user supplies. `/venue/*` and
 *   `/staff` read their venue and branch from the token; only the platform
 *   section takes a `:venueId`, and only because a platform admin's scope
 *   genuinely is every venue.
 * - The catch-all renders a plain refusal, never a redirect. Redirecting
 *   "somewhere you can go" is how you build a loop, and telling someone whether
 *   a path exists tells them which venue ids are real.
 */
/**
 * Two apps behind one origin.
 *
 * `/staff` is matched first and never reaches the console's session at all.
 * That is a routing decision with a product reason behind it: the counter
 * screen has its own credential — a device token and a PIN — and a waiter must
 * never be shown an email field. Leaving `/staff` inside the console's router
 * meant a tablet with no venue-user session was redirected to a password form,
 * which is both useless to a waiter and the shortest path to a shared owner
 * account living on a counter.
 */
export function App() {
  return (
    <Routes>
      <Route path="/staff/*" element={<StaffRoute />} />
      <Route path="*" element={<ConsoleApp />} />
    </Routes>
  );
}

function ConsoleApp() {
  const { user, isLoading, failure, isError } = useCurrentUser();
  const location = useLocation();
  useSignedOutRedirect();

  // No session against a real backend: the whole app is the sign-in form,
  // with where the person was carried along so they land back on it.
  if (!usingMockData && failure === 'unauthorized') {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignInRoute />} />
        <Route
          path="*"
          element={
            <Navigate
              to="/sign-in"
              replace
              state={{ returnTo: `${location.pathname}${location.search}` }}
            />
          }
        />
      </Routes>
    );
  }

  if (isLoading) return <LoadingScreen />;
  if (isError && !user) return <StartupFailure />;
  if (!user) return <Forbidden />;

  return <AppRoutes user={user} />;
}

/** The identity could not be read at all — offline, or the server is down. */
function StartupFailure() {
  const queryClient = useQueryClient();
  const { failure } = useCurrentUser();
  return (
    <section className="page page-narrow">
      <QueryFailureNotice
        error={{ kind: failure }}
        onRetry={() => void queryClient.resetQueries({ queryKey: ['currentUser'] })}
      />
    </section>
  );
}

/**
 * A rejected refresh, or an explicit sign-out, sends the person to sign-in
 * with where they were preserved. The session broadcasts; the router listens.
 */
function useSignedOutRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      onSignedOut((reason) => {
        queryClient.removeQueries({ queryKey: ['currentUser'] });
        navigate('/sign-in', {
          replace: true,
          state: {
            returnTo:
              location.pathname === '/sign-in' ? '/' : `${location.pathname}${location.search}`,
            reason,
          },
        });
      }),
    [navigate, location.pathname, location.search, queryClient],
  );
}

function AppRoutes({ user }: { user: ConsoleUser }) {
  const { role } = user;
  const home = landingPathFor(role);

  return (
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      {/* Already signed in: the form has nothing to do. */}
      <Route path="/sign-in" element={<Navigate to={home} replace />} />

      <Route element={<ConsoleLayout user={user} />}>
        {PLATFORM_ROLES.includes(role) ? (
          <>
            <Route path="/platform" element={<Navigate to="/platform/venues" replace />} />
            <Route
              path="/platform/venues"
              element={
                <RequireRole allow={PLATFORM_ROLES}>
                  <VenuesRoute />
                </RequireRole>
              }
            />
            {/* Before `:venueId`, or "new" would be read as an id. */}
            <Route
              path="/platform/venues/new"
              element={
                <RequireRole allow={PLATFORM_ROLES}>
                  <CreateVenueRoute />
                </RequireRole>
              }
            />
            <Route
              path="/platform/venues/:venueId"
              element={
                <RequireRole allow={PLATFORM_ROLES}>
                  <VenueDetailRoute />
                </RequireRole>
              }
            />
          </>
        ) : null}

        {VENUE_ROLES.includes(role) ? (
          <Route path="/venue" element={<VenueLayout user={user} />}>
            {/* The overview carries the onboarding checklist, which is the
                one screen that answers "is this venue ready" — so it is what
                the venue section opens on rather than the floor plan. */}
            <Route index element={<VenueOverviewScreen />} />
            <Route path="floorplan" element={<FloorPlanEditorScreen />} />
            <Route path="menu" element={<MenuEditorScreen />} />
            <Route path="hours" element={<OpeningHoursScreen />} />
            <Route path="policy" element={<ReservationPolicyScreen />} />
            <Route
              path="staff"
              element={<VenuePlaceholder titleKey="nav.staff" prompt="Prompt 10" />}
            />
            {/* Lazy: the reports screen is the only thing in the console
                that needs a charting library, and an owner who opens the floor
                plan should not download one. */}
            <Route
              path="reports"
              element={
                <Suspense fallback={<div className="report-skeleton" aria-hidden="true" />}>
                  <ReportsScreen />
                </Suspense>
              }
            />
          </Route>
        ) : null}

        {/* Development harness, not a product screen, and not in any sidebar.
            It stays because the floor plan editor and venue onboarding both
            need a way to look at a room in isolation. */}
        {import.meta.env.DEV ? (
          <>
            <Route path="/dev/floorplan" element={<DevFloorPlanRoute />} />
            <Route path="/dev/tokens" element={<DevTokensRoute />} />
          </>
        ) : null}
      </Route>

      <Route path="*" element={<Forbidden />} />
    </Routes>
  );
}
