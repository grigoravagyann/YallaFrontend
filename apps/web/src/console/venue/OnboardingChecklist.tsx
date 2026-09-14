import { isComplete, type AdminMenuCategory, type BranchReadiness } from '@yalla/api';
import { useBranchReadiness } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { Link } from 'react-router-dom';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { useVenueOutlet } from './VenueLayout';

/**
 * What this branch still needs before it can take diners.
 *
 * **A checklist, not a wizard.** Onboarding happens out of order, in a cafe,
 * interrupted — the floor plan gets drawn while the owner is on the phone, the
 * photos arrive two days later, and the hours are the last thing anybody
 * thinks of. A wizard would insist on a sequence nobody follows and would be
 * abandoned at step two.
 *
 * **The server's answer, rendered.** Every line comes from
 * `GET /api/branches/{id}/readiness` and nothing is worked out here. The
 * checklist used to derive its own answers from five screens' reads, and got
 * one of them wrong in the way that matters: "a reservation policy loads"
 * ticked the policy line for every branch, because every branch has a default
 * policy. The server counts it only once somebody has *saved* one, and each
 * save that feeds a line invalidates this read, so a line flips without a
 * reload.
 */
export function OnboardingChecklist() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId } = useVenueOutlet();
  const readiness = useBranchReadiness(branchId ?? undefined);

  if (readiness.isError && !readiness.data) {
    return (
      <section className="checklist">
        <header>
          <h3>{t('checklist.title')}</h3>
        </header>
        <QueryFailureNotice error={readiness.error} onRetry={() => void readiness.refetch()} />
      </section>
    );
  }

  const data = readiness.data;
  const steps = data ? checklistSteps(data) : [];
  const required = steps.filter((step) => !step.optional);
  const done = required.filter((step) => step.done).length;
  const blockers = data ? readinessBlockers(data) : [];

  return (
    <section className="checklist">
      <header>
        <h3>{t('checklist.title')}</h3>
        <p className="muted small">
          {data ? t('checklist.progress', { done, total: required.length }) : t('loading')}
        </p>
      </header>

      {data ? (
        <>
          <ul className="checklist-list">
            {steps.map((step) => (
              <li key={step.id} className={step.done ? 'is-done' : ''} data-step={step.id}>
                <span className="checklist-mark" aria-hidden>
                  {step.done ? '✓' : '·'}
                </span>
                <span className="checklist-label">
                  {t(step.labelKey)}
                  {step.detail ? <span className="small muted"> · {step.detail}</span> : null}
                  {step.optional ? (
                    <span className="small muted">
                      {' '}
                      · {t('onboarding.steps.acceptsWebBookingsOptional')}
                    </span>
                  ) : null}
                </span>
                <Link className="link-button" to={step.to}>
                  {step.done ? t('common:action.edit') : t('checklist.finish')}
                </Link>
              </li>
            ))}
          </ul>

          <div className="checklist-blockers">
            <h4>{t('onboarding.blockers.title')}</h4>
            {blockers.length === 0 ? (
              <p className="muted small">{t('onboarding.blockers.ready')}</p>
            ) : (
              <ul className="small">
                {blockers.map((blocker) => (
                  <li key={blocker.key}>
                    {blocker.count !== undefined
                      ? t(`onboarding.blockers.${blocker.key}`, { count: blocker.count })
                      : t(`onboarding.blockers.${blocker.key}`)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

export interface ChecklistStep {
  readonly id: string;
  /** Key in the `admin` namespace. */
  readonly labelKey: string;
  readonly done: boolean;
  readonly detail?: string | undefined;
  /** The screen that finishes it. */
  readonly to: string;
  /** Reported, not counted toward "ready" — the booking switch is a choice, not a gap. */
  readonly optional: boolean;
}

/**
 * The steps, as a pure function of the server's readiness answer.
 *
 * Nothing here decides "done": each line is the server's boolean, and the
 * numbers beside a line are the counts the server reported with it.
 */
export function checklistSteps(readiness: BranchReadiness): readonly ChecklistStep[] {
  const count = (value: number) => (value > 0 ? String(value) : undefined);

  return [
    {
      id: 'floorPlan',
      labelKey: 'checklist.step.floorPlan',
      done: readiness.floorPlanDrawn,
      detail: count(readiness.tableCount),
      to: '/venue/floorplan',
      optional: false,
    },
    {
      id: 'tableLabels',
      labelKey: 'checklist.step.tableLabels',
      done: readiness.tablesLabelled,
      to: '/venue/floorplan',
      optional: false,
    },
    {
      id: 'menuCategories',
      labelKey: 'checklist.step.menuCategories',
      done: readiness.menuCategoriesPresent,
      detail: count(readiness.menuCategoryCount),
      to: '/venue/menu',
      optional: false,
    },
    {
      id: 'menuItems',
      labelKey: 'checklist.step.menuItems',
      done: readiness.menuComplete,
      // The to-do count while dishes are unfinished, the dish count once none are.
      detail:
        readiness.incompleteMenuItemCount > 0
          ? String(readiness.incompleteMenuItemCount)
          : count(readiness.menuItemCount),
      to: '/venue/menu',
      optional: false,
    },
    {
      id: 'hours',
      labelKey: 'checklist.step.hours',
      done: readiness.openingHoursSet,
      detail: count(readiness.openingHoursDayCount),
      to: '/venue/hours',
      optional: false,
    },
    {
      id: 'policy',
      labelKey: 'checklist.step.policy',
      done: readiness.reservationPolicyReviewed,
      to: '/venue/policy',
      optional: false,
    },
    {
      id: 'staff',
      labelKey: 'checklist.step.staff',
      done: readiness.staffEnrolled,
      detail: count(readiness.staffCount),
      to: '/venue/staff',
      optional: false,
    },
    {
      id: 'devices',
      labelKey: 'checklist.step.devices',
      done: readiness.deviceEnrolled,
      detail: count(readiness.deviceCount),
      to: '/venue/staff',
      optional: false,
    },
    {
      id: 'acceptsWebBookings',
      labelKey: 'onboarding.steps.acceptsWebBookings',
      done: readiness.acceptsWebBookings,
      to: '/venue/public',
      optional: true,
    },
  ];
}

export interface ReadinessBlocker {
  /** Under `onboarding.blockers`. */
  readonly key: string;
  readonly count?: number | undefined;
}

/**
 * What stops diners, in the console's own words.
 *
 * The server's `blockers` are English sentences meant for logs; a screen that
 * printed them would show English to an Armenian owner. The same lines are
 * rebuilt here from the booleans, one sentence per gap, in the server's order.
 */
export function readinessBlockers(readiness: BranchReadiness): readonly ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  if (!readiness.floorPlanDrawn) blockers.push({ key: 'floorPlanEmpty' });
  else if (!readiness.tablesLabelled) blockers.push({ key: 'tablesUnlabelled' });
  if (!readiness.menuCategoriesPresent) blockers.push({ key: 'menuNoCategories' });
  else if (readiness.menuItemCount === 0) blockers.push({ key: 'menuNoItems' });
  else if (readiness.incompleteMenuItemCount > 0) {
    blockers.push({ key: 'menuIncomplete', count: readiness.incompleteMenuItemCount });
  }
  if (!readiness.openingHoursSet) blockers.push({ key: 'hoursNotSet' });
  if (!readiness.reservationPolicyReviewed) blockers.push({ key: 'policyNotReviewed' });
  if (!readiness.staffEnrolled) blockers.push({ key: 'noStaff' });
  if (!readiness.deviceEnrolled) blockers.push({ key: 'noDevice' });
  return blockers;
}

/** Whether every item on this menu is finished. Used by the menu editor. */
export function menuIsComplete(categories: readonly AdminMenuCategory[]): boolean {
  const items = categories.flatMap((category) => category.items);
  return items.length > 0 && items.every(isComplete);
}
