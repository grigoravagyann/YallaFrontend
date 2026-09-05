import type { ConsoleUser } from '@yalla/api';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { onSignedOut } from './auth/authSession';
import { Forbidden, LoadingScreen, RequireRole } from './auth/RequireRole';
import { SignInRoute } from './auth/SignInRoute';
import {
  FLOOR_ROLES,
  PLATFORM_ROLES,
  VENUE_ROLES,
  landingPathFor,
  useCurrentUser,
} from './auth/useCurrentUser';
import { QueryFailureNotice } from './components/QueryFailureNotice';
import { ConsoleLayout } from './console/ConsoleLayout';
import { CreateVenueRoute } from './console/platform/CreateVenueRoute';
import { VenueDetailRoute } from './console/platform/VenueDetailRoute';
import { VenuesRoute } from './console/platform/VenuesRoute';
import { VenueLayout } from './console/venue/VenueLayout';
import { VenuePlaceholder } from './console/venue/VenuePlaceholder';
import { usingMockData } from './data/gateway';
import { DevFloorPlanRoute } from './routes/DevFloorPlanRoute';
import { DevTokensRoute } from './routes/DevTokensRoute';
import { FloorRoute } from './staff/FloorRoute';

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
export function App() {
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

      {/* The staff floor screen is outside the console shell on purpose: a
          sidebar is wasted width on a tablet, and a waiter needs no navigation
          at all — the floor is the whole app. */}
      {FLOOR_ROLES.includes(role) ? (
        <Route
          path="/staff"
          element={
            <RequireRole allow={FLOOR_ROLES}>
              <FloorRoute user={user} />
            </RequireRole>
          }
        />
      ) : null}

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
            <Route index element={<Navigate to="/venue/floorplan" replace />} />
            <Route
              path="floorplan"
              element={<VenuePlaceholder titleKey="nav.floorplan" prompt="Prompt 7" />}
            />
            <Route
              path="menu"
              element={<VenuePlaceholder titleKey="nav.menu" prompt="Prompt 8" />}
            />
            <Route
              path="hours"
              element={<VenuePlaceholder titleKey="nav.hours" prompt="Prompt 9" />}
            />
            <Route
              path="policy"
              element={<VenuePlaceholder titleKey="nav.policy" prompt="Prompt 9" />}
            />
            <Route
              path="staff"
              element={<VenuePlaceholder titleKey="nav.staff" prompt="Prompt 10" />}
            />
            <Route
              path="reports"
              element={<VenuePlaceholder titleKey="nav.reports" prompt="Prompt 11" />}
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
