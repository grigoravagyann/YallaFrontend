import type { ConsoleUser } from '@yalla/api';
import { FloorPlan, Legend } from '@yalla/floorplan';
import { useTranslation } from '@yalla/i18n';
import { useConsoleVenue, useFloorPlan } from '../data/queries';
import { useElementSize } from '../useElementSize';
import { StaffHeader } from './StaffHeader';
import { useConnectionState } from './useConnectionState';

export interface FloorRouteProps {
  readonly user: ConsoleUser;
}

/**
 * The floor screen — an installed PWA on a tablet on a counter, used standing
 * up, by someone with ten minutes of training.
 *
 * The design constraints are encoded here rather than left for a later pass,
 * because retrofitting them is much harder than starting with them:
 *
 * - Landscape-first, but the layout is a plain flex row that wraps, so portrait
 *   stacks the panel under the floor instead of breaking.
 * - Every action is one tap from the floor. There are no nested menus, and
 *   there will not be: a waiter carrying two plates cannot open a submenu.
 * - Touch targets are `--touch-staff` (64px), well past the web default.
 * - High contrast, large type, readable at arm's length on a counter.
 *
 * The branch comes from the token's scope, never from a route parameter. A
 * waiter has exactly one branch and no way to name another.
 */
export function FloorRoute({ user }: FloorRouteProps) {
  const { t } = useTranslation(['staff', 'admin', 'common']);
  const [planRef, size] = useElementSize<HTMLDivElement>();

  const branchId = user.scope.branchIds[0];
  const { data: venue } = useConsoleVenue(user.scope.venueId ?? undefined);
  const floor = useFloorPlan(branchId);

  const branch = venue?.branches.find((candidate) => candidate.id === branchId);
  const state = useConnectionState();

  return (
    <div className="floor">
      <StaffHeader
        title={t('floor.title')}
        subtitle={
          venue && branch
            ? t('floor.branch', { venue: venue.name, branch: branch.name })
            : t('admin:loading')
        }
        state={state}
        onRefresh={() => void floor.refetch()}
      />

      <div className="floor-body">
        <section className="floor-plan-pane">
          <Legend mode="staff" translate={(key) => t(`common:${key}`)} />

          <div ref={planRef} className="floor-plan-frame">
            {floor.isLoading ? (
              <p className="floor-note">{t('floor.loading')}</p>
            ) : floor.isError || !floor.data ? (
              <div className="floor-note">
                <p>{t('floor.error')}</p>
                <button type="button" className="floor-button" onClick={() => void floor.refetch()}>
                  {t('floor.retry')}
                </button>
              </div>
            ) : (
              /* Staff mode: every table is tappable and nothing is dimmed. A
                 waiter acts on occupied and out-of-service tables constantly —
                 those are the ones that need attention. */
              <FloorPlan
                plan={floor.data}
                mode="staff"
                viewport={size}
                accessibilityLabel={t('floor.title')}
              />
            )}
          </div>
        </section>

        {/* TODO(prompt-7): the incoming order queue and the pending-seat list.
            Both are lists of things a waiter acts on with one tap from here —
            no drill-down, no modal stack. The frame is fixed now so the layout
            does not move under people once it fills. */}
        <aside className="floor-panel" aria-label={t('panel.orders.title')}>
          <section className="floor-panel-block">
            <h2>{t('panel.orders.title')}</h2>
            <p className="floor-todo">{t('panel.orders.todo')}</p>
          </section>

          <section className="floor-panel-block">
            <h2>{t('panel.seating.title')}</h2>
            <p className="floor-todo">{t('panel.seating.todo')}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
