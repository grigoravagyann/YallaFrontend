import {
  isComplete,
  type AdminMenuCategory,
  type BranchReadiness,
  type EditorFloorPlan,
} from '@yalla/api';
import { useBranchReadiness, useEditorFloorPlan } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { CheckIcon } from '../ui/icons';
import { useVenueOutlet } from './VenueLayout';

/**
 * What this branch still needs: the Main artboard's `setup` card, at the top
 * of Overview while anything is left, and gone once nothing is.
 *
 * **Two kinds of line.** The required ones — a table diners can book, opening
 * hours, staff, a tablet or staff phone — decide whether diners see the branch
 * at all: until every one is done it is hidden from the diner app and the
 * public page and takes no booking (the server's `takingGuests`). The card's
 * title says which side of that the branch is on. The rest is advice and hides
 * nothing.
 *
 * **A checklist, not a wizard.** Onboarding happens out of order, in a cafe,
 * interrupted — the floor plan gets drawn while the owner is on the phone, the
 * photos arrive two days later, and the hours are the last thing anybody
 * thinks of. A wizard would insist on a sequence nobody follows and would be
 * abandoned at step two. Each line opens the screen that finishes it.
 *
 * **The server's answer, rendered.** Every line comes from
 * `GET /api/branches/{id}/readiness` and nothing is worked out here. The
 * checklist used to derive its own answers from five screens' reads, and got
 * one of them wrong in the way that matters: "a reservation policy loads"
 * ticked the policy line for every branch, because every branch has a default
 * policy. The server counts it only once somebody has *saved* one, and each
 * save that feeds a line invalidates this read, so a line flips without a
 * reload.
 *
 * The online-bookings switch is a choice, not a gap, so it is not a line here:
 * Overview's "worth a look" says when it is off.
 */
export function OnboardingChecklist() {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  const { branchId } = useVenueOutlet();
  const readiness = useBranchReadiness(branchId ?? undefined);
  // The one line the server's answer cannot settle yet: it counts tables, and
  // a diner books from a room photo. Until the plan is read, the server's line.
  const plan = useEditorFloorPlan(branchId ?? undefined);
  const rooms = plan.data ? roomsReady(plan.data) : undefined;

  if (readiness.isError && !readiness.data) {
    return (
      <section className="yc-card yc-setup" aria-labelledby={titleId}>
        <h2 className="yc-h2" id={titleId}>
          {t('checklist.title')}
        </h2>
        <QueryFailureNotice error={readiness.error} onRetry={() => void readiness.refetch()} />
      </section>
    );
  }

  // Nothing until the answer is in: a card that appears and vanishes on a
  // finished branch would be a flash of "you are not done".
  const data = readiness.data;
  if (!data) return null;

  const steps = checklistSteps(data, rooms).filter((step) => !step.optional);
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const hidden = !data.takingGuests;
  const groups = [
    { key: 'required', steps: steps.filter((step) => step.required) },
    { key: 'recommended', steps: steps.filter((step) => !step.required) },
  ] as const;

  return (
    <section className="yc-card yc-setup" aria-labelledby={titleId}>
      <div className="yc-setup-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {hidden ? t('checklist.titleHidden') : t('checklist.title')}
          </h2>
          <p className="yc-cap">{hidden ? t('checklist.bodyHidden') : t('checklist.body')}</p>
        </div>
        <b className="yc-setup-n">{t('checklist.progress', { done, total: steps.length })}</b>
      </div>
      <div
        className="yc-prog"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        aria-label={t('checklist.progressLabel')}
      >
        <span style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
      </div>
      {groups.map((group) => (
        <div key={group.key} className="yc-setup-group">
          <h3 className="yc-setup-g">{t(`checklist.${group.key}`)}</h3>
          <StepList steps={group.steps} />
        </div>
      ))}
    </section>
  );
}

function StepList({ steps }: { readonly steps: readonly ChecklistStep[] }) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <ul className="yc-sgrid">
      {steps.map((step) => (
        <li key={step.id} className={step.done ? 'is-done' : 'is-todo'} data-step={step.id}>
          <Link to={step.to}>
            {step.done ? (
              <span className="yc-sck is-done" aria-label={t('checklist.done')}>
                <CheckIcon />
              </span>
            ) : (
              <span className="yc-sck is-todo" aria-label={t('checklist.todo')} />
            )}
            <span className="yc-sgrid-t">{t(step.labelKey)}</span>
            {/* The server's count with the line: tables, dishes left, staff. */}
            {step.detail ? <span className="yc-sgrid-v">{step.detail}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
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
  /** Without it diners do not see the branch (the server's `missingForGuests`). */
  readonly required: boolean;
}

/**
 * The steps, as a pure function of the server's readiness answer.
 *
 * Nothing here decides "done": each line is the server's boolean, and the
 * numbers beside a line are the counts the server reported with it.
 */
export function checklistSteps(
  readiness: BranchReadiness,
  rooms?: boolean,
): readonly ChecklistStep[] {
  const count = (value: number) => (value > 0 ? String(value) : undefined);

  return [
    {
      id: 'floorPlan',
      labelKey: 'checklist.step.floorPlan',
      // A table a diner can book, on a room photo: tables alone do not count.
      done: readiness.bookableTableCount > 0 && rooms !== false,
      detail: count(readiness.tableCount),
      to: '/venue/floorplan',
      optional: false,
      required: true,
    },
    {
      id: 'tableLabels',
      labelKey: 'checklist.step.tableLabels',
      done: readiness.tablesLabelled,
      to: '/venue/floorplan',
      optional: false,
      required: false,
    },
    {
      id: 'menuCategories',
      labelKey: 'checklist.step.menuCategories',
      done: readiness.menuCategoriesPresent,
      detail: count(readiness.menuCategoryCount),
      to: '/venue/menu',
      optional: false,
      required: false,
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
      required: false,
    },
    {
      id: 'hours',
      labelKey: 'checklist.step.hours',
      done: readiness.openingHoursSet,
      detail: count(readiness.openingHoursDayCount),
      to: '/venue/hours',
      optional: false,
      required: true,
    },
    {
      id: 'policy',
      labelKey: 'checklist.step.policy',
      done: readiness.reservationPolicyReviewed,
      to: '/venue/policy',
      optional: false,
      required: false,
    },
    {
      id: 'staff',
      labelKey: 'checklist.step.staff',
      done: readiness.staffEnrolled,
      detail: count(readiness.staffCount),
      to: '/venue/staff',
      optional: false,
      required: true,
    },
    {
      id: 'devices',
      labelKey: 'checklist.step.devices',
      done: readiness.deviceEnrolled,
      detail: count(readiness.deviceCount),
      to: '/venue/staff',
      optional: false,
      required: true,
    },
    {
      id: 'acceptsWebBookings',
      labelKey: 'onboarding.steps.acceptsWebBookings',
      done: readiness.acceptsWebBookings,
      to: '/venue/public',
      optional: true,
      required: false,
    },
  ];
}

/** Whether every item on this menu is finished. Used by the menu editor. */
export function menuIsComplete(categories: readonly AdminMenuCategory[]): boolean {
  const items = categories.flatMap((category) => category.items);
  return items.length > 0 && items.every(isComplete);
}

/**
 * Whether a diner can book anything from the rooms: some room has a photo
 * with a bookable table in service pinned on it. Tables on no photo are not
 * offered to diners at all.
 */
export function roomsReady(plan: EditorFloorPlan): boolean {
  const photos = new Set(plan.areas.flatMap((area) => area.photos.map((photo) => photo.photoId)));
  return plan.tables.some(
    (table) =>
      table.isActive && table.isBookable && table.pin !== null && photos.has(table.pin.photoId),
  );
}
