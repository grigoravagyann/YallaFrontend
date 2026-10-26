import { useTranslation } from '@yalla/i18n';
import { useInView, Warn } from './panelParts';
import { MAX_PARTY } from './tablePanelRules';

export interface SeatConfirmProps {
  readonly partySize: number;
  readonly seats: number;
  readonly onChange: (next: number) => void;
  readonly warning: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * A party-size stepper and a confirm. Nothing else.
 *
 * No keyboard, no dropdown, no name field. Seating is the most frequent action
 * on this screen and every control that is not the number of people is a
 * control a waiter has to skip past while holding two plates.
 *
 * Capped where the server caps it (1 to 100), never at the table's seats. Five
 * people do sit at a four-top, and a client rule stricter than the server's
 * teaches the floor to lie about party sizes to get past it — so going past
 * the seats is said, in amber, and allowed.
 */
export function SeatConfirm({
  partySize,
  seats,
  onChange,
  warning,
  onConfirm,
  onCancel,
}: SeatConfirmProps) {
  const { t } = useTranslation(['staff', 'common']);
  const ref = useInView();

  return (
    <div ref={ref} className="tp-confirm" tabIndex={-1}>
      <h3>{t('table.partySize')}</h3>
      <div className="tp-party">
        <span className="tp-party-label">{t('table.party')}</span>
        <div className="tp-stepper" role="group" aria-label={t('table.partySize')}>
          <button
            type="button"
            onClick={() => onChange(Math.max(1, partySize - 1))}
            disabled={partySize <= 1}
            aria-label={t('table.fewer')}
          >
            −
          </button>
          <output aria-live="polite">{partySize}</output>
          <button
            type="button"
            onClick={() => onChange(Math.min(MAX_PARTY, partySize + 1))}
            disabled={partySize >= MAX_PARTY}
            aria-label={t('table.more')}
          >
            +
          </button>
        </div>
      </div>
      {partySize > seats ? (
        <p className="tp-cap">{t('table.overSeats', { count: seats })}</p>
      ) : null}

      {warning ? <Warn tone="amber">{warning}</Warn> : null}

      <div className="tp-row">
        <button type="button" className="tp-btn tp-sec" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
        <button type="button" className="tp-btn tp-ok" onClick={onConfirm}>
          {t('table.action.seatConfirm', { count: partySize })}
        </button>
      </div>
    </div>
  );
}
