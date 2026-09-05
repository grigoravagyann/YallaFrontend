import type { ConsoleUser } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { FloorPlan, Legend } from '@yalla/floorplan';
import { useTranslation } from '@yalla/i18n';
import { QueryFailureNotice } from '../components/QueryFailureNotice';
import { useFloorPlan } from '../data/queries';
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
 * - Touch targets are `--touch-staff`, well past the web default.
 * - Offline is a state the header shows, never an error the floor shows. The
 *   last floor loaded stays on screen; the indicator says it may be stale.
 *
 * The branch comes from the token's scope, never from a route parameter. A
 * waiter has exactly one branch and no way to name another.
 */
export function FloorRoute({ user }: FloorRouteProps) {
  const { t } = useTranslation(['staff', 'admin', 'common']);
  const [planRef, size] = useElementSize<HTMLDivElement>();

  const branchId = user.scope.branchIds[0];
  const floor = useFloorPlan(branchId);
  const offline = isOfflinePaused(floor);
  const state = useConnectionState({ lastError: floor.error, offline });

  // The floor answers with its own branch name. A waiter's token cannot read
  // the venue catalogue — that is the platform tier — so asking for the venue
  // here would 403 and leave the header blank on the one screen that has to
  // say where it is.
  const branchName = floor.data?.branchName;

  return (
    // `data-surface` switches every font-size and line-height variable to the
    // staff scale. One attribute, and the whole screen is sized for a counter.
    <div className="floor" data-surface="staff">
      <StaffHeader
        title={t('floor.title')}
        subtitle={branchName ?? (branchId ? t('admin:loading') : t('floor.noBranch'))}
        state={state}
        onRefresh={() => void floor.refetch()}
      />

      <div className="floor-body">
        <section className="floor-plan-pane">
          <Legend mode="staff" translate={(key) => t(`common:${key}`)} />

          <div ref={planRef} className="floor-plan-frame">
            {!branchId ? (
              <p className="floor-note">{t('floor.noBranch')}</p>
            ) : floor.data ? (
              /* Staff mode: every table is tappable and nothing is dimmed. A
                 waiter acts on occupied and out-of-service tables constantly —
                 those are the ones that need attention. */
              <FloorPlan
                plan={floor.data}
                mode="staff"
                viewport={size}
                accessibilityLabel={t('floor.title')}
              />
            ) : offline ? (
              /* Nothing cached and no network: say so. A spinner here would
                 never resolve, which is the one thing a counter screen must
                 not do. */
              <div className="floor-note">
                <QueryFailureNotice offline onRetry={() => void floor.refetch()} />
              </div>
            ) : floor.isLoading ? (
              <p className="floor-note">{t('floor.loading')}</p>
            ) : (
              <div className="floor-note">
                <QueryFailureNotice error={floor.error} onRetry={() => void floor.refetch()} />
              </div>
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
