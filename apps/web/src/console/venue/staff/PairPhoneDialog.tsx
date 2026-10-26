import type { PhonePairingCode, StaffDevice } from '@yalla/api';
import { useNow } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Dialog } from '../../ui/Dialog';
import { phoneDeviceName } from './phoneDeviceName';

export interface PairPhoneDialogProps {
  /** The person's full name, for the title. */
  readonly name: string;
  /** The code, shown once: it lives in the caller's state and nowhere else. */
  readonly pairing: PhonePairingCode;
  /** A new code is being made ("New code" after the old one ran out). */
  readonly renewing: boolean;
  /** The person's phone that appeared since this code was issued, if one has. */
  readonly paired: StaffDevice | null;
  readonly onRenew: () => void;
  readonly onClose: () => void;
  readonly returnFocusTo?: () => HTMLElement | null;
}

/**
 * "Pair a phone" (Devices artboard, the QR modal): the code as a QR the
 * person scans with SHURJ on their own phone, the same code to type by hand,
 * and how long it has left — ten minutes, one use.
 *
 * The QR is drawn here, from `pairingUrl`, and never fetched: the code is a
 * credential for ten minutes and goes nowhere but this screen. The countdown
 * ticks every second on screen; a screen reader is told once a minute, which
 * is as often as the number is worth hearing.
 *
 * Expired, the code is replaced in place ("New code"), which on the server
 * also takes the old one back. While the dialog is up the caller re-reads the
 * phones, so the moment the phone pairs the dialog says so.
 */
export function PairPhoneDialog(props: PairPhoneDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { pairing } = props;
  const now = useNow(1_000);
  const firstName = props.name.split(/\s+/u)[0] ?? props.name;

  // Keyed by the URL it was drawn from, so a renewed code never shows the old square.
  const [qr, setQr] = useState<{ url: string; image: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(pairing.pairingUrl, { margin: 1, width: 200, errorCorrectionLevel: 'M' })
      .then((image) => {
        if (!cancelled) setQr({ url: pairing.pairingUrl, image });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pairing.pairingUrl]);
  const image = qr?.url === pairing.pairingUrl ? qr.image : null;

  const leftMs = Math.max(0, Date.parse(pairing.expiresAtUtc) - now.getTime());
  const expired = leftMs <= 0;
  const leftSeconds = Math.ceil(leftMs / 1000);
  const clock = `${Math.floor(leftSeconds / 60)}:${String(leftSeconds % 60).padStart(2, '0')}`;
  const minutesLeft = Math.ceil(leftSeconds / 60);

  const site = siteOf(pairing.pairingUrl);

  return (
    <Dialog
      title={t('phones.dialog.title', { name: props.name })}
      description={t('phones.dialog.lead', { name: firstName, site })}
      onClose={props.onClose}
      {...(props.returnFocusTo ? { returnFocusTo: props.returnFocusTo } : {})}
    >
      <div className="yc-pair">
        {expired ? (
          <div className="yc-pair-qr is-gone" aria-hidden="true" />
        ) : image ? (
          <img
            className="yc-pair-qr"
            src={image}
            alt={t('phones.dialog.qr', { name: firstName })}
            width={200}
            height={200}
          />
        ) : (
          <div className="yc-pair-qr" aria-hidden="true" />
        )}

        <span className="yc-cap">{t('phones.dialog.orType')}</span>
        <b className={expired ? 'yc-pair-code is-gone' : 'yc-pair-code'} data-pair-code="">
          {pairing.code}
        </b>

        {props.paired ? (
          <p className="yc-pair-ok" role="status">
            {t('phones.pairedNow', { device: phoneDeviceName(t, props.paired) })}
          </p>
        ) : expired ? (
          <p className="yc-pair-left is-gone" role="status">
            {t('phones.dialog.expired')}
          </p>
        ) : (
          <p className="yc-pair-left">
            <span aria-hidden="true">{t('phones.dialog.left', { time: clock })}</span>
            {/* Said once a minute, not once a second. */}
            <span className="yc-sr" aria-live="polite">
              {t('phones.dialog.minutesLeft', { count: minutesLeft })}
            </span>
          </p>
        )}
        <span className="yc-cap">{t('phones.dialog.onlyTo', { name: firstName })}</span>
      </div>

      <div className="yc-acts">
        {expired && !props.paired ? (
          <button
            type="button"
            className="yc-btn yc-btn-sec"
            aria-busy={props.renewing}
            onClick={() => {
              if (!props.renewing) props.onRenew();
            }}
          >
            {props.renewing ? <span className="yc-spin" aria-hidden="true" /> : null}
            {t('phones.dialog.newCode')}
          </button>
        ) : null}
        <button
          type="button"
          className="yc-btn yc-btn-pri"
          data-autofocus=""
          onClick={props.onClose}
        >
          {t('phones.dialog.done')}
        </button>
      </div>
    </Dialog>
  );
}

/** "shurj.am/staff": where the person opens the staff app, from the code's own URL. */
function siteOf(pairingUrl: string): string {
  try {
    return `${new URL(pairingUrl).host}/staff`;
  } catch {
    return '/staff';
  }
}
