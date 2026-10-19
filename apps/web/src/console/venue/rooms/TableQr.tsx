import { useTranslation } from '@yalla/i18n';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../ui/toast';

/**
 * The QR token: shown, copyable, printable — and never editable (Rooms
 * artboard, the table panel).
 *
 * The code on this square of paper is stuck to a physical table. An edit that
 * changed it would silently break the sticker, so the token is not a form
 * field, is not sent in the save payload, and changes only through the
 * explicit regenerate action, below this block.
 */
export function TableQr({ label, qrToken }: { readonly label: string; readonly qrToken: string }) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const codeRef = useRef<HTMLElement>(null);

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

  /** The copy failed or there is no clipboard: the code selected, to copy by hand. */
  function selectByHand() {
    const code = codeRef.current;
    const selection = window.getSelection();
    if (code && selection) {
      const range = document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    toast.say(t('rooms.qr.copyFailed'), { tone: 'error' });
  }

  const print = () => {
    const frame = window.open('', '_blank', 'width=420,height=560');
    if (!frame || !image) return;
    frame.document.write(
      `<!doctype html><title>${label}</title>` +
        `<body style="font-family:system-ui;text-align:center;padding:32px">` +
        `<h1 style="font-size:72px;margin:0 0 16px">${label}</h1>` +
        `<img src="${image}" alt="" style="width:240px;height:240px">` +
        `<p style="font-size:12px;word-break:break-all">${qrToken}</p></body>`,
    );
    frame.document.close();
    frame.focus();
    frame.print();
  };

  return (
    <div className="yc-qr">
      {image ? (
        <img className="yc-qr-img" src={image} alt="" width={84} height={84} />
      ) : (
        <span className="yc-qr-img" aria-hidden="true" />
      )}
      <div className="yc-qr-t">
        <b>{t('rooms.qr.title')}</b>
        {qrToken ? (
          <>
            <code ref={codeRef} className="yc-code-t" data-testid="qr-token">
              {qrToken}
            </code>
            <div className="yc-photo-acts">
              <button
                type="button"
                className="yc-btn yc-btn-sec yc-btn-sm"
                onClick={() => {
                  if (!navigator.clipboard) {
                    selectByHand();
                    return;
                  }
                  navigator.clipboard.writeText(qrToken).then(
                    () => setCopiedToken(qrToken),
                    () => selectByHand(),
                  );
                }}
              >
                {copied ? t('rooms.qr.copied') : t('rooms.qr.copy')}
              </button>
              <button
                type="button"
                className="yc-btn yc-btn-sec yc-btn-sm"
                aria-disabled={!image}
                onClick={() => image && print()}
              >
                {t('rooms.qr.print')}
              </button>
            </div>
          </>
        ) : (
          // A table only ever held here has no token yet, and inventing one
          // would put a meaningless string under a copy button.
          <span className="yc-help">{t('rooms.qr.pending')}</span>
        )}
      </div>
    </div>
  );
}
