import { describeFailure } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { StyleProp, ViewStyle } from 'react-native';
import { ErrorState } from './ErrorState';

export interface QueryErrorStateProps {
  readonly error?: unknown;
  /**
   * The phone has no connection, so the query was paused rather than
   * attempted. There is no error to classify — and a diner staring at a
   * spinner needs telling more than one who got a 500 does.
   */
  readonly offline?: boolean | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A failed query, said by what went wrong.
 *
 * Mock data was instant and always succeeded; real data is neither. One
 * "something went wrong" for a dead wifi and a dead server sends the diner to
 * the wrong fix, so the failure is classified once (`describeFailure`, shared
 * with the web) and each kind gets its own words. "Not available yet" offers
 * no retry: trying again cannot make the backend grow an endpoint.
 */
export function QueryErrorState({ error, offline, onRetry, style }: QueryErrorStateProps) {
  const { t } = useTranslation('diner');
  const kind = offline ? 'offline' : describeFailure(error);

  if (kind === 'offline') {
    return <ErrorState offline {...(onRetry ? { onRetry } : {})} {...(style ? { style } : {})} />;
  }
  if (kind === 'unavailable') {
    return (
      <ErrorState
        title={t('net.notAvailable')}
        body={t('net.notAvailableBody')}
        {...(style ? { style } : {})}
      />
    );
  }
  return (
    <ErrorState
      title={kind === 'unauthorized' ? t('net.signedOut') : t('net.serverError')}
      {...(onRetry ? { onRetry } : {})}
      {...(style ? { style } : {})}
    />
  );
}
