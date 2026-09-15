import {
  staleTime,
  type BranchSearchQuery,
  type FavoriteBranch,
  type YallaGateway,
} from '@yalla/api';
import { QueryObserver, type QueryClient } from '@tanstack/react-query';
import { registerRemoteToggle, useFavorites } from '../stores/favorites';
import { useSession } from '../stores/session';
import { favoriteKeys } from './favoriteKeys';

/**
 * Favourites, synced to the diner's account (K11).
 *
 * Signed in, the account's list is a TanStack query over
 * `GET /api/diner/favorites`, kept alive here by an observer so every heart in
 * the app can read it — the Explore cards included, which never mount the
 * Favorites screen. A tap changes the heart at once and sends `PUT` or `DELETE`;
 * a refusal puts the heart back to what the server holds. Signed out, hearts
 * stay on the phone (`stores/favorites`) and are uploaded once, through the
 * bulk merge, when somebody signs in — then the phone's copy is cleared.
 *
 * The query's data is only ever what the server answered. Taps that have not
 * been confirmed live in an overlay and are mirrored, applied, into the store
 * the hearts subscribe to — so a heart needs neither a provider nor a listing
 * for a place it has only just saved.
 */

export { favoriteKeys };

type Position = NonNullable<BranchSearchQuery['position']>;

export interface FavoritesSyncDeps {
  readonly queryClient: QueryClient;
  readonly gateway: Pick<
    YallaGateway,
    'listFavorites' | 'addFavorite' | 'removeFavorite' | 'mergeFavorites'
  >;
  /** The phone's position, for distances on the list. Never prompts. */
  readonly position?: () => Position | null;
  /** A write or the merge failed — `SessionRevokedError` included. The heart is already rolled back. */
  readonly onError?: (error: unknown) => void;
}

interface Pending {
  readonly want: boolean;
  /** Which tap this is, so an older answer cannot overwrite a newer tap. */
  readonly token: number;
  /** The server accepted it; waiting only for the list to show it. */
  settled: boolean;
}

/** Start syncing. Returns the stop function. Call once, inside the app's providers. */
export function installFavoritesSync(deps: FavoritesSyncDeps): () => void {
  const { queryClient, gateway } = deps;
  const position = deps.position ?? (() => null);
  const onError = deps.onError ?? (() => undefined);
  const key = favoriteKeys.list();

  const pending = new Map<string, Pending>();
  const chains = new Map<string, Promise<unknown>>();
  let nextToken = 0;
  let merging = false;
  /**
   * Bumped whenever the session changes hands — a sign-in, a sign-out, another
   * account over the last. An answer that arrives in a later epoch belongs to
   * somebody who is no longer here and is dropped.
   */
  let epoch = 0;

  const listFn = () => gateway.listFavorites(position() ?? undefined);
  const serverList = () => queryClient.getQueryData<readonly FavoriteBranch[]>(key);

  /** What the hearts show: the server's list with every unconfirmed tap applied. */
  function effectiveIds(): string[] {
    const server = serverList()?.map((favorite) => favorite.branchId) ?? [];
    const added: string[] = [];
    const removed = new Set<string>();
    for (const [id, entry] of pending) {
      if (entry.want && !server.includes(id)) added.push(id);
      if (!entry.want) removed.add(id);
    }
    return [...added.reverse(), ...server.filter((id) => !removed.has(id))];
  }

  function publish(): void {
    if (!useSession.getState().signedIn) {
      useFavorites.getState().setRemote(null);
      return;
    }
    const known = serverList() !== undefined || pending.size > 0;
    useFavorites.getState().setRemote(known ? effectiveIds() : null);
  }

  /** Drop the taps the server's list now agrees with. */
  function reconcile(): void {
    const server = new Set(serverList()?.map((favorite) => favorite.branchId) ?? []);
    for (const [id, entry] of pending) {
      if (entry.settled && server.has(id) === entry.want) pending.delete(id);
    }
  }

  const observer = new QueryObserver<readonly FavoriteBranch[]>(queryClient, {
    queryKey: key,
    queryFn: listFn,
    enabled: useSession.getState().signedIn,
    staleTime: staleTime.frequent,
  });
  const stopObserver = observer.subscribe((result) => {
    if (result.error) onError(result.error);
    reconcile();
    publish();
  });

  function toggle(placeId: string): void {
    const want = !effectiveIds().includes(placeId);
    const token = (nextToken += 1);
    pending.set(placeId, { want, token, settled: false });
    publish();

    // One request at a time per place, in tap order, so the last tap is the
    // last thing the server hears.
    const send = (chains.get(placeId) ?? Promise.resolve()).then(() =>
      want ? gateway.addFavorite(placeId) : gateway.removeFavorite(placeId),
    );
    chains.set(
      placeId,
      send.catch(() => undefined),
    );

    send.then(
      () => {
        const entry = pending.get(placeId);
        if (!entry || entry.token !== token) return;
        entry.settled = true;
        if (!want) {
          queryClient.setQueryData<readonly FavoriteBranch[]>(key, (list) =>
            list?.filter((favorite) => favorite.branchId !== placeId),
          );
        } else {
          // The new row needs its listing, which only the server has.
          void queryClient.invalidateQueries({ queryKey: key });
        }
        reconcile();
        publish();
      },
      (error: unknown) => {
        const entry = pending.get(placeId);
        if (entry && entry.token === token) {
          pending.delete(placeId);
          publish();
        }
        onError(error);
      },
    );
  }

  /** Upload the hearts made while signed out, once, then forget the phone's copy. */
  async function mergeLocal(): Promise<void> {
    const session = useSession.getState();
    const ids = useFavorites.getState().localIds;
    if (merging || !session.signedIn || ids.length === 0) return;
    merging = true;
    // The profile may not be read yet (a sign-in sets the number first and the
    // profile after), so "the same account" is judged by the epoch, not the id.
    const started = epoch;
    try {
      const merged = await gateway.mergeFavorites(ids, position() ?? undefined);
      if (epoch !== started || !useSession.getState().signedIn) return;
      // A list read that left before the merge answers with the list before it;
      // landing after, it would take the uploaded hearts off again. Drop it.
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      if (epoch !== started) return;
      queryClient.setQueryData<readonly FavoriteBranch[]>(key, merged);
      useFavorites.getState().forgetLocal(ids);
      reconcile();
      publish();
    } catch (error) {
      // Kept on the phone for the next sign-in or launch; nothing is lost.
      onError(error);
    } finally {
      merging = false;
    }
  }

  function onSession(signedIn: boolean): void {
    observer.setOptions({
      queryKey: key,
      queryFn: listFn,
      enabled: signedIn,
      staleTime: staleTime.frequent,
    });
    if (!signedIn) pending.clear();
    publish();
    if (!signedIn) return;
    if (useFavorites.getState().hydrated) void mergeLocal();
  }

  let lastSignedIn = useSession.getState().signedIn;
  let lastAccount = useSession.getState().profile?.dinerUserId ?? null;
  const stopSession = useSession.subscribe((state) => {
    const account = state.profile?.dinerUserId ?? null;
    const changedAccount = account !== null && lastAccount !== null && account !== lastAccount;
    if (state.signedIn !== lastSignedIn || changedAccount) {
      epoch += 1;
      if (changedAccount) pending.clear();
      lastSignedIn = state.signedIn;
      onSession(state.signedIn);
    }
    if (account !== null) lastAccount = account;
    if (!state.signedIn) lastAccount = null;
  });

  // Hearts tapped before the phone's list was read still reach the account.
  const stopHydration = useFavorites.persist?.onFinishHydration?.(() => {
    if (useSession.getState().signedIn) void mergeLocal();
  });

  registerRemoteToggle(toggle);
  onSession(useSession.getState().signedIn);

  return () => {
    registerRemoteToggle(null);
    stopObserver();
    stopSession();
    stopHydration?.();
    observer.destroy();
  };
}
