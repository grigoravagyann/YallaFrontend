import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SaveStaffNotificationSettings,
  StaffNotificationSettings,
} from '../contracts/staffPhone';
import { useStaffGateway } from './gateways';
import { queryKeys } from './queryKeys';

// --- The counter screen: a manager's phone ------------------------------------

/**
 * A manager's Today board (`GET /api/staff/today`), every 30 seconds while it
 * is in front. `branchId` undefined reads the session's own branch; an owner
 * or general manager on their own phone may name another of the venue's.
 */
export function useStaffToday(branchId: string | undefined, enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.staffToday(branchId ?? ''),
    queryFn: () => gateway.getToday(branchId),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    // Switching branch keeps the last board up until the next one answers.
    placeholderData: (previous) => previous,
  });
}

/** Whether this server sends staff pushes, and the VAPID key (`GET /api/staff/push-config`). */
export function useStaffPushConfig(enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.staffPushConfig,
    queryFn: () => gateway.getPushConfig(),
    enabled,
    // A Development server makes a new key every start; a minute is plenty.
    staleTime: 60_000,
  });
}

/** This device's push switches (`GET /api/staff/device/notification-preferences`). */
export function useStaffNotificationSettings(enabled = true) {
  const gateway = useStaffGateway();
  return useQuery({
    queryKey: queryKeys.staffNotificationSettings,
    queryFn: () => gateway.getNotificationSettings(),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Save the six switches (and the app's language). Optimistic: a switch moves
 * under the thumb, and moves back with the server's answer if it refused.
 */
export function useSaveStaffNotificationSettings() {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: SaveStaffNotificationSettings) =>
      gateway.saveNotificationSettings(settings),
    onMutate: async (settings) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.staffNotificationSettings });
      const before = queryClient.getQueryData<StaffNotificationSettings>(
        queryKeys.staffNotificationSettings,
      );
      if (before) {
        queryClient.setQueryData<StaffNotificationSettings>(queryKeys.staffNotificationSettings, {
          ...before,
          ...settings,
          locale: settings.locale ?? before.locale,
          isDefault: false,
        });
      }
      return { before };
    },
    onError: (_error, _settings, context) => {
      if (context?.before) {
        queryClient.setQueryData(queryKeys.staffNotificationSettings, context.before);
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.staffNotificationSettings, saved);
    },
  });
}
