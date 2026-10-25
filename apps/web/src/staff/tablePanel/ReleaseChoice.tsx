import type { ReleaseOutcome } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { Confirm } from './panelParts';

/**
 * Why a booking is being let go: two answers of identical weight, neither
 * chosen, and "Release" off until one is.
 *
 * One of them puts a no-show on somebody's record and the other does not, and
 * that is the entire difference between them. Make either one the obvious
 * default — bigger, primary-coloured, preselected — and it gets tapped for both
 * cases within a week, at which point the no-show threshold starts punishing
 * the people who phoned to cancel. So: the same card twice, side by side in
 * weight, the sentence that separates them, and an explicit pick.
 */
export function ReleaseChoice({
  disabled,
  onRelease,
  onCancel,
}: {
  readonly disabled: boolean;
  readonly onRelease: (outcome: ReleaseOutcome) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const [outcome, setOutcome] = useState<ReleaseOutcome | null>(null);

  const choice = (value: ReleaseOutcome, title: string, note: string) => (
    <button
      type="button"
      className="tp-choice"
      aria-pressed={outcome === value}
      onClick={() => setOutcome(value)}
    >
      <b>{title}</b>
      <small>{note}</small>
    </button>
  );

  return (
    <Confirm title={t('table.release.why')}>
      <p className="tp-hint">{t('table.release.difference')}</p>
      <div className="tp-choices">
        {choice('noShow', t('table.release.noShowTitle'), t('table.release.noShowNote'))}
        {choice(
          'guestCancelled',
          t('table.release.cancelledTitle'),
          t('table.release.cancelledNote'),
        )}
      </div>
      <div className="tp-row">
        <button type="button" className="tp-btn tp-sec" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          className="tp-btn tp-danger-fill"
          disabled={disabled || outcome === null}
          onClick={() => {
            if (outcome) onRelease(outcome);
          }}
        >
          {t('table.release.confirm')}
        </button>
      </div>
    </Confirm>
  );
}
