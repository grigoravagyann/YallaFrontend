import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { transferTargetDetail, type TransferTarget } from '../transferTarget';
import { useBranchFormat } from '../useBranchFormat';

/** A transfer the server took: who has the table now, and when. */
export interface TransferDone {
  readonly name: string;
  readonly atUtc: string;
}

export interface PhoneTransferProps {
  readonly label: string;
  /** The table's waiter now, as the floor names them; `null` while nobody is. */
  readonly serverName: string | null;
  /** Who is signed in here: the "from" of the history line when nobody held it. */
  readonly actorName: string;
  /** Who could take it, on shift first; `null` while it is being read. */
  readonly targets: readonly TransferTarget[] | null;
  readonly failed: boolean;
  readonly online: boolean;
  /** A transfer (or another command on the table) is in flight. */
  readonly busy: boolean;
  readonly timeZoneId: string;
  readonly onTransfer: (target: TransferTarget, onDone: (done: TransferDone) => void) => void;
  /** Back to the table's sheet. */
  readonly onCancel: () => void;
  /** "Done" after the success: the sheet closes. */
  readonly onDone: () => void;
}

/**
 * Transfer a table on the phone (history-stats Transfer artboard): the whole
 * bottom sheet — who has it now, the people who could take it with how many
 * tables each holds (on shift first), Cancel and "Transfer to Aram", then the
 * success said in the sheet itself until "Done".
 *
 * Nobody is chosen until one is tapped, as on the tablet: a hand-over sent to
 * the first name in a list is the mistake this screen exists to prevent.
 * Native radios under the cards, so the arrow keys and a screen reader get a
 * real group.
 */
export function PhoneTransfer(props: PhoneTransferProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { locale } = useLocale();
  const format = useBranchFormat(props.timeZoneId);
  const headingId = useId();
  const legendId = useId();
  const name = useId();
  const doneId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [done, setDone] = useState<TransferDone | null>(null);
  /** Whose it was when "Transfer" was tapped: the floor's re-read moves it. */
  const [from, setFrom] = useState<string>('');

  // Into the chooser when it opens, and onto "Done" once it has worked.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const target = props.targets?.find((one) => one.staffMemberId === chosen) ?? null;
  const first = (full: string) => full.split(/\s+/u)[0] ?? full;
  const initials = (full: string) =>
    full
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toLocaleUpperCase(locale))
      .join('');

  if (done) {
    const toName = first(done.name);
    return (
      <div className="ph-transfer">
        <h2 ref={headingRef} id={headingId} className="ph-transfer-title" tabIndex={-1}>
          {t('table.transfer.title', { label: props.label })}
        </h2>
        <div id={doneId} className="ph-transfer-done" role="status">
          <b>{t('table.transfer.done', { label: props.label, name: toName })}</b>
          <span>
            {t('table.transfer.logged', {
              time: format.time(done.atUtc),
              from: first(from) || '—',
              to: toName,
            })}
          </span>
        </div>
        <button
          ref={doneRef}
          type="button"
          className="ph-transfer-btn is-primary"
          // Focus lands here once it worked: the button says what happened too.
          aria-describedby={doneId}
          onClick={props.onDone}
        >
          {t('table.transfer.close')}
        </button>
      </div>
    );
  }

  const list = props.targets;
  return (
    <div className="ph-transfer" role="group" aria-labelledby={headingId}>
      <h2 ref={headingRef} id={headingId} className="ph-transfer-title" tabIndex={-1}>
        {t('table.transfer.title', { label: props.label })}
      </h2>
      <p className="ph-transfer-body">{t('table.transfer.body')}</p>
      <p className="ph-transfer-now">
        {props.serverName
          ? t('table.transfer.current', { name: props.serverName })
          : t('table.transfer.currentNone')}
      </p>

      {props.failed ? (
        <p className="ph-transfer-note is-failed" role="alert">
          {t('table.transfer.failed')}
        </p>
      ) : list === null ? (
        <p className="ph-transfer-note" role="status">
          {t('table.transfer.loading')}
        </p>
      ) : list.length === 0 ? (
        <p className="ph-transfer-note">{t('table.transfer.nobody')}</p>
      ) : (
        <fieldset className="ph-transfer-people">
          <legend id={legendId} className="ph-transfer-legend">
            {t('table.transfer.legendPhone')}
          </legend>
          {list.map((candidate) => {
            const on = chosen === candidate.staffMemberId;
            return (
              <label
                key={candidate.staffMemberId}
                className={on ? 'ph-transfer-person is-on' : 'ph-transfer-person'}
              >
                <input
                  type="radio"
                  name={name}
                  value={candidate.staffMemberId}
                  checked={on}
                  onChange={() => setChosen(candidate.staffMemberId)}
                />
                <span className="ph-transfer-mark" aria-hidden="true">
                  {initials(candidate.name)}
                </span>
                <span className="ph-transfer-who">
                  <b>{candidate.name}</b>
                  <span>{transferTargetDetail(candidate, t)}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {!props.online ? <p className="ph-transfer-note">{t('table.transfer.needsOnline')}</p> : null}

      <div className="ph-transfer-actions">
        <button type="button" className="ph-transfer-btn" onClick={props.onCancel}>
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          className="ph-transfer-btn is-primary"
          disabled={!props.online || props.busy || target === null}
          onClick={() => {
            if (!target) return;
            setFrom(props.serverName ?? props.actorName);
            props.onTransfer(target, setDone);
          }}
        >
          {target
            ? t('table.transfer.confirmTo', { name: first(target.name) })
            : t('table.transfer.confirm')}
        </button>
      </div>
    </div>
  );
}
