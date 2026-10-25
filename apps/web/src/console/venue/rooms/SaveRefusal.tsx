import {
  ApiError,
  NotFoundError,
  ValidationError,
  describeFailure,
  isFloorPlanInvalid,
  type ReplaceFloorPlanCommand,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { violationLine } from './roomsMessages';

/**
 * A refused save, in the person's language, as a red banner.
 *
 * The server names photo and pin problems by their place in the payload —
 * `areas[1].photoIds[3]`, `tables[4].photoId` — so they are read back against
 * the command that was sent to name the room or the table.
 */
export function SaveRefusal({
  error,
  sent,
  onRetry,
}: {
  readonly error: unknown;
  readonly sent: ReplaceFloorPlanCommand | null;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);

  const banner = (children: ReactNode) => (
    <div className="yc-banner yc-banner-red" role="alert">
      {children}
    </div>
  );

  if (isFloorPlanInvalid(error)) {
    return banner(
      <div className="yc-grow">
        <p className="yc-rm-p">
          {error.duplicateLabels.length > 0
            ? t('rooms.warning.duplicates', { labels: error.duplicateLabels.join(', ') })
            : t('rooms.error.invalid')}
        </p>
        {/* The server's own sentences name the tables and rooms involved. */}
        <ul className="yc-rm-lines">
          {error.errors.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>,
    );
  }

  if (error instanceof ValidationError && error.violations.length > 0) {
    const lines = [...new Set(error.violations.map((v) => violationLine(t, v, sent)))];
    return banner(
      <ul className="yc-grow yc-rm-lines">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>,
    );
  }

  // A refusal the server explains itself, naming tables and bookings: a
  // table left out of the plan that still has upcoming bookings, say.
  if (error instanceof ApiError && error.status === 409 && error.problem?.detail) {
    return banner(<span className="yc-grow">{error.problem.detail}</span>);
  }

  if (error instanceof NotFoundError) {
    return banner(<span className="yc-grow">{t('rooms.error.photoNotFound')}</span>);
  }

  return (
    <div className="yc-card yc-ov-pad">
      <QueryFailureNotice
        error={error}
        offline={describeFailure(error) === 'offline'}
        onRetry={onRetry}
      />
    </div>
  );
}
