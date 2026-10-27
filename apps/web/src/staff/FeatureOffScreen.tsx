import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { staffSession } from './auth/staffSession';

/**
 * A device the platform has switched a feature off for (2026-10-27): said
 * plainly, with the way out, instead of a screen that can never load.
 *
 * - `kitchen`: a kitchen account at a branch whose kitchen screen is off. The
 *   way out is signing out, so a waiter can take the tablet.
 * - `phone`: a paired phone at a branch whose staff phones are off, found on
 *   launch (its own device read is refused). It can try again once the
 *   feature is back, or forget the pairing here and start over.
 */
export function FeatureOffScreen({ kind = 'kitchen' }: { readonly kind?: 'kitchen' | 'phone' }) {
  const { t } = useTranslation(['staff']);
  const [checking, setChecking] = useState(false);
  const [stillOff, setStillOff] = useState(false);

  if (kind === 'phone') {
    return (
      <div className="staff-gate" data-surface="staff">
        <div className="staff-gate-card" role="alert">
          <h1>{t('features.phoneOffTitle')}</h1>
          <p>
            {t('features.phoneOff')} {t('features.askManager')}
          </p>
          {stillOff ? <p>{t('features.stillOff')}</p> : null}
          <button
            type="button"
            className="button button-primary"
            aria-busy={checking}
            onClick={() => {
              setChecking(true);
              void (staffSession?.refreshDevice() ?? Promise.resolve(null))
                .catch(() => null)
                .then((device) => {
                  setChecking(false);
                  setStillOff(device === null);
                });
            }}
          >
            {t('features.tryAgain')}
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void staffSession?.forgetDevice()}
          >
            {t('features.forgetPhone')}
          </button>
        </div>
      </div>
    );
  }

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
