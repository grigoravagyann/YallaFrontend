import { isAdminRole, type StaffMember } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, type ReactNode } from 'react';
import { MenuButton } from '../../../components/MenuButton';
import type { CardActions, StaffAction } from './staffActions';
import { useStaffLabels } from './staffLabels';

export interface StaffCardProps {
  readonly member: StaffMember;
  /** Shown only where the actor covers several branches. */
  readonly branchLabel: string | null;
  readonly actions: CardActions;
  readonly onAction: (action: StaffAction) => void;
  /** The sign-in prompt, when it is open for this person. */
  readonly children?: ReactNode;
}

/** Two letters for the avatar: the first of the first two words that are names. */
function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/u)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toLocaleUpperCase())
    .join('');
}

/**
 * One person: who they are, where they work, the one thing that needs doing,
 * and everything else behind "More".
 *
 * The status line keeps every state the table's status cell had, stacked,
 * because the fix differs for each: deactivated; PIN locked; no sign-in (no
 * address at all); awaiting password (an address and a link nobody opened).
 * There is no "PIN active" badge: the API says whether a PIN is locked, not
 * whether one is set, and a badge claiming it would be made up.
 */
export function StaffCard({ member, branchLabel, actions, onAction, children }: StaffCardProps) {
  const { t } = useTranslation(['admin', 'common']);
  const labels = useStaffLabels();
  const nameId = useId();
  const signsIn = isAdminRole(member.role);

  return (
    <li className={`roster-item${children ? ' is-expanded' : ''}`}>
      <article
        className={`card roster-card${member.isActive ? '' : ' is-deactivated'}`}
        aria-labelledby={nameId}
      >
        <div className="roster-card-head">
          <span className="avatar" aria-hidden="true">
            {initialsOf(member.fullName)}
          </span>
          <div className="roster-card-who">
            <h4 id={nameId} className="roster-card-name">
              {member.fullName}
            </h4>
            <p className="muted small">{member.phone}</p>
            {/* The address a link was issued to: weeks later, "which email did
                I send it to" has to be answerable here. */}
            {signsIn && member.email ? (
              <p className="muted small roster-card-email">{member.email}</p>
            ) : null}
            {branchLabel || actions.isSelf ? (
              <p className="roster-card-tags">
                {branchLabel ? <span className="badge">{branchLabel}</span> : null}
                {actions.isSelf ? (
                  <span className="badge badge-self">{t('staff.card.you')}</span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        <div className="roster-card-foot">
          <p className="roster-card-status">
            {member.isActive ? null : <span className="badge">{t('staff.status.inactive')}</span>}
            {member.isPinLocked ? (
              <span className="badge badge-warn">{t('staff.status.pinLocked')}</span>
            ) : null}
            {/* Not on a deactivated card: "Deactivated" explains the state, no
                action is offered, and the badge comes back on reactivation. */}
            {member.isActive && signsIn && !member.email ? (
              <span className="badge badge-warn">{t('staff.status.noSignIn')}</span>
            ) : null}
            {member.isActive && signsIn && member.email && !member.hasPasswordSignIn ? (
              <span className="badge">{t('staff.status.awaitingPassword')}</span>
            ) : null}
          </p>
          <div className="roster-card-actions">
            {actions.primary ? (
              <button
                type="button"
                className="button button-small"
                onClick={() => onAction(actions.primary!)}
              >
                {labels.action(actions.primary, member)}
              </button>
            ) : null}
            {/* On somebody else's card only: on your own, "above your role"
                would be the wrong reason. */}
            {actions.notYours && !actions.isSelf ? (
              <span className="muted small">{t('staff.action.notYours')}</span>
            ) : null}
            <MenuButton
              label={t('staff.action.more')}
              accessibleName={t('staff.action.moreFor', { name: member.fullName })}
              items={actions.overflow.map((action) => ({
                id: action,
                label: labels.action(action, member),
                ...(action === 'deactivate' ? { tone: 'danger' as const } : {}),
                onSelect: () => onAction(action),
              }))}
            />
          </div>
        </div>

        {children}
      </article>
    </li>
  );
}
