import {
  canIssueSignIn,
  isAdminRole,
  type ConsoleVenueDetail,
  type StaffMember,
  type StaffSignInLink,
} from '@yalla/api';
import { useStaff } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { initialsOf } from '../../ui/ConsoleShell';
import { PlusIcon } from '../../ui/icons';
import { OnceLinkDialog } from '../../ui/OnceLinkDialog';
import { useToast } from '../../ui/toast';
import { AddStaffWizard, type Hired } from '../../venue/staff/AddStaffWizard';
import { IssueSignInDialog } from '../../venue/staff/IssueSignInDialog';
import { DataTable } from '../../kit';

/** Every venue in the pilot is in Yerevan. */
const CONSOLE_TIME_ZONE = 'Asia/Yerevan';

/** The platform admin, as the staff rules see them: above every venue role. */
const PLATFORM_ACTOR = { id: 'platform', role: 'platformAdmin' as const };

type Shown =
  | { readonly kind: 'wizard' }
  | {
      readonly kind: 'issue';
      readonly member: Pick<StaffMember, 'id' | 'fullName' | 'email' | 'hasPasswordSignIn'>;
      readonly email: string;
      readonly failure: string | null;
      readonly returnTo: string;
    }
  | {
      readonly kind: 'once';
      readonly name: string;
      readonly pin: string | null;
      readonly link: StaffSignInLink | null;
      readonly failure: string | null;
      readonly retry: { readonly member: StaffMember; readonly email: string } | null;
      readonly returnTo: string;
    };

type Status = 'active' | 'awaiting' | 'noSignIn' | 'inactive' | 'pinLocked';

/** One badge per person, the most actionable first. */
function statusOf(member: StaffMember): Status {
  if (!member.isActive) return 'inactive';
  if (isAdminRole(member.role) && !member.email) return 'noSignIn';
  if (isAdminRole(member.role) && !member.hasPasswordSignIn) return 'awaiting';
  if (member.isPinLocked) return 'pinLocked';
  return 'active';
}

const PILL: Readonly<Record<Status, string>> = {
  active: 'yc-pill yc-pill-green',
  awaiting: 'yc-pill yc-pill-amber',
  noSignIn: 'yc-pill yc-pill-grey',
  inactive: 'yc-pill yc-pill-grey',
  pinLocked: 'yc-pill yc-pill-amber',
};

export interface StaffPanelProps {
  readonly venue: ConsoleVenueDetail;
  /** False on a deleted venue: nothing to add or issue. */
  readonly canChange: boolean;
}

/**
 * The venue page's Staff tab (VenueDetail artboard): who works here, their
 * role, branch and sign-in state, the four-step wizard to add somebody, and a
 * console sign-in for an owner or a manager, shown once.
 *
 * This is the venue bootstrap path. A new venue has nobody in it, and the
 * only actor above an owner is the platform admin, so the first owner is made
 * here, and here is the only place an owner's sign-in can be issued or
 * repaired. The rules are the venue staff screen's (`@yalla/api`'s
 * `canIssueSignIn`, `isAdminRole`).
 */
export function StaffPanel({ venue, canChange }: StaffPanelProps) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const staff = useStaff(venue.id);
  const [branch, setBranch] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const listId = useId();

  const branchName = (id: string | null) =>
    id === null
      ? t('venuePage.staff.venueWide')
      : (venue.branches.find((candidate) => candidate.id === id)?.name ?? '—');

  const statusLabel = (status: Status) =>
    status === 'active'
      ? t('venuePage.staff.active')
      : status === 'awaiting'
        ? t('venuePage.staff.awaiting')
        : status === 'noSignIn'
          ? t('venuePage.staff.noSignIn')
          : status === 'inactive'
            ? t('venuePage.staff.inactive')
            : t('venuePage.staff.pinLocked');

  const people = (staff.data ?? []).filter(
    (member) =>
      (showInactive || member.isActive) &&
      (branch === 'all' || member.branchId === null || member.branchId === branch),
  );

  const focusOf = (selector: string) => () => document.querySelector<HTMLElement>(selector);

  function afterHire(hired: Hired) {
    setShown({
      kind: 'once',
      name: hired.member.fullName,
      pin: hired.pin,
      link: hired.link,
      failure: hired.linkFailure?.text ?? null,
      retry: hired.linkFailure ? { member: hired.member, email: hired.linkFailure.email } : null,
      returnTo: '[data-addst]',
    });
  }

  return (
    <div className="yc-panel-body">
      <div className="yc-tools yc-tools-split">
        <div className="yc-tools">
          <div className="yc-fld">
            <label htmlFor="st-branch">{t('venuePage.staff.branch')}</label>
            <select
              id="st-branch"
              className="yc-ctl"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            >
              <option value="all">{t('venuePage.staff.allBranches')}</option>
              {venue.branches.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
          <label className="yc-check-line">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            {t('venuePage.staff.showInactive')}
          </label>
        </div>
        {canChange ? (
          <button
            type="button"
            className="yc-btn yc-btn-pri"
            data-addst=""
            onClick={() => setShown({ kind: 'wizard' })}
          >
            <PlusIcon />
            {t('venuePage.staff.add')}
          </button>
        ) : null}
      </div>

      <section className="yc-card" aria-labelledby={listId}>
        <h2 className="yc-sr" id={listId}>
          {t('venuePage.staff.list')}
        </h2>
        {staff.isLoading ? (
          <p className="yc-empty-line" role="status">
            {t('loading')}
          </p>
        ) : staff.isError ? (
          <p className="yc-alert" role="alert">
            {t('venuePage.staff.failed')}
          </p>
        ) : people.length === 0 ? (
          <p className="yc-empty-line">
            {(staff.data ?? []).length === 0
              ? t('venuePage.staff.empty')
              : t('venuePage.staff.emptyFiltered')}
          </p>
        ) : (
          <DataTable labelledBy={listId} phone="cards">
            <thead>
              <tr>
                <th scope="col">{t('venuePage.staff.person')}</th>
                <th scope="col">{t('venuePage.staff.role')}</th>
                <th scope="col">{t('venuePage.staff.branch')}</th>
                <th scope="col">{t('venuePage.staff.status')}</th>
                <th scope="col">
                  <span className="yc-sr">{t('venuePage.staff.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((member) => {
                const status = statusOf(member);
                const issuable = canChange && canIssueSignIn(PLATFORM_ACTOR, member);
                const action = member.email
                  ? t('venuePage.staff.newLink')
                  : t('venuePage.staff.giveSignIn');
                const contact = member.email
                  ? member.email
                  : isAdminRole(member.role)
                    ? member.phone
                    : t('venuePage.staff.byPin');
                return (
                  <tr key={member.id} className={member.isActive ? undefined : 'is-dim'}>
                    <td>
                      <div className="yc-person">
                        <span className="yc-av" aria-hidden="true">
                          {initialsOf(member.fullName)}
                        </span>
                        <div>
                          <div className="yc-pn">{member.fullName}</div>
                          <div className="yc-pe">{contact}</div>
                        </div>
                      </div>
                    </td>
                    <td>{t(`role.${member.role}`)}</td>
                    <td>{branchName(member.branchId)}</td>
                    <td>
                      <span className={PILL[status]}>
                        <span className="yc-dot" aria-hidden="true" />
                        {statusLabel(status)}
                      </span>
                    </td>
                    <td className="yc-num yc-tc-act">
                      {issuable ? (
                        <button
                          type="button"
                          className="yc-btn yc-btn-sec yc-btn-sm"
                          data-link={member.id}
                          aria-label={t('venuePage.staff.actionFor', {
                            action,
                            name: member.fullName,
                          })}
                          onClick={() =>
                            setShown({
                              kind: 'issue',
                              member,
                              email: member.email ?? '',
                              failure: null,
                              returnTo: `[data-link="${member.id}"]`,
                            })
                          }
                        >
                          {action}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </section>

      {shown?.kind === 'wizard' ? (
        <AddStaffWizard
          venueId={venue.id}
          branches={venue.branches}
          onClose={() => setShown(null)}
          onHired={afterHire}
        />
      ) : null}

      {shown?.kind === 'issue' ? (
        <IssueSignInDialog
          venueId={venue.id}
          member={shown.member}
          initialEmail={shown.email}
          initialFailure={shown.failure}
          onClose={() => setShown(null)}
          onIssued={(link) =>
            setShown({
              kind: 'once',
              name: shown.member.fullName,
              pin: null,
              link,
              failure: null,
              retry: null,
              returnTo: shown.returnTo,
            })
          }
        />
      ) : null}

      {shown?.kind === 'once' ? (
        <OnceLinkDialog
          title={
            shown.link
              ? t('venuePage.once.title', { name: shown.name })
              : t('venuePage.once.pinTitle', { name: shown.name })
          }
          link={shown.link}
          pin={shown.pin}
          body={t('venuePage.once.body')}
          pinHelp={t('venuePage.once.pinHelp')}
          linkHelp={(when) => t('venuePage.once.help', { when })}
          failure={shown.failure}
          retryClosesPin
          onRetry={
            shown.retry
              ? () => {
                  const retry = shown.retry;
                  if (!retry) return;
                  setShown({
                    kind: 'issue',
                    member: retry.member,
                    email: retry.email,
                    failure: shown.failure,
                    returnTo: shown.returnTo,
                  });
                }
              : null
          }
          timeZoneId={CONSOLE_TIME_ZONE}
          onDone={() => {
            const hadLink = Boolean(shown.link);
            const returnTo = focusOf(shown.returnTo);
            setShown(null);
            returnTo()?.focus();
            toast.say(hadLink ? t('venuePage.once.savedLink') : t('venuePage.once.added'));
          }}
        />
      ) : null}
    </div>
  );
}
