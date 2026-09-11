import type { StaffMember, StaffRole } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { StaffAction } from './staffActions';

/**
 * The staff screen's per-role and per-action words, as literal keys.
 *
 * Literal on purpose: `pnpm i18n:check` reads `t('…')` calls and cannot see a
 * key built from a template, so `t(\`staff.group.${role}\`)` with a typo would
 * render its own key path with every check green.
 */
export function useStaffLabels() {
  const { t } = useTranslation(['admin', 'common']);

  function group(role: StaffRole): string {
    switch (role) {
      case 'owner':
        return t('staff.group.owner');
      case 'manager':
        return t('staff.group.manager');
      case 'waiter':
        return t('staff.group.waiter');
      case 'kitchen':
        return t('staff.group.kitchen');
    }
  }

  function roleInfo(role: StaffRole): string {
    switch (role) {
      case 'owner':
        return t('staff.roleInfo.owner');
      case 'manager':
        return t('staff.roleInfo.manager');
      case 'waiter':
        return t('staff.roleInfo.waiter');
      case 'kitchen':
        return t('staff.roleInfo.kitchen');
    }
  }

  function action(kind: StaffAction, member: StaffMember): string {
    switch (kind) {
      case 'unlock':
        return t('staff.action.unlock');
      case 'reactivate':
        return t('staff.action.reactivate');
      case 'issueSignIn':
        return t('staff.action.issueSignIn');
      case 'edit':
        return t('common:action.edit');
      case 'resetPin':
        return t('staff.action.resetPin');
      case 'sendNewLink':
        return member.email ? t('staff.action.sendNewLink') : t('staff.action.issueSignIn');
      case 'deactivate':
        return t('staff.action.deactivate');
      case 'changeOwnPin':
        return t('staff.action.changeOwnPin');
    }
  }

  return { group, roleInfo, action };
}
