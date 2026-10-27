import { useTranslation } from '@yalla/i18n';
import { staffSession } from './auth/staffSession';

/**
 * A kitchen account at a branch whose kitchen screen the platform has not
 * enabled (2026-10-27). Every call it could make is refused, so instead of a
 * board that never loads it is told why, and the way out: signing out, so a
 * waiter can take the tablet.
 */
export function FeatureOffScreen() {
  const { t } = useTranslation(['staff']);
  return (
    <div className="staff-gate" data-surface="staff">
      <div className="staff-gate-card" role="alert">
        <h1>{t('features.kitchenOffTitle')}</h1>
        <p>
          {t('features.kitchenOff')} {t('features.askManager')}
        </p>
        <button type="button" className="button" onClick={() => void staffSession?.signOut()}>
          {t('features.signOut')}
        </button>
      </div>
    </div>
  );
}
