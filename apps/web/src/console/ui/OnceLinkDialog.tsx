import type { StaffSignInLink } from '@yalla/api';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from './Dialog';
import { useToast } from './toast';

export interface OnceLinkDialogProps {
  readonly title: string;
  /**
   * The one copy of the sign-in link, or `null` when there is none to show: a
   * PIN-only hire, or a hire whose link the server refused (`failure`).
   */
  readonly link: StaffSignInLink | null;
  /** The tablet PIN made with the person, shown once beside the link. */
  readonly pin?: string | null;
  /** The sentence under the title; the venue list's by default. */
  readonly body?: string;
  /** The line under the PIN. */
  readonly pinHelp?: string;
  /** The line under the link, given when it stops working; the owner's by default. */
  readonly linkHelp?: (when: string) => string;
  /** Why no link was made, when the person exists but the server refused it. */
  readonly failure?: string | null;
  /** Offered with `failure`: closes this and asks for the address again. */
  readonly onRetry?: (() => void) | null;
  /** "Open the venue page", when there is one to open. */
  readonly venueHref?: string;
  readonly timeZoneId: string;
  readonly onDone: () => void;
}

/**
 * A sign-in link and a PIN shown once, to copy and pass on in a chat
 * (HANDOFF section 3: links are never emailed).
 *
 * The server keeps the token's hash and no read returns the link, so this is
 * the only copy: it lives in the opener's state, never in a cache, a URL or a
 * log, and is gone when this closes. Hence the dialog cannot be dismissed by
 * Escape or the scrim, and "Done" before a copy warns once — the second "Done"
 * closes, for somebody who means it. A PIN alone has nothing to copy: it is
 * read out across a counter, so it asks for no copy first.
 *
 * Copy falls back to selecting the link when the clipboard is out of reach,
 * and says to press Ctrl+C.
 */
export function OnceLinkDialog({
  title,
  link,
  pin = null,
  body,
  pinHelp,
  linkHelp,
  failure = null,
  onRetry = null,
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

  const when = link
    ? `${formatDate(link.expiresAtUtc, timeZoneId, locale)} ${formatTime(
        link.expiresAtUtc,
        timeZoneId,
        locale,
      )}`
    : '';

  function selectLink() {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }

  async function copy() {
    if (!link) return;
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
    if (link && !copied && !nag) {
      setNag(true);
      return;
    }
    onDone();
  }

  return (
    <Dialog title={title} describedBy={bodyId} dismissible={false} onClose={() => undefined}>
      <p id={bodyId}>{body ?? t('venues.once.body')}</p>
      {pin ? (
        <div className="yc-once">
          <span className="yc-help yc-strong">{t('venues.once.pin')}</span>
          {/* Spelled out for a screen reader: "7 3 1 5", not "seven thousand…". */}
          <span className="yc-pin" aria-label={pin.split('').join(' ')}>
            {pin}
          </span>
          <span className="yc-help">{pinHelp ?? t('venues.once.pinHelp')}</span>
        </div>
      ) : null}
      {link ? (
        <div className="yc-once">
          <span className="yc-help yc-strong">
            {t('venues.once.linkFor', { email: link.email })}
          </span>
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
          <span className="yc-help">
            {linkHelp ? linkHelp(when) : t('venues.once.help', { when })}
          </span>
        </div>
      ) : null}
      {failure ? (
        <p className="yc-alert yc-alert-warn" role="alert">
          {failure}
        </p>
      ) : null}
      {nag ? (
        <p className="yc-err" role="alert">
          {t('venues.once.nag')}
        </p>
      ) : null}
      <div className="yc-acts">
        {venueHref ? (
          <Link
            className="yc-btn yc-btn-sec"
            to={venueHref}
            onClick={(event) => {
              // Leaving is closing: the same one warning as "Done" before a copy.
              if (link && !copied && !nag) {
                event.preventDefault();
                setNag(true);
              }
            }}
          >
            {t('venues.once.openVenue')}
          </Link>
        ) : null}
        {failure && onRetry ? (
          <button type="button" className="yc-btn yc-btn-sec" onClick={onRetry}>
            {t('venuePage.once.retry')}
          </button>
        ) : null}
        <button
          type="button"
          className="yc-btn yc-btn-pri"
          {...(link ? {} : { 'data-autofocus': '' })}
          onClick={done}
        >
          {t('venues.once.done')}
        </button>
      </div>
    </Dialog>
  );
}
