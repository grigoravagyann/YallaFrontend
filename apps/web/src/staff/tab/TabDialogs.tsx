import { VOID_REASONS, type AdjustmentKind, type TabLine, type VoidReason } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, useRef, useState, type ReactNode } from 'react';
import { useDialogFocus } from '../../components/useDialogFocus';

const COMP_REASONS = ['longWait', 'regular', 'birthday', 'other'] as const;
const DISCOUNT_PERCENTS = [5, 10, 15, 20] as const;

/** A modal over the tab: a scrim, a card, focus kept inside, Escape to close. */
function TabDialog(props: {
  readonly heading: string;
  readonly alert?: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();
  useDialogFocus(ref, { onEscape: props.onClose });
  return (
    <div
      className="ft-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        ref={ref}
        className="ft-dialog"
        role={props.alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <h2 id={headingId}>{props.heading}</h2>
        {props.children}
      </div>
    </div>
  );
}

/** The reasons as a grid of choices, nothing picked; "Other" asks for the words. */
function ReasonPicker<R extends string>(props: {
  readonly reasons: readonly R[];
  readonly label: (reason: R) => string;
  readonly picked: R | null;
  readonly onPick: (reason: R) => void;
  readonly detail: string;
  readonly onDetail: (detail: string) => void;
  readonly missing: boolean;
}) {
  const { t } = useTranslation('staff');
  return (
    <>
      <div className="ft-reasons">
        {props.reasons.map((reason) => (
          <button
            key={reason}
            type="button"
            aria-pressed={props.picked === reason}
            onClick={() => props.onPick(reason)}
          >
            {props.label(reason)}
          </button>
        ))}
      </div>
      {props.picked === 'other' ? (
        <input
          className="ft-field"
          aria-label={t('tab.reason')}
          placeholder={t('tab.reasonPlaceholder')}
          value={props.detail}
          autoFocus
          onChange={(event) => props.onDetail(event.target.value)}
        />
      ) : null}
      {props.missing ? (
        <p className="ft-error" role="alert">
          {t('tab.pickReason')}
        </p>
      ) : null}
    </>
  );
}

export function LineDialog(props: {
  readonly line: TabLine;
  readonly step: 'menu' | 'void';
  readonly canComp: boolean;
  /** The tab has been paid against: the server refuses a void (a refund). */
  readonly paidAgainst: boolean;
  readonly heading: string;
  readonly onStep: (step: 'menu' | 'void') => void;
  readonly onComp: () => void;
  readonly onVoid: (reason: VoidReason, detail?: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const noteId = useId();
  const [reason, setReason] = useState<VoidReason | null>(null);
  const [detail, setDetail] = useState('');
  const [tried, setTried] = useState(false);
  // "Other" is a reason only with the words: the diner reads them.
  const complete = reason !== null && (reason !== 'other' || detail.trim().length > 0);

  return (
    <TabDialog heading={props.heading} onClose={props.onClose}>
      {props.step === 'menu' ? (
        <>
          <div className="ft-dialog-row">
            <button
              type="button"
              className="ft-btn ft-btn-secondary"
              disabled={props.paidAgainst}
              aria-describedby={props.paidAgainst ? `${noteId}-paid` : undefined}
              onClick={() => props.onStep('void')}
            >
              {t('tab.voidLine')}
            </button>
            {props.canComp ? (
              <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onComp}>
                {t('tab.compLine')}
              </button>
            ) : null}
          </div>
          {/* Said before the tap rather than after a refusal: a void on a tab
              somebody has paid against is a refund, which the server refuses. */}
          {props.paidAgainst ? (
            <p className="ft-dialog-note" id={`${noteId}-paid`}>
              {t('tab.voidAfterPayment')}
            </p>
          ) : null}
          <button type="button" className="ft-btn ft-btn-ghost" onClick={props.onClose}>
            {t('common:action.close')}
          </button>
        </>
      ) : (
        <>
          <p className="ft-dialog-note">{t('tab.voidWhy')}</p>
          <ReasonPicker
            reasons={VOID_REASONS}
            label={(value) => t(`tab.voidReason.${value}`)}
            picked={reason}
            onPick={setReason}
            detail={detail}
            onDetail={setDetail}
            missing={tried && !complete}
          />
          <div className="ft-dialog-row">
            <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onClose}>
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="ft-btn ft-btn-danger-solid"
              onClick={() => {
                if (!complete) return setTried(true);
                props.onVoid(reason, reason === 'other' ? detail.trim() : undefined);
              }}
            >
              {t('tab.voidLine')}
            </button>
          </div>
        </>
      )}
    </TabDialog>
  );
}

export function CompDialog(props: {
  /** A line to comp, or null for a discount on the whole tab. */
  readonly line: TabLine | null;
  readonly formatDram: (amount: number) => string;
  readonly onApply: (input: {
    lineId: string | null;
    kind: AdjustmentKind;
    percent: number | null;
    amountDram: number | null;
    reason: string;
  }) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const [reason, setReason] = useState<(typeof COMP_REASONS)[number] | null>(null);
  const [detail, setDetail] = useState('');
  const [tried, setTried] = useState(false);
  const [percent, setPercent] = useState<number | null>(10);
  /** Whole dram, typed as digits only: a separator or a decimal never gets in. */
  const [amount, setAmount] = useState('');
  const line = props.line;

  const reasonText =
    reason === null ? '' : reason === 'other' ? detail.trim() : t(`tab.compReason.${reason}`);
  const amountDram = amount === '' ? 0 : Number(amount);
  const sizeMissing = line === null && percent === null && amountDram <= 0;

  const apply = () => {
    if (!reasonText || sizeMissing) return setTried(true);
    // The reason goes as words in the tablet's language, exactly as if the
    // manager had typed them: the diner reads it on their phone.
    props.onApply(
      line
        ? { lineId: line.id, kind: 'comp', percent: 100, amountDram: null, reason: reasonText }
        : {
            lineId: null,
            kind: 'discount',
            percent,
            amountDram: percent === null ? amountDram : null,
            reason: reasonText,
          },
    );
  };

  return (
    <TabDialog
      heading={line ? t('tab.compTitle', { name: line.name }) : t('tab.discountWhole')}
      onClose={props.onClose}
    >
      <p className="ft-dialog-note">{t('tab.compSeen')}</p>
      {line === null ? (
        <>
          <div className="ft-percents" role="group" aria-label={t('tab.discountSize')}>
            {DISCOUNT_PERCENTS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={percent === value}
                onClick={() => setPercent(value)}
              >
                {`${value} %`}
              </button>
            ))}
            <button type="button" aria-pressed={percent === null} onClick={() => setPercent(null)}>
              {t('tab.discountAmount')}
            </button>
          </div>
          {percent === null ? (
            <input
              className="ft-field"
              inputMode="numeric"
              aria-label={t('tab.discountAmountLabel')}
              value={amount}
              autoFocus
              onChange={(event) =>
                setAmount(event.target.value.replace(/\D/gu, '').replace(/^0+/u, '').slice(0, 8))
              }
            />
          ) : null}
          {tried && sizeMissing ? (
            <p className="ft-error" role="alert">
              {t('tab.enterAmount')}
            </p>
          ) : null}
        </>
      ) : null}
      <ReasonPicker
        reasons={COMP_REASONS}
        label={(value) => t(`tab.compReason.${value}`)}
        picked={reason}
        onPick={setReason}
        detail={detail}
        onDetail={setDetail}
        missing={tried && !reasonText}
      />
      <div className="ft-dialog-row">
        <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onClose}>
          {t('common:action.cancel')}
        </button>
        <button type="button" className="ft-btn ft-btn-primary" onClick={apply}>
          {line
            ? t('tab.compGive')
            : percent !== null
              ? t('tab.discountApplyPercent', { percent })
              : t('tab.discountApplyAmount', { amount: props.formatDram(amountDram) })}
        </button>
      </div>
    </TabDialog>
  );
}

export function AbandonDialog(props: {
  readonly amount: string;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const [typed, setTyped] = useState('');
  const fieldId = useId();
  const word = t('tab.markUnpaidWord');
  const matches = typed.trim().toLocaleUpperCase() === word;
  return (
    <TabDialog heading={t('tab.markUnpaidTitle')} alert onClose={props.onClose}>
      {/* The amount is in the warning, because "are you sure" without a
          number is a question nobody reads. */}
      <p className="ft-note ft-note-failure">{t('tab.markUnpaidWarn', { amount: props.amount })}</p>
      <label className="ft-field-label" htmlFor={fieldId}>
        {t('tab.markUnpaidType', { word })}
      </label>
      <input
        id={fieldId}
        className={`ft-field ${typed && !matches ? 'is-bad' : ''}`}
        autoComplete="off"
        value={typed}
        autoFocus
        onChange={(event) => setTyped(event.target.value)}
      />
      <div className="ft-dialog-row">
        <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onClose}>
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          className="ft-btn ft-btn-danger-solid"
          disabled={!matches}
          onClick={props.onConfirm}
        >
          {t('tab.markUnpaidConfirm')}
        </button>
      </div>
    </TabDialog>
  );
}
