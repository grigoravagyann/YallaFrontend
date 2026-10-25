import { useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { transferTargetDetail, type TransferTarget } from '../transferTarget';
import { Confirm } from './panelParts';

/**
 * Who takes the table: the branch's people who serve, those on shift first,
 * none chosen until one is tapped, and the confirm naming them.
 */
export function TransferChoice({
  label,
  targets,
  failed,
  notYours,
  disabled,
  online,
  onTransfer,
  onCancel,
}: {
  readonly label: string;
  readonly targets: readonly TransferTarget[] | null;
  readonly failed: boolean;
  readonly notYours: boolean;
  readonly disabled: boolean;
  readonly online: boolean;
  readonly onTransfer: (target: TransferTarget) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const [chosen, setChosen] = useState<string | null>(null);
  const target = targets?.find((candidate) => candidate.staffMemberId === chosen) ?? null;
  const legendId = useId();
  return (
    <Confirm title={t('table.transfer.title', { label })}>
      <p className="tp-hint">{t('table.transfer.body')}</p>
      {failed ? (
        <p className="tp-hint is-failed" role="alert">
          {notYours ? t('table.transfer.notYours', { label }) : t('table.transfer.failed')}
        </p>
      ) : targets === null ? (
        <p className="tp-hint" role="status">
          {t('table.transfer.loading')}
        </p>
      ) : targets.length === 0 ? (
        <p className="tp-hint">{t('table.transfer.nobody')}</p>
      ) : (
        <div className="tp-choices" role="group" aria-labelledby={legendId}>
          <span id={legendId} className="tp-legend">
            {t('table.transfer.legend')}
          </span>
          {targets.map((candidate) => (
            <button
              key={candidate.staffMemberId}
              type="button"
              className="tp-choice tp-person"
              aria-pressed={chosen === candidate.staffMemberId}
              onClick={() => setChosen(candidate.staffMemberId)}
            >
              <b>{candidate.name}</b>
              <small>{transferTargetDetail(candidate, t)}</small>
            </button>
          ))}
        </div>
      )}
      {!online ? <p className="tp-hint">{t('table.transfer.needsOnline')}</p> : null}
      <div className="tp-row">
        <button type="button" className="tp-btn tp-sec" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          className="tp-btn tp-pri"
          disabled={disabled || target === null}
          onClick={() => {
            if (target) onTransfer(target);
          }}
        >
          {target
            ? t('table.transfer.confirmTo', { name: target.name.split(/\s+/u)[0] ?? target.name })
            : t('table.transfer.confirm')}
        </button>
      </div>
    </Confirm>
  );
}
