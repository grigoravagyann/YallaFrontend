import { useTranslation } from '@yalla/i18n';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { EditorAction, EditorTable, PlanSnapshot } from './reducer';

export interface PropertiesPanelProps {
  readonly plan: PlanSnapshot;
  readonly selection: readonly string[];
  readonly dispatch: (action: EditorAction) => void;
  readonly onRegenerateQr: (table: EditorTable) => void;
  /** Labels the server named as offenders, so the field can say which. */
  readonly invalidLabels: readonly string[];
  readonly duplicateLabels: readonly string[];
}

/**
 * The properties of whatever is selected.
 *
 * One table shows every field. Several show only what can be set for all of
 * them at once — seats, shape, area, bookable — because a width box that
 * silently applies to eight tables is how a room gets flattened.
 */
export function PropertiesPanel({
  plan,
  selection,
  dispatch,
  onRegenerateQr,
  invalidLabels,
  duplicateLabels,
}: PropertiesPanelProps) {
  const { t } = useTranslation(['admin', 'common']);
  const tables = plan.tables.filter((table) => selection.includes(table.id));

  if (tables.length === 0) {
    return (
      <aside className="editor-panel">
        <h2>{t('floorPlan.properties.title')}</h2>
        <p className="muted small">{t('floorPlan.properties.none')}</p>
      </aside>
    );
  }

  const single = tables.length === 1 ? tables[0] : undefined;
  const patchAll = (patch: Partial<EditorTable>) => {
    for (const table of tables) dispatch({ type: 'updateTable', id: table.id, patch });
  };

  return (
    <aside className="editor-panel">
      <h2>
        {single
          ? t('floorPlan.properties.one', { label: single.label })
          : t('floorPlan.properties.many', { count: tables.length })}
      </h2>

      {single ? (
        <>
          <label className="labelled">
            {t('floorPlan.field.label')}
            <input
              className="field"
              value={single.label}
              onChange={(event) =>
                dispatch({
                  type: 'updateTable',
                  id: single.id,
                  patch: { label: event.target.value },
                })
              }
            />
          </label>
          {duplicateLabels.includes(single.label.trim().toLocaleLowerCase()) ? (
            <p className="error small">{t('floorPlan.error.duplicateLabel')}</p>
          ) : null}
          {invalidLabels.includes(single.label) ? (
            <p className="error small">{t('floorPlan.error.outsideCanvas')}</p>
          ) : null}
        </>
      ) : null}

      <div className="editor-fields">
        <label className="labelled">
          {t('floorPlan.field.seats')}
          <input
            className="field"
            type="number"
            min={1}
            value={single?.seats ?? ''}
            placeholder={single ? undefined : t('floorPlan.field.mixed')}
            onChange={(event) => patchAll({ seats: Math.max(1, Number(event.target.value) || 1) })}
          />
        </label>

        <label className="labelled">
          {t('floorPlan.field.shape')}
          <select
            value={single?.shape ?? ''}
            onChange={(event) => patchAll({ shape: event.target.value as EditorTable['shape'] })}
          >
            {single ? null : <option value="">{t('floorPlan.field.mixed')}</option>}
            <option value="rectangle">{t('floorPlan.shape.rectangle')}</option>
            <option value="round">{t('floorPlan.shape.round')}</option>
          </select>
        </label>

        {single ? (
          <>
            <label className="labelled">
              {t('floorPlan.field.width')}
              <input
                className="field"
                type="number"
                value={single.width}
                onChange={(event) =>
                  dispatch({
                    type: 'resize',
                    id: single.id,
                    rect: {
                      x: single.x,
                      y: single.y,
                      width: Number(event.target.value) || single.width,
                      height: single.height,
                    },
                  })
                }
              />
            </label>
            <label className="labelled">
              {t('floorPlan.field.height')}
              <input
                className="field"
                type="number"
                value={single.height}
                onChange={(event) =>
                  dispatch({
                    type: 'resize',
                    id: single.id,
                    rect: {
                      x: single.x,
                      y: single.y,
                      width: single.width,
                      height: Number(event.target.value) || single.height,
                    },
                  })
                }
              />
            </label>
            <label className="labelled">
              {t('floorPlan.field.rotation')}
              <input
                className="field"
                type="number"
                step={15}
                value={single.rotationDegrees}
                onChange={(event) =>
                  dispatch({
                    type: 'rotate',
                    id: single.id,
                    degrees: Number(event.target.value) || 0,
                    free: true,
                  })
                }
              />
            </label>
          </>
        ) : null}

        <label className="labelled">
          {t('floorPlan.field.area')}
          <select
            value={single?.floorAreaId ?? ''}
            onChange={(event) =>
              dispatch({
                type: 'assignArea',
                ids: tables.map((table) => table.id),
                floorAreaId: event.target.value || null,
              })
            }
          >
            <option value="">{t('floorPlan.field.noArea')}</option>
            {plan.areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>

        <label className="labelled inline">
          <input
            type="checkbox"
            checked={single?.isBookable ?? tables.every((table) => table.isBookable)}
            onChange={(event) => patchAll({ isBookable: event.target.checked })}
          />
          {t('floorPlan.field.bookable')}
        </label>
      </div>

      {single && !single.isActive ? (
        <div className="notice notice-offline">
          <p>{t('floorPlan.deactivated.body', { label: single.label })}</p>
          <button
            type="button"
            className="button button-small"
            onClick={() => dispatch({ type: 'reactivate', id: single.id })}
          >
            {t('floorPlan.deactivated.reactivate')}
          </button>
        </div>
      ) : null}

      {single ? <QrSection table={single} onRegenerate={() => onRegenerateQr(single)} /> : null}
    </aside>
  );
}

/**
 * The QR token: shown, copyable, printable — and never editable.
 *
 * The code on this square of paper is stuck to a physical table. An edit that
 * changed it would silently break the sticker, so the token is not a form
 * field, is not sent in the save payload, and changes only through the
 * explicit regenerate action below.
 */
function QrSection({ table, onRegenerate }: { table: EditorTable; onRegenerate: () => void }) {
  const { t } = useTranslation(['admin', 'common']);

  /*
   * Both pieces of state are keyed by the token they belong to, and read back
   * by comparison rather than reset in an effect. Selecting another table, or
   * regenerating this one's code, then cannot leave a stale QR image or a
   * "Copied" label attached to a token that is no longer on screen.
   */
  const [encoded, setEncoded] = useState<{ token: string; url: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const image = encoded?.token === table.qrToken ? encoded.url : null;
  const copied = copiedToken === table.qrToken;

  useEffect(() => {
    if (!table.qrToken) return;
    let cancelled = false;
    void QRCode.toDataURL(table.qrToken, { margin: 1, width: 208 }).then((url) => {
      if (!cancelled) setEncoded({ token: table.qrToken, url });
    });
    return () => {
      cancelled = true;
    };
  }, [table.qrToken]);

  if (!table.qrToken) {
    return (
      <section className="editor-qr">
        <h3>{t('floorPlan.qr.title')}</h3>
        {/* A table the editor has only ever held locally has no token yet, and
            inventing one would put a meaningless string under a copy button. */}
        <p className="muted small">{t('floorPlan.qr.pending')}</p>
      </section>
    );
  }

  const print = () => {
    const frame = window.open('', '_blank', 'width=420,height=560');
    if (!frame || !image) return;
    frame.document.write(
      `<!doctype html><title>${table.label}</title>` +
        `<body style="font-family:system-ui;text-align:center;padding:32px">` +
        `<h1 style="font-size:72px;margin:0 0 16px">${table.label}</h1>` +
        `<img src="${image}" alt="" style="width:240px;height:240px">` +
        `<p style="color:#555;font-size:12px;word-break:break-all">${table.qrToken}</p></body>`,
    );
    frame.document.close();
    frame.focus();
    frame.print();
  };

  return (
    <section className="editor-qr">
      <h3>{t('floorPlan.qr.title')}</h3>
      {image ? (
        <img className="editor-qr-code" src={image} alt="" width={104} height={104} />
      ) : null}
      <code className="editor-qr-token">{table.qrToken}</code>
      <div className="actions">
        <button
          type="button"
          className="button button-small"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(table.qrToken)
              .then(() => setCopiedToken(table.qrToken));
          }}
        >
          {copied ? t('floorPlan.qr.copied') : t('floorPlan.qr.copy')}
        </button>
        <button type="button" className="button button-small" disabled={!image} onClick={print}>
          {t('floorPlan.qr.print')}
        </button>
      </div>
      <button type="button" className="button button-small button-danger" onClick={onRegenerate}>
        {t('floorPlan.qr.regenerate')}
      </button>
    </section>
  );
}
