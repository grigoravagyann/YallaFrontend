import { useTranslation } from '@yalla/i18n';

/**
 * The bar across the top of order entry, the tab and cash (floor-tablet
 * `Order`, `Tab`, `Cash`): back to where the waiter came from, what this screen
 * is about, and whether there is a connection — the one thing that changes
 * what these screens can do.
 *
 * Not the floor's top bar: these screens cover it, and a waiter in the middle
 * of an order has nowhere else to go but back.
 */
export function OverlayBar(props: {
  /** The back button's words, short: "Table 4", "Tab". */
  readonly back: string;
  /** Its accessible name, which says where it goes. */
  readonly backName: string;
  readonly title: string;
  readonly sub: string;
  readonly online: boolean;
  /** What the chip says offline; each screen says what offline means for it. */
  readonly offlineText: string;
  readonly onBack: () => void;
}) {
  const { t } = useTranslation('staff');
  return (
    <header className="ft-top ft-overlay-bar">
      <button type="button" className="ft-back" aria-label={props.backName} onClick={props.onBack}>
        <svg
          className="ft-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        {props.back}
      </button>
      <div className="ft-overlay-title">
        <h1>{props.title}</h1>
        {props.sub ? <p>{props.sub}</p> : null}
      </div>
      <span className="ft-top-gap" />
      {/* Not a button here: nothing to refresh from inside an order. A live
          region, so losing the connection mid-order is heard, not only seen. */}
      <span
        role="status"
        className={`ft-chip ft-chip-static ${props.online ? 'ft-chip-live' : 'ft-chip-offline'}`}
      >
        <i aria-hidden="true" />
        {props.online ? t('order.live') : props.offlineText}
      </span>
    </header>
  );
}
