import { useTranslation } from '@yalla/i18n';
import type { DraftTable } from './roomsModel';
import { TableQr } from './TableQr';

/** The selected table: its number, seats, bookable, QR code, unpin and delete. */
export function TablePanel({
  table,
  roomName,
  duplicate,
  onChange,
  onUnpin,
  onDelete,
  onRegenerateQr,
}: {
  readonly table: DraftTable;
  readonly roomName: string;
  readonly duplicate: boolean;
  readonly onChange: (patch: { label?: string; seats?: number; isBookable?: boolean }) => void;
  readonly onUnpin: () => void;
  readonly onDelete: () => void;
  readonly onRegenerateQr: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const noLabel = table.label.trim() === '';
  const labelError = noLabel
    ? t('rooms.table.noLabel')
    : duplicate
      ? t('rooms.table.duplicateLabel')
      : null;
  const where = [
    roomName,
    table.pin ? null : t('rooms.table.notOnPhoto'),
    table.status && table.status !== 'free' ? t(`common:tableStatus.${table.status}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section className="yc-card yc-rm-panel" aria-labelledby="rm-tp-h">
      <div>
        <h2 className="yc-h2 yc-h2-sm" id="rm-tp-h">
          {t('rooms.table.title', { label: table.label })}
        </h2>
        <p className="yc-cap">{where}</p>
      </div>
      <div className="yc-row2">
        <div className="yc-fld">
          <label htmlFor="rm-t-label">
            {t('rooms.field.label')}
            <span className="yc-req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="rm-t-label"
            className="yc-ctl"
            value={table.label}
            aria-invalid={labelError !== null}
            {...(labelError ? { 'aria-describedby': 'rm-t-label-err' } : {})}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </div>
        <div className="yc-fld">
          <label htmlFor="rm-t-seats">{t('rooms.field.seats')}</label>
          <input
            id="rm-t-seats"
            className="yc-ctl"
            type="number"
            min={1}
            max={99}
            inputMode="numeric"
            value={table.seats}
            onChange={(event) => {
              // A cleared field is someone about to type; only a real count is kept.
              const value = Number.parseInt(event.target.value, 10);
              if (Number.isInteger(value) && value >= 1) onChange({ seats: value });
            }}
          />
        </div>
      </div>
      {labelError ? (
        <span className="yc-err" id="rm-t-label-err">
          {labelError}
        </span>
      ) : null}
      <label className="yc-chk">
        <input
          type="checkbox"
          checked={table.isBookable}
          onChange={(event) => onChange({ isBookable: event.target.checked })}
        />
        {t('rooms.field.bookable')}
      </label>
      <div className="yc-sep" />
      <TableQr label={table.label} qrToken={table.qrToken} />
      {table.qrToken ? (
        <button type="button" id="rm-regen" className="yc-lnk yc-lnk-l" onClick={onRegenerateQr}>
          {t('rooms.qr.regenerate')}
        </button>
      ) : null}
      <div className="yc-sep" />
      {table.pin ? (
        <button type="button" className="yc-lnk yc-lnk-l" onClick={onUnpin}>
          {t('rooms.table.unpin')}
        </button>
      ) : null}
      <button type="button" className="yc-lnk yc-lnk-l yc-lnk-red" onClick={onDelete}>
        {t('rooms.table.delete')}
      </button>
    </section>
  );
}

/** The panel with no table selected. */
export function NoTablePanel() {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <section className="yc-card yc-rm-panel" aria-labelledby="rm-tp-h">
      <h2 className="yc-h2 yc-h2-sm" id="rm-tp-h">
        {t('rooms.table.panelTitle')}
      </h2>
      <p className="yc-muted yc-rm-none">{t('rooms.table.none')}</p>
    </section>
  );
}
