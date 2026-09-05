import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { useBranchFormat } from './useBranchFormat';

/**
 * Taking cash.
 *
 * A keypad rather than a text field: this is the one place on the screen where
 * typing is unavoidable, and a numeric keypad with 56pt keys is faster and far
 * harder to mistype than a soft keyboard on a tablet held in one hand.
 *
 * Two things are deliberately separate and always visible:
 *
 * - **The amount** defaults to the remaining balance, because that is the
 *   usual case, and is freely editable, because partial payments are normal —
 *   four people at a table paying in three goes is a Tuesday.
 * - **The tip** is its own field, visibly outside the balance. A tip folded
 *   into the amount makes a tab look settled while money is still owed, and the
 *   waiter finds out at the end of the shift.
 *
 * The confirmation states plainly what is being recorded, in one sentence with
 * both numbers in it.
 */

export interface CashKeypadProps {
  readonly remainingDram: number;
  readonly timeZoneId: string;
  readonly onConfirm: (input: { amountDram: number; tipDram: number }) => void;
  readonly onCancel: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;

export function CashKeypad({ remainingDram, timeZoneId, onConfirm, onCancel }: CashKeypadProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);

  const [field, setField] = useState<'amount' | 'tip'>('amount');
  const [amount, setAmount] = useState(String(remainingDram));
  const [tip, setTip] = useState('0');

  const amountDram = Number.parseInt(amount || '0', 10);
  const tipDram = Number.parseInt(tip || '0', 10);
  const valid = Number.isSafeInteger(amountDram) && amountDram > 0;
  const overpaying = amountDram > remainingDram;

  function press(key: (typeof KEYS)[number]): void {
    const current = field === 'amount' ? amount : tip;
    const next =
      key === 'del'
        ? current.slice(0, -1)
        : // No leading zeros: "0500" is a number nobody meant to type.
          (current === '0' ? '' : current) + key;
    const clean = next.replace(/^0+(?=\d)/, '');
    if (field === 'amount') setAmount(clean);
    else setTip(clean);
  }

  return (
    <div className="staff-dialog" role="dialog" aria-label={t('cash.title')}>
      <div className="card cash-card">
        <h2>{t('cash.title')}</h2>

        <p className="cash-remaining">
          {t('cash.remaining', { amount: format.dram(remainingDram) })}
        </p>

        <div className="cash-fields">
          <button
            type="button"
            className={`cash-field ${field === 'amount' ? 'is-active' : ''}`}
            onClick={() => setField('amount')}
          >
            <span>{t('cash.amount')}</span>
            <strong>{format.dramAmount(amountDram || 0)}</strong>
          </button>

          {/* Visibly outside the balance: its own box, its own caption. */}
          <button
            type="button"
            className={`cash-field cash-tip ${field === 'tip' ? 'is-active' : ''}`}
            onClick={() => setField('tip')}
          >
            <span>{t('cash.tip')}</span>
            <strong>{format.dramAmount(tipDram || 0)}</strong>
          </button>
        </div>

        <p className="table-note">{t('cash.tipNote')}</p>

        <div className="cash-keypad">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="cash-key"
              onClick={() => press(key)}
              aria-label={key === 'del' ? t('cash.delete') : key}
            >
              {key === 'del' ? '⌫' : key}
            </button>
          ))}
        </div>

        {/* Says what is being recorded, in words, with both numbers. */}
        <p className="cash-confirm-line">
          {t('cash.confirmLine', {
            amount: format.dram(valid ? amountDram : 0),
            tip: format.dram(tipDram || 0),
          })}
        </p>
        {overpaying ? (
          <p className="table-warn">{t('cash.overpaying')}</p>
        ) : amountDram > 0 && amountDram < remainingDram ? (
          <p className="table-note">
            {t('cash.partial', { amount: format.dram(remainingDram - amountDram) })}
          </p>
        ) : null}

        {/* Nobody on either team should be able to think this is fiscal. */}
        <p className="cash-disclaimer">{t('cash.notAReceipt')}</p>

        <div className="actions">
          <button
            type="button"
            className="floor-button big"
            disabled={!valid}
            onClick={() => onConfirm({ amountDram, tipDram: tipDram || 0 })}
          >
            {t('cash.record')}
          </button>
          <button type="button" className="button big" onClick={onCancel}>
            {t('common:action.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
