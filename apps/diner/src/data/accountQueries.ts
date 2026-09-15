import {
  staleTime,
  type DinerPhotoFile,
  type DinerProfileView,
  type DinerSignInResult,
  type LoginDinerCommand,
  type Photo,
  type RegisterDinerCommand,
  type SetDinerPasswordCommand,
  type UpdateDinerProfileCommand,
  type YallaGateway,
} from '@yalla/api';
import { useGateway } from '@yalla/api/react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSession } from '../stores/session';
import { resetDinerScopedQueries } from './dinerScope';

export const accountKeys = {
  /** `GET /api/diner/me` — one per device, dropped on sign-out. */
  profile: ['dinerProfile'] as const,
};

/** The profile into both the cache and the session store, which keeps the booking prefill in step. */
function storeProfile(queryClient: QueryClient, profile: DinerProfileView): void {
  queryClient.setQueryData(accountKeys.profile, profile);
  useSession.getState().setProfile(profile);
}

/**
 * The diner's account, read while signed in.
 *
 * Every answer lands in `useSession().profile`, which also brings the
 * remembered number, name and email in line with it — the booking form reads
 * those, not this query.
 */
export function useDinerProfile() {
  const gateway = useGateway();
  const signedIn = useSession((s) => s.signedIn);
  const query = useQuery({
    queryKey: accountKeys.profile,
    queryFn: () => gateway.getDinerProfile(),
    staleTime: staleTime.frequent,
    enabled: signedIn,
  });
  const data = query.data;
  useEffect(() => {
    if (signedIn && data) useSession.getState().setProfile(data);
  }, [signedIn, data]);
  return query;
}

/**
 * After register or log in: the token session is already running, so read
 * `/me` and sign the store in under the account's number. The number goes
 * through `setVerified` first, so a different person's remembered name is
 * dropped before the account's own arrives.
 */
async function signInWith(
  gateway: YallaGateway,
  queryClient: QueryClient,
  result: DinerSignInResult,
): Promise<DinerSignInResult> {
  queryClient.removeQueries({ queryKey: accountKeys.profile });
  const profile = await gateway.getDinerProfile();
  useSession.getState().setVerified({ phoneE164: profile.phoneE164 });
  storeProfile(queryClient, profile);
  // Bookings belong to whoever was signed in before; so do orders and reviews.
  void queryClient.invalidateQueries({ queryKey: ['bookings'] });
  resetDinerScopedQueries(queryClient);
  return result;
}

export function useRegisterDiner() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (command: RegisterDinerCommand) =>
      signInWith(gateway, queryClient, await gateway.registerDiner(command)),
  });
}

export function useLoginDiner() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (command: LoginDinerCommand) =>
      signInWith(gateway, queryClient, await gateway.loginDiner(command)),
  });
}

export function useUpdateDinerProfile() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: UpdateDinerProfileCommand) => gateway.updateDinerProfile(command),
    onSuccess: (profile) => storeProfile(queryClient, profile),
  });
}

/** Cached profile with one change, when there is a cached profile. */
function patchProfile(
  queryClient: QueryClient,
  change: (profile: DinerProfileView) => DinerProfileView,
): void {
  const current =
    queryClient.getQueryData<DinerProfileView>(accountKeys.profile) ??
    useSession.getState().profile;
  if (current) storeProfile(queryClient, change(current));
}

export function useSetDinerPassword() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: SetDinerPasswordCommand) => gateway.setDinerPassword(command),
    onSuccess: () => patchProfile(queryClient, (p) => ({ ...p, hasPassword: true })),
  });
}

export function useUploadDinerPhoto() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: DinerPhotoFile) => gateway.uploadDinerPhoto(file),
    onSuccess: (photo: Photo) => patchProfile(queryClient, (p) => ({ ...p, photo })),
  });
}

export function useRemoveDinerPhoto() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gateway.removeDinerPhoto(),
    onSuccess: () => patchProfile(queryClient, (p) => ({ ...p, photo: null })),
  });
}
