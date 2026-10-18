import type { StaffSignInLink } from '@yalla/api';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from './Dialog';
import { useToast } from './toast';

export interface OnceLinkDialogProps {
  readonly title: string;
  /** Who the link is for. */
  readonly email: string;
  readonly link: StaffSignInLink;
  /** The tablet PIN made with the person, shown once beside the link. */
  readonly pin?: string | null;
  /** "Open the venue page", when there is one to open. */
  readonly venueHref?: string;
  readonly timeZoneId: string;
  readonly onDone: () => void;
}

/**
 * A sign-in link shown once, to copy and pass on in a chat (HANDOFF section 3:
 * links are never emailed).
 *
 * The server keeps the token's hash and no read returns the link, so this is
 * the only copy: it lives in the opener's state, never in a cache, a URL or a
 * log, and is gone when this closes. Hence the dialog cannot be dismissed by
 * Escape or the scrim, and "Done" before a copy warns once — the second "Done"
 * closes, for somebody who means it.
 *
 * Copy falls back to selecting the link when the clipboard is out of reach,
 * and says to press Ctrl+C.
 */
export function OnceLinkDialog({
  title,
  email,
  link,
  pin = null,
  venueHref,
  timeZoneId,
  onDone,
}: OnceLinkDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [nag, setNag] = useState(false);
  const linkId = useId();
  const bodyId = useId();

  const when = `${formatDate(link.expiresAtUtc, timeZoneId, locale)} ${formatTime(
    link.expiresAtUtc,
    timeZoneId,
    locale,
  )}`;

  function selectLink() {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.resetLink);
      setCopied(true);
      setNag(false);
    } catch {
      selectLink();
      toast.say(t('venues.toast.copyManual'));
    }
  }

  function done() {
    if (!copied && !nag) {
      setNag(true);
      return;
    }
    onDone();
  }

  return (
    <Dialog title={title} describedBy={bodyId} dismissible={false} onClose={() => undefined}>
      <p id={bodyId}>{t('venues.once.body')}</p>
      <div className="yc-once">
        <span className="yc-help yc-strong">{t('venues.once.linkFor', { email })}</span>
        <div className="yc-linkrow">
          <label htmlFor={linkId} className="yc-sr">
            {t('venues.once.link')}
          </label>
          <input
            ref={inputRef}
            id={linkId}
            className="yc-ctl yc-mono"
            readOnly
            value={link.resetLink}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            className="yc-btn yc-btn-pri"
            data-autofocus=""
            onClick={() => void copy()}
          >
            {copied ? t('venues.once.copied') : t('venues.once.copy')}
          </button>
        </div>
        <span className="yc-help">{t('venues.once.help', { when })}</span>
        {pin ? (
          <div className="yc-once-pin">
            <span className="yc-help yc-strong">{t('venues.once.pin')}</span>
            <span className="yc-pin" aria-label={pin.split('').join(' ')}>
              {pin}
            </span>
            <span className="yc-help">{t('venues.once.pinHelp')}</span>
          </div>
        ) : null}
      </div>
      {nag ? (
        <p className="yc-err" role="alert">
          {t('venues.once.nag')}
        </p>
      ) : null}
      <div className="yc-acts">
        {venueHref ? (
          <Link className="yc-btn yc-btn-sec" to={venueHref}>
            {t('venues.once.openVenue')}
          </Link>
        ) : null}
        <button type="button" className="yc-btn yc-btn-pri" onClick={done}>
          {t('venues.once.done')}
        </button>
      </div>
    </Dialog>
  );
}
