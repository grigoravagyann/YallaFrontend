import { useTranslation } from '@yalla/i18n';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * The QR token: shown, copyable, printable — and never editable.
 *
 * The code on this square of paper is stuck to a physical table. An edit that
 * changed it would silently break the sticker, so the token is not a form
 * field, is not sent in the save payload, and changes only through the
 * explicit regenerate action.
 */
export function TableQr({
  label,
  qrToken,
  onRegenerate,
}: {
  readonly label: string;
  readonly qrToken: string;
  readonly onRegenerate: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);

  /*
   * Both pieces of state are keyed by the token they belong to, and read back
   * by comparison rather than reset in an effect. Selecting another table, or
   * regenerating this one's code, then cannot leave a stale QR image or a
   * "Copied" label attached to a token that is no longer on screen.
   */
  const [encoded, setEncoded] = useState<{ token: string; url: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const image = encoded?.token === qrToken ? encoded.url : null;
  const copied = copiedToken === qrToken;

  useEffect(() => {
    if (!qrToken) return;
    let cancelled = false;
    void QRCode.toDataURL(qrToken, { margin: 1, width: 208 }).then((url) => {
      if (!cancelled) setEncoded({ token: qrToken, url });
    });
    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  if (!qrToken) {
    return (
      <section className="editor-qr">
        <h3>{t('rooms.qr.title')}</h3>
        {/* A table the editor has only ever held locally has no token yet, and
            inventing one would put a meaningless string under a copy button. */}
        <p className="muted small">{t('rooms.qr.pending')}</p>
      </section>
    );
  }

  const print = () => {
    const frame = window.open('', '_blank', 'width=420,height=560');
    if (!frame || !image) return;
    frame.document.write(
      `<!doctype html><title>${label}</title>` +
        `<body style="font-family:system-ui;text-align:center;padding:32px">` +
        `<h1 style="font-size:72px;margin:0 0 16px">${label}</h1>` +
        `<img src="${image}" alt="" style="width:240px;height:240px">` +
        `<p style="color:#555;font-size:12px;word-break:break-all">${qrToken}</p></body>`,
    );
    frame.document.close();
    frame.focus();
    frame.print();
  };

  return (
    <section className="editor-qr">
      <h3>{t('rooms.qr.title')}</h3>
      {image ? (
        <img className="editor-qr-code" src={image} alt="" width={104} height={104} />
      ) : null}
      <code className="editor-qr-token" data-testid="qr-token">
        {qrToken}
      </code>
      <div className="actions">
        <button
          type="button"
          className="button button-small"
          onClick={() => {
            void navigator.clipboard?.writeText(qrToken).then(() => setCopiedToken(qrToken));
          }}
        >
          {copied ? t('rooms.qr.copied') : t('rooms.qr.copy')}
        </button>
        <button type="button" className="button button-small" disabled={!image} onClick={print}>
          {t('rooms.qr.print')}
        </button>
      </div>
      <button type="button" className="button button-small button-danger" onClick={onRegenerate}>
        {t('rooms.qr.regenerate')}
      </button>
    </section>
  );
}
