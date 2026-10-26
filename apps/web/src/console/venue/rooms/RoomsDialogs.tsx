import { ApiError, ConcurrencyConflictError, ProblemCodes, type Photo } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, useState, type FormEvent } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { Dialog } from '../../ui/Dialog';
import { PhotoPicker } from '../menu/PhotoPicker';
import type { DraftRoom, DraftTable } from './roomsModel';

/** A room's new name: not blank, and not another room's. */
export function RenameRoomDialog({
  room,
  taken,
  onCancel,
  onRename,
}: {
  readonly room: DraftRoom;
  readonly taken: (name: string) => boolean;
  readonly onCancel: () => void;
  readonly onRename: (name: string) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const fieldId = useId();
  const [name, setName] = useState(room.name);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    const refusal = !trimmed
      ? t('rooms.room.noName')
      : taken(trimmed)
        ? t('rooms.room.duplicateName')
        : null;
    if (refusal) {
      setProblem(refusal);
      document.getElementById(fieldId)?.focus();
      return;
    }
    onRename(trimmed);
  }

  return (
    <Dialog
      title={t('rooms.room.renameTitle', { name: room.name })}
      onClose={onCancel}
      returnFocusTo={() => document.querySelector<HTMLElement>(`[data-kebab="room-${room.id}"]`)}
    >
      <form className="yc-dialog-form" noValidate onSubmit={submit}>
        <div className="yc-fld">
          <label htmlFor={fieldId}>{t('rooms.room.name')}</label>
          <input
            id={fieldId}
            className="yc-ctl"
            value={name}
            maxLength={80}
            data-autofocus=""
            aria-invalid={problem !== null}
            {...(problem ? { 'aria-describedby': `${fieldId}-err` } : {})}
            onChange={(event) => {
              setName(event.target.value);
              setProblem(null);
            }}
          />
          {problem ? (
            <span className="yc-err" id={`${fieldId}-err`}>
              {problem}
            </span>
          ) : null}
        </div>
        <div className="yc-acts">
          <button type="button" className="yc-btn yc-btn-sec" onClick={onCancel}>
            {t('common:action.cancel')}
          </button>
          <button type="submit" className="yc-btn yc-btn-pri">
            {t('common:action.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Remove a room: what goes with it — its photos, and its tables off them — said first. */
export function RemoveRoomDialog({
  room,
  tableCount,
  onCancel,
  onConfirm,
}: {
  readonly room: DraftRoom;
  /** The room's tables in service. */
  readonly tableCount: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <Dialog
      alert
      title={t('rooms.room.removeTitle', { name: room.name })}
      description={`${
        room.photos.length > 0
          ? t('rooms.room.removePhotos', { count: room.photos.length })
          : t('rooms.room.removeNoPhotos')
      } ${
        tableCount > 0
          ? t('rooms.room.removeTables', { count: tableCount })
          : t('rooms.room.removeNoTables')
      }`}
      onClose={onCancel}
      returnFocusTo={() => document.querySelector<HTMLElement>(`[data-kebab="room-${room.id}"]`)}
    >
      <div className="yc-acts">
        <button type="button" className="yc-btn yc-btn-sec" data-autofocus="" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
        <button type="button" className="yc-btn yc-btn-danger" onClick={onConfirm}>
          {t('rooms.room.removeConfirm')}
        </button>
      </div>
    </Dialog>
  );
}

/** Remove a photo whose tables come off it: asked first, by name. */
export function RemovePhotoDialog({
  position,
  labels,
  onCancel,
  onConfirm,
}: {
  readonly position: number;
  readonly labels: readonly string[];
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <Dialog
      alert
      title={t('rooms.photos.removeTitle', { position })}
      description={t('rooms.photos.removeBody', {
        count: labels.length,
        labels: labels.join(', '),
      })}
      onClose={onCancel}
      returnFocusTo={() => document.querySelector<HTMLElement>('[data-kebab="room-photo"]')}
    >
      <div className="yc-acts">
        <button type="button" className="yc-btn yc-btn-sec" data-autofocus="" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
        <button type="button" className="yc-btn yc-btn-danger" onClick={onConfirm}>
          {t('rooms.photos.removeConfirm')}
        </button>
      </div>
    </Dialog>
  );
}

/** A table somebody is sitting at is not deleted: said, and nothing else offered. */
export function SeatedTableDialog({
  table,
  onClose,
}: {
  readonly table: DraftTable;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <Dialog
      alert
      title={t('rooms.delete.seatedTitle', { label: table.label })}
      description={t('rooms.delete.seated', { label: table.label })}
      onClose={onClose}
    >
      <div className="yc-acts">
        <button type="button" className="yc-btn yc-btn-pri" data-autofocus="" onClick={onClose}>
          {t('rooms.delete.understood')}
        </button>
      </div>
    </Dialog>
  );
}

/** Delete a table: removed when never used, taken out of service when it has history. */
export function DeleteTableDialog({
  table,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  readonly table: DraftTable;
  readonly pending: boolean;
  /** The delete's refusal, or `null`. */
  readonly error: unknown;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <Dialog
      alert
      title={t('rooms.delete.title', { label: table.label })}
      description={
        // Said before it happens: a table with history is kept for its
        // records and taken out of service, and the person should know
        // which of the two this click does.
        table.isDeletable ? t('rooms.delete.removeBody') : t('rooms.delete.deactivateBody')
      }
      onClose={onCancel}
      dismissible={!pending}
    >
      {error ? (
        error instanceof ConcurrencyConflictError &&
        error.code === ProblemCodes.ConflictingState ? (
          <p className="yc-alert" role="alert">
            {t('rooms.delete.seated', { label: table.label })}
          </p>
        ) : error instanceof ApiError && error.status === 409 && error.problem?.detail ? (
          // Any other refusal (upcoming bookings on the table, say) names
          // the tables and bookings itself: its own sentence is the answer.
          <p className="yc-alert" role="alert">
            {error.problem.detail}
          </p>
        ) : (
          <QueryFailureNotice error={error} onRetry={onConfirm} />
        )
      ) : null}
      <div className="yc-acts">
        <button
          type="button"
          className="yc-btn yc-btn-sec"
          data-autofocus=""
          disabled={pending}
          onClick={onCancel}
        >
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          className="yc-btn yc-btn-danger"
          aria-busy={pending}
          onClick={() => !pending && onConfirm()}
        >
          {table.isDeletable ? t('rooms.delete.confirm') : t('rooms.delete.confirmDeactivate')}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * Typed confirmation, because the consequence is physical: the sticker
 * already on that table stops working the moment this lands, and somebody
 * has to go and replace it.
 */
export function RegenerateDialog({
  table,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  readonly table: DraftTable;
  readonly busy: boolean;
  readonly error: unknown;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const fieldId = useId();
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === table.label.trim();
  return (
    <Dialog
      alert
      title={t('rooms.qr.regenerateTitle', { label: table.label })}
      description={t('rooms.qr.regenerateWarning', { label: table.label })}
      onClose={onCancel}
      dismissible={!busy}
      returnFocusTo={() => document.getElementById('rm-regen')}
    >
      <form
        className="yc-dialog-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!matches) {
            document.getElementById(fieldId)?.focus();
            return;
          }
          if (!busy) onConfirm();
        }}
      >
        <div className="yc-fld">
          <label htmlFor={fieldId}>{t('rooms.qr.typeLabel', { label: table.label })}</label>
          <input
            id={fieldId}
            className="yc-ctl"
            autoComplete="off"
            data-autofocus=""
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        {error ? <QueryFailureNotice error={error} /> : null}
        <div className="yc-acts">
          <button type="button" className="yc-btn yc-btn-sec" disabled={busy} onClick={onCancel}>
            {t('common:action.cancel')}
          </button>
          <button
            type="submit"
            className="yc-btn yc-btn-danger"
            aria-disabled={!matches || busy}
            aria-busy={busy}
          >
            {t('rooms.qr.regenerateConfirm')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** A photo for a room, uploaded through the menu's picker. */
export function AddPhotoDialog({
  branchId,
  onCancel,
  onUploaded,
}: {
  readonly branchId: string;
  readonly onCancel: () => void;
  readonly onUploaded: (photo: Photo) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <Dialog
      title={t('rooms.photos.addTitle')}
      description={t('rooms.photos.addBody')}
      onClose={onCancel}
      wide
    >
      <PhotoPicker branchId={branchId} photo={null} onChange={onUploaded} />
      <div className="yc-acts">
        <button type="button" className="yc-btn yc-btn-sec" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
      </div>
    </Dialog>
  );
}
