import type { BookingPreOrderFields, PreOrderState } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId } from 'react';

/** Each state's pill: waiting is amber, the kitchen's green, the rest grey. */
const PILL: Readonly<Record<PreOrderState, string>> = {
  editable: 'yc-pill yc-pill-blue',
  locked: 'yc-pill yc-pill-amber',
  sent: 'yc-pill yc-pill-green',
  notComing: 'yc-pill yc-pill-grey',
  cancelled: 'yc-pill yc-pill-grey',
  unknown: 'yc-pill yc-pill-grey',
};

/**
 * A booking's pre-order (2026-10-21), where the console shows the booking:
 * the dishes at the prices the guest was shown, any dish sold out since, the
 * note, the total, where it stands, and whether the guest said they are on
 * their way. Nothing when the booking has none.
 *
 * Read-only: the guest changes it (until two hours before), the waiter sends
 * it. A large party with a pre-order is often the reason to say yes.
 */
export function BookingPreOrder({ booking }: { readonly booking: BookingPreOrderFields }) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const titleId = useId();
  const preOrder = booking.preOrder;
  if (!preOrder) return null;

  return (
    <section className="yc-po" aria-labelledby={titleId}>
      <div className="yc-po-h">
        <b id={titleId}>{t('preOrders.booking.title')}</b>
        <span className={PILL[preOrder.state]}>{t(`preOrders.state.${preOrder.state}`)}</span>
        {booking.guestConfirmedOnWayAtUtc ? (
          <span className="yc-pill yc-pill-green">{t('preOrders.booking.onTheWay')}</span>
        ) : null}
      </div>
      <ul className="yc-po-lines" aria-label={t('preOrders.booking.dishes')}>
        {preOrder.lines.map((line) => (
          <li key={line.id}>
            <span className="yc-po-qty">
              {t('preOrders.booking.quantity', { count: line.quantity })}
            </span>
            <span className="yc-po-dish">
              <span>{line.name}</span>
              {line.availableNow ? null : (
                <span className="yc-pill yc-pill-amber yc-pill-xs">
                  {t('preOrders.booking.soldOutNow')}
                </span>
              )}
              {line.note ? <span className="yc-po-note">{line.note}</span> : null}
            </span>
            <span className="yc-po-sum">{formatDram(line.lineTotalDram, locale)}</span>
          </li>
        ))}
      </ul>
      {preOrder.note ? (
        <p className="yc-po-text">
          <b>{t('preOrders.booking.note')}</b> <span>{preOrder.note}</span>
        </p>
      ) : null}
      <p className="yc-po-total">
        {t('preOrders.booking.total', { amount: formatDram(preOrder.totalDram, locale) })}
      </p>
    </section>
  );
}
