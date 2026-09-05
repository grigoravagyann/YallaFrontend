import { describeFailure } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';

export interface QueryFailureNoticeProps {
  readonly error?: unknown;
  /**
   * The browser is offline, so the query was paused rather than attempted.
   * There is no error object to classify in that case — the state is known
   * from `fetchStatus`, and it still has to be said out loud.
   */
  readonly offline?: boolean | undefined;
  readonly onRetry?: (() => void) | undefined;
}

/**
 * The non-happy states, rendered the same way on every console screen.
 *
 * The failure is classified once by the client and each kind gets its own
 * words: offline is a dashed, calm notice with no red on it, because a dead
 * wifi is a state and not a fault; "not available yet" says the backend has no
 * such endpoint, so nobody debugs the UI for it; forbidden and signed-out are
 * told apart because the fix differs.
 */
export function QueryFailureNotice({ error, offline, onRetry }: QueryFailureNoticeProps) {
  const { t } = useTranslation(['admin', 'common']);
  const kind = offline ? 'offline' : describeFailure(error);

  const message =
    kind === 'offline'
      ? t('state.offline')
      : kind === 'unavailable'
        ? t('state.notAvailable')
        : kind === 'forbidden'
          ? t('state.forbidden')
          : kind === 'unauthorized'
            ? t('state.signedOut')
            : t('state.error');

  const canRetry = onRetry && kind !== 'unavailable' && kind !== 'forbidden';

  return (
    <div className={`notice notice-${kind}`} role={kind === 'offline' ? 'status' : 'alert'}>
      <p>{message}</p>
      {canRetry ? (
        <button type="button" className="button button-small" onClick={onRetry}>
          {t('state.retry')}
        </button>
      ) : null}
    </div>
  );
}
