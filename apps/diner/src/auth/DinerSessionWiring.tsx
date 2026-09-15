import { isSessionRevoked } from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { installFavoritesSync } from '../data/favoriteQueries';
import { usePosition } from '../places/positionStore';
import { useSession } from '../stores/session';
import { authSession } from './session';
import { watchSessionRevoked } from './sessionRevoked';
import { signOut } from './signOut';

/**
 * The per-account wiring that has to run for as long as the app does, mounted
 * once inside the providers:
 *
 * - **A revoked session signs the phone out** (K1). Whichever query or mutation
 *   hears `SessionRevokedError` first, the diner is signed out the same way the
 *   Profile tab does it and told why, with a way back in.
 * - **Favourites follow the account** (K11): the hearts' query, the optimistic
 *   taps and the merge of signed-out hearts at sign-in.
 */
export function DinerSessionWiring() {
  const { t } = useTranslation(['diner', 'common']);
  const router = useRouter();
  const queryClient = useQueryClient();
  const gateway = useGateway();
  const [revoked, setRevoked] = useState(false);

  useEffect(() => {
    const onRevoked = () => {
      // Already signed out — by this, or by deleting the account on purpose —
      // is not news worth a sheet.
      if (!useSession.getState().signedIn) return;
      setRevoked(true);
      void signOut(queryClient, authSession);
    };

    const stopWatching = watchSessionRevoked(queryClient, onRevoked);
    const stopFavorites = installFavoritesSync({
      queryClient,
      gateway,
      position: () => usePosition.getState().position,
      onError: (error) => {
        if (isSessionRevoked(error)) onRevoked();
      },
    });
    return () => {
      stopWatching();
      stopFavorites();
    };
  }, [queryClient, gateway]);

  return (
    <ConfirmSheet
      visible={revoked}
      title={t('auth.sessionRevoked.title')}
      body={t('auth.sessionRevoked.body')}
      confirmLabel={t('profile.logIn')}
      cancelLabel={t('action.close', { ns: 'common' })}
      onConfirm={() => {
        setRevoked(false);
        router.push('/auth/login');
      }}
      onCancel={() => setRevoked(false)}
    />
  );
}
