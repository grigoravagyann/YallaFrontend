import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { DevFloorPlanRoute } from './routes/DevFloorPlanRoute';
import { FloorPlanRoute } from './routes/FloorPlanRoute';
import { PlaceholderScreen } from './routes/PlaceholderScreen';

/**
 * Placeholder routes only. Each screen is filled in by a later task; the shape
 * of the navigation is fixed now because the sidebar and the i18n keys depend
 * on it.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/floorplan" replace /> },
      { path: 'floorplan', element: <FloorPlanRoute /> },
      { path: 'menu', element: <PlaceholderScreen titleKey="nav.menu" /> },
      { path: 'hours', element: <PlaceholderScreen titleKey="nav.hours" /> },
      { path: 'staff', element: <PlaceholderScreen titleKey="nav.staff" /> },
      { path: 'reports', element: <PlaceholderScreen titleKey="nav.reports" /> },
      // Development harness, not a product screen. Not in the sidebar.
      { path: 'dev/floorplan', element: <DevFloorPlanRoute /> },
    ],
  },
]);

/** Sidebar entries, in order. `labelKey` resolves against the `admin` namespace. */
export const navItems = [
  { to: '/floorplan', labelKey: 'nav.floorplan' },
  { to: '/menu', labelKey: 'nav.menu' },
  { to: '/hours', labelKey: 'nav.hours' },
  { to: '/staff', labelKey: 'nav.staff' },
  { to: '/reports', labelKey: 'nav.reports' },
] as const;
