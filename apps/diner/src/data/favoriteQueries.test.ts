import type { DinerProfileView, FavoriteBranch, YallaGateway } from '@yalla/api';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { favoriteIdsFor, useFavorites } from '../stores/favorites';
import { useSession } from '../stores/session';
import { resetDinerQueriesOnSessionChange } from './dinerScope';
import { installFavoritesSync } from './favoriteQueries';

/**
 * Favourites follow the account (K11): a heart flips at once and rolls back if
 * the server refuses, hearts made while signed out move into the account at
 * sign-in, and nobody else's hearts are ever shown on a shared phone.
 */

vi.mock('@react-native-async-storage/async-storage', () => {
  const memory = new Map<string, string>();
  return {
    default: {
      getItem: (key: string) => Promise.resolve(memory.get(key) ?? null),
      setItem: (key: string, value: string) => {
        memory.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        memory.delete(key);
        return Promise.resolve();
      },
    },
  };
});

function profileOf(dinerUserId: string, phoneE164: string): DinerProfileView {
  return {
    dinerUserId,
    username: null,
    email: null,
    phoneE164,
    phoneVerified: true,
    displayName: null,
    localeCode: 'en',
    hasPassword: true,
    photo: null,
  } as DinerProfileView;
}

const A = profileOf('diner-a', '+37491000001');
const B = profileOf('diner-b', '+37491000002');

function favorite(branchId: string): FavoriteBranch {
  return { branchId, createdAtUtc: '2026-09-14T10:00:00Z', listing: { branchId } as never };
}

/**
 * Whose token the requests carry. Set at sign-in, before the profile is read —
 * the order the app does it in — so a call made in between is still theirs.
 */
let tokenAccount = 'nobody';

/** A server that keeps each account's hearts apart, like the real one. */
function fakeServer() {
  const lists = new Map<string, string[]>();
  const account = () => tokenAccount;
  const listOf = () => lists.get(account()) ?? [];
  const gateway = {
    listFavorites: vi.fn(() => Promise.resolve(listOf().map(favorite))),
    addFavorite: vi.fn((id: string) => {
      lists.set(account(), [id, ...listOf().filter((x) => x !== id)]);
      return Promise.resolve();
    }),
    removeFavorite: vi.fn((id: string) => {
      lists.set(
        account(),
        listOf().filter((x) => x !== id),
      );
      return Promise.resolve();
    }),
    mergeFavorites: vi.fn((ids: readonly string[]) => {
      lists.set(account(), [...ids.filter((id) => !listOf().includes(id)), ...listOf()]);
      return Promise.resolve(listOf().map(favorite));
    }),
  };
  return { gateway, lists };
}

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** What every heart on screen shows right now. */
const hearts = () => favoriteIdsFor(useFavorites.getState(), useSession.getState().signedIn);

let queryClient: QueryClient;
let stops: (() => void)[] = [];

beforeEach(async () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSession.setState({ signedIn: false, profile: null, phoneE164: null, guestName: null });
  useFavorites.setState({ localIds: [], remoteIds: null });
  await useFavorites.persist.rehydrate();
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  queryClient.clear();
});

function signIn(profile: DinerProfileView): void {
  tokenAccount = profile.dinerUserId;
  useSession.getState().setVerified({ phoneE164: profile.phoneE164 });
  useSession.getState().setProfile(profile);
}

function install(
  gateway: Pick<
    YallaGateway,
    'listFavorites' | 'addFavorite' | 'removeFavorite' | 'mergeFavorites'
  >,
  onError = vi.fn(),
) {
  stops.push(resetDinerQueriesOnSessionChange(queryClient));
  stops.push(installFavoritesSync({ queryClient, gateway, onError }));
  return onError;
}

describe('favourites synced to the account', () => {
  it('A hearts a place; when the account changes to B, no heart of A is shown', async () => {
    const { gateway } = fakeServer();
    signIn(A);
    install(gateway);
    await flush();

    useFavorites.getState().toggle('b1');
    expect(hearts()).toEqual(['b1']);
    await flush();
    expect(gateway.addFavorite).toHaveBeenCalledWith('b1');
    expect(hearts()).toEqual(['b1']);

    useSession.getState().clear();
    signIn(B);
    expect(hearts()).toEqual([]);
    await flush();

    expect(hearts()).toEqual([]);
    expect(useFavorites.getState().localIds).toEqual([]);
  });

  it('forgets the hearts when a different account signs in over the last one', async () => {
    const { gateway, lists } = fakeServer();
    lists.set('diner-a', ['b1', 'b2']);
    signIn(A);
    install(gateway);
    await flush();
    expect(hearts()).toEqual(['b1', 'b2']);

    signIn(B);
    await flush();

    expect(hearts()).toEqual([]);
  });

  it('flips a heart at once and puts it back when the server refuses', async () => {
    const { gateway } = fakeServer();
    const refusal = new Error('too many favorites');
    gateway.addFavorite.mockImplementationOnce(() => Promise.reject(refusal));
    signIn(A);
    const onError = install(gateway);
    await flush();

    useFavorites.getState().toggle('b9');
    expect(hearts()).toEqual(['b9']);
    await flush();

    expect(hearts()).toEqual([]);
    expect(onError).toHaveBeenCalledWith(refusal);
  });

  it('un-saves at once and keeps it un-saved once the server agrees', async () => {
    const { gateway, lists } = fakeServer();
    lists.set('diner-a', ['b1']);
    signIn(A);
    install(gateway);
    await flush();

    useFavorites.getState().toggle('b1');
    expect(hearts()).toEqual([]);
    await flush();

    expect(gateway.removeFavorite).toHaveBeenCalledWith('b1');
    expect(hearts()).toEqual([]);
  });

  it('keeps hearts on the phone while signed out, and moves them into the account at sign-in', async () => {
    const { gateway, lists } = fakeServer();
    lists.set('diner-a', ['b1']);
    install(gateway);

    useFavorites.getState().toggle('b2');
    expect(hearts()).toEqual(['b2']);
    expect(gateway.addFavorite).not.toHaveBeenCalled();

    signIn(A);
    await flush();

    expect(gateway.mergeFavorites).toHaveBeenCalledWith(['b2'], undefined);
    expect(useFavorites.getState().localIds).toEqual([]);
    expect([...hearts()].sort()).toEqual(['b1', 'b2']);
  });

  it('keeps the phone hearts for next time when the merge fails', async () => {
    const { gateway } = fakeServer();
    gateway.mergeFavorites.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    install(gateway);
    useFavorites.getState().toggle('b2');

    signIn(A);
    await flush();

    expect(useFavorites.getState().localIds).toEqual(['b2']);
  });

  it("shows the phone's own hearts again after signing out, not the account's", async () => {
    const { gateway, lists } = fakeServer();
    lists.set('diner-a', ['b1']);
    signIn(A);
    install(gateway);
    await flush();
    expect(hearts()).toEqual(['b1']);

    useSession.getState().clear();
    await flush();

    expect(useFavorites.getState().remoteIds).toBeNull();
    expect(hearts()).toEqual([]);
  });
});
