/**
 * The console's query hooks are the shared ones from `@yalla/api/react`,
 * bound to the gateways `bootstrap.tsx` puts in context. Nothing here is
 * console-specific yet; when it is, it goes below the re-export.
 */
export {
  queryKeys as keys,
  useConsoleVenue,
  useConsoleVenues,
  useCreateVenue,
  useDeleteVenue,
  useManagedVenue,
  useResumeVenue,
  useSuspendVenue,
} from '@yalla/api/react';
