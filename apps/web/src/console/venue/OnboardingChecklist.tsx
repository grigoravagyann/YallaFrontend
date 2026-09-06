import { incompleteCount, isComplete, type AdminMenuCategory, type WeeklyHours } from '@yalla/api';
import {
  useAdminMenu,
  useEditorFloorPlan,
  useOpeningHours,
  useReservationPolicy,
} from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { Link } from 'react-router-dom';
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
 * What it is for is the one question nobody can answer today without opening
 * five screens: **is this venue ready?** Every row is a link to the screen that
 * finishes it.
 */
export function OnboardingChecklist() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId } = useVenueOutlet();

  const plan = useEditorFloorPlan(branchId ?? undefined);
  const menu = useAdminMenu(branchId ?? undefined);
  const hours = useOpeningHours(branchId ?? undefined);
  const policy = useReservationPolicy(branchId ?? undefined);

  const loading = plan.isLoading || menu.isLoading || hours.isLoading || policy.isLoading;
  const steps = checklistSteps({
    tables: plan.data?.tables.length ?? 0,
    unlabelled: (plan.data?.tables ?? []).filter((table) => !table.label.trim()).length,
    categories: menu.data ?? [],
    week: hours.data ?? [],
    hasPolicy: Boolean(policy.data),
  });

  const done = steps.filter((step) => step.done).length;

  return (
    <section className="checklist">
      <header>
        <h3>{t('checklist.title')}</h3>
        <p className="muted small">
          {loading ? t('loading') : t('checklist.progress', { done, total: steps.length })}
        </p>
      </header>

      <ul className="checklist-list">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? 'is-done' : ''}>
            <span className="checklist-mark" aria-hidden>
              {step.done ? '✓' : '·'}
            </span>
            <span className="checklist-label">
              {t(`checklist.step.${step.id}`)}
              {step.detail ? <span className="small muted"> · {step.detail}</span> : null}
            </span>
            {step.to ? (
              <Link className="link-button" to={step.to}>
                {step.done ? t('common:action.edit') : t('checklist.finish')}
              </Link>
            ) : (
              // Two steps have no screen in this build. Said rather than shown
              // as a dead link: a checklist row that goes nowhere is worse than
              // one that admits where the work happens.
              <span className="small muted">{t('checklist.elsewhere')}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ChecklistStep {
  readonly id: string;
  readonly done: boolean;
  readonly detail?: string | undefined;
  /** Null for a step this build has no screen for. */
  readonly to: string | null;
}

/**
 * The steps, as a pure function of what has been loaded.
 *
 * Every "done" is the same rule the screen behind it uses — `isComplete` for a
 * dish, an empty block list for a closed day — so the checklist cannot say a
 * venue is ready while the menu editor is still showing a to-do count.
 */
export function checklistSteps(input: {
  readonly tables: number;
  readonly unlabelled: number;
  readonly categories: readonly AdminMenuCategory[];
  readonly week: WeeklyHours;
  readonly hasPolicy: boolean;
}): readonly ChecklistStep[] {
  const items = input.categories.flatMap((category) => category.items);
  const incomplete = input.categories.reduce((sum, c) => sum + incompleteCount(c), 0);
  const openDays = input.week.filter((day) => day.blocks.length > 0).length;

  return [
    {
      id: 'floorPlan',
      done: input.tables > 0,
      detail: input.tables > 0 ? String(input.tables) : undefined,
      to: '/venue/floorplan',
    },
    {
      id: 'tableLabels',
      done: input.tables > 0 && input.unlabelled === 0,
      detail: input.unlabelled > 0 ? String(input.unlabelled) : undefined,
      to: '/venue/floorplan',
    },
    {
      id: 'menuCategories',
      done: input.categories.length > 0,
      detail: input.categories.length > 0 ? String(input.categories.length) : undefined,
      to: '/venue/menu',
    },
    {
      id: 'menuItems',
      // Both halves: a menu of two finished dishes is not a menu, and a menu of
      // eighty half-finished ones cannot have ordering switched on.
      done: items.length > 0 && incomplete === 0,
      detail: incomplete > 0 ? String(incomplete) : String(items.length),
      to: '/venue/menu',
    },
    {
      id: 'hours',
      done: openDays > 0,
      detail: openDays > 0 ? String(openDays) : undefined,
      to: '/venue/hours',
    },
    {
      id: 'policy',
      done: input.hasPolicy,
      to: '/venue/policy',
    },
    // Staff and devices are managed from screens this build does not have —
    // `/api/venues/{id}/staff` and the branch device list. Listed anyway,
    // because "is this venue ready" is false without them and a checklist that
    // omitted them would answer the question wrongly.
    { id: 'staff', done: false, to: null },
    { id: 'devices', done: false, to: null },
  ];
}

/** Whether every item on this menu is finished. Used by the checklist and the editor. */
export function menuIsComplete(categories: readonly AdminMenuCategory[]): boolean {
  const items = categories.flatMap((category) => category.items);
  return items.length > 0 && items.every(isComplete);
}
