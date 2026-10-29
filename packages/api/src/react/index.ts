/**
 * TanStack Query hooks per endpoint group, shared by both apps.
 *
 * The gateway arrives through context rather than an import so the same hook
 * runs against the mock in one app and the real client in another, and so a
 * test can hand it a fake. Query keys are exported so an invalidation can never
 * miss a cache entry.
 *
 * No JSX here on purpose: this package stays a plain TypeScript library and the
 * provider is a `createElement` call.
 */

export { describeFailure } from '../errors';
export type { FailureKind } from '../errors';
export { useTelegramVerification } from './telegram';
export {
  afterAskOnMyWay,
  afterManagedOnMyWay,
  afterManagedPreOrderSaved,
  afterManagedRunningLate,
  afterOnMyWay,
  afterPreOrderAction,
  afterPreOrderSaved,
  afterPreOrderSettingsSaved,
  afterRunningLate,
  askOnMyWayOptions,
  clearPreOrderOptions,
  confirmOnMyWayOptions,
  duePreOrdersPollMs,
  preOrderMenuOptions,
  replacePreOrderOptions,
  reportRunningLateOptions,
  savePreOrderSettingsFresh,
  useAskOnMyWay,
  useClearManagedPreOrder,
  useClearPreOrder,
  useConfirmManagedOnMyWay,
  useConfirmOnMyWay,
  useDuePreOrders,
  useManagedPreOrderMenu,
  useMarkPreOrderNotComing,
  usePreOrderMenu,
  usePreOrderSettings,
  useReplaceManagedPreOrder,
  useReplacePreOrder,
  useReportManagedRunningLate,
  useReportRunningLate,
  useSavePreOrderSettings,
  useSendPreOrder,
} from './preOrders';
export {
  TAKEAWAY_AVAILABILITY_POLL_MS,
  TAKEAWAY_COUNTER_POLL_MS,
  TAKEAWAY_ORDER_ACTIVE_POLL_MS,
  TAKEAWAY_ORDER_SENT_POLL_MS,
  afterTakeawayAction,
  afterTakeawayOrderChanged,
  afterTakeawaySettingsSaved,
  afterTakeawaySignal,
  cancelTakeawayOrderOptions,
  placeTakeawayOrderOptions,
  takeawayActionOptions,
  takeawayAvailabilityOptions,
  takeawayOrderOptions,
  takeawayOrderPollMs,
  useAcceptTakeawayOrder,
  useCancelTakeawayOrder,
  useCollectTakeawayOrder,
  useDeclineTakeawayOrder,
  useMarkTakeawayOrderNoShow,
  useMarkTakeawayOrderReady,
  usePlaceTakeawayOrder,
  useSaveTakeawaySettings,
  useTakeawayAvailability,
  useTakeawayOrder,
  useTakeawayOrders,
  useTakeawaySettings,
} from './takeaway';
export {
  CONVERSATION_POLL_MS,
  STAFF_CONVERSATIONS_POLL_MS,
  UNREAD_MESSAGES_POLL_MS,
  afterGuestAnswered,
  afterGuestConversationRead,
  afterGuestMessageSent,
  afterMessageSettingsSaved,
  afterStaffConversationRead,
  afterStaffMessageSent,
  afterVenueAsked,
  appendPendingMessage,
  branchConversationsOptions,
  carryClientCommandIds,
  conversationPollMs,
  dinerConversationOptions,
  historyConversationOptions,
  messageHistoryOptions,
  dropPendingMessage,
  hasPendingMessages,
  markConversationReadOptions,
  markStaffConversationReadOptions,
  messageSettingsOptions,
  pendingMessage,
  saveMessageSettingsOptions,
  sendGuestMessageOptions,
  sendStaffMessageOptions,
  settleSentMessage,
  staffConversationOptions,
  unreadMessagesOptions,
  useBranchConversations,
  useDinerConversation,
  useHistoryConversation,
  useMarkConversationRead,
  useMarkReadWhenSeen,
  useMarkStaffConversationRead,
  useMessageHistory,
  useMessageSettings,
  useSaveMessageSettings,
  useSendGuestMessage,
  useSendStaffMessage,
  useStaffConversation,
  useUnreadMessages,
} from './messages';
export type { ConversationQueryOptions } from './messages';
export {
  activityOptions,
  activityTimelineOptions,
  claimServiceRequestOptions,
  myPerformanceOptions,
  myResultsOptions,
  staffMemberPerformanceOptions,
  staffPerformanceOptions,
  staffRecentOptions,
  transferTabOptions,
  transferTargetsOptions,
  useActivity,
  useActivityTimeline,
  useClaimServiceRequest,
  useMyPerformance,
  useMyResults,
  useStaffMemberPerformance,
  useStaffPerformance,
  useStaffRecent,
  useTransferTab,
  useTransferTargets,
} from './activity';
export type {
  TelegramVerification,
  TelegramVerificationStatus,
  UseTelegramVerificationOptions,
} from './telegram';
export { isOfflinePaused, useNow } from './clock';
export {
  GatewayProvider,
  useConsoleGateway,
  useGateway,
  usePublicGateway,
  useStaffGateway,
} from './gateways';
export type { GatewayProviderProps } from './gateways';
export { queryKeys } from './queryKeys';
export { usePhoneProofChannels, useRescheduleBooking, useVenue, useVenues } from './diner';
export {
  PARTY_SIZE_DEBOUNCE_MS,
  useDaySlots,
  useInvalidateFloor,
  useSlotFloor,
  useSlotFloors,
  useTableAvailability,
} from './availability';
export {
  useAddBranch,
  useAllConsoleVenues,
  useBranchesReadiness,
  useConsoleVenue,
  useConsoleVenues,
  useCreateVenue,
  useDeleteVenue,
  useManagedVenue,
  useRestoreVenue,
  useResumeVenue,
  useSetBranchFeatures,
  useApplyVenueFeatures,
  useSuspendVenue,
  useUpdateVenue,
  useVenueBookingsSummary,
} from './consoleVenues';
export {
  useBookingBlocks,
  useChangePlatformPassword,
  useLiftBookingBlock,
  useOutboxHealth,
  usePlatformActivity,
  usePlatformOverview,
  usePlatformProfile,
  useUpdatePlatformProfile,
} from './platformHome';
export {
  useChangeVenuePassword,
  useSignOutOtherVenueSessions,
  useUpdateVenueProfile,
  useVenueProfile,
  useVenueSessions,
} from './venueAccount';
export {
  useBranchReadiness,
  useDeleteTable,
  useEditorFloorPlan,
  useRegenerateTableQr,
  useSaveFloorPlan,
} from './floorPlan';
export {
  useSaveStaffNotificationSettings,
  useStaffNotificationSettings,
  useStaffPushConfig,
  useStaffToday,
} from './staffPhone';
export {
  useAbandonTab,
  useAdmitTab,
  useAwaitingApproval,
  useBeginClosing,
  useBookingsWithoutTable,
  useCompLine,
  useFloorApproveReservation,
  useFloorRejectReservation,
  useOpenTabForStaff,
  useOrderQueue,
  useReassignHost,
  useRecordCashPayment,
  useRejectTab,
  useReleaseReservation,
  useServiceRequests,
  useStaffFloor,
  useStaffMenu,
  useStaffTab,
  useTabLines,
  useTabsAwaitingAdmission,
  useUndoNoShow,
  useVoidLine,
  useVoidOrder,
} from './staffFloor';
export type { UseStaffMenuOptions } from './staffFloor';
export {
  useAdminMenu,
  useCreateCategory,
  useCreateMenuItem,
  useDeleteCategory,
  useDeleteMenuItem,
  useRemoveMenuItemPhoto,
  useReorderMenuCategories,
  useReorderMenuItems,
  useSetMenuItemAvailability,
  useUpdateCategory,
  useUpdateMenuItem,
  useUploadPhoto,
} from './menuAdmin';
export {
  useOpeningHours,
  useReservationPolicy,
  useReservationPolicyDefaults,
  useSaveOpeningHours,
  useSaveReservationPolicy,
  useSaveSpecialDays,
  useSpecialDays,
} from './branchSettings';
export {
  useBranchListing,
  usePublicProfile,
  useSaveBranchListing,
  useSavePublicProfile,
} from './publicProfile';
export {
  useExportReport,
  useMenuReport,
  useOccupancyReport,
  useReservationReport,
  useRevenueReport,
  useStaffReport,
} from './reports';
export {
  useClearPinLockout,
  useCreateStaff,
  useIssueStaffSignIn,
  useSetStaffPin,
  useStaff,
  useUpdateStaff,
} from './staff';
export { useBranchShifts, useBranchShiftsAhead, useShiftMutations } from './shifts';
export {
  useCreateEnrolmentCode,
  useCreatePhonePairing,
  useDevices,
  useRevokeDevice,
} from './devices';
export {
  useDismissReviewReports,
  usePlatformBranchReviews,
  useRemovePlatformReviewReply,
  useRestoreReviewReports,
  useReviewReply,
  useSetReviewVisibility,
  useSetVenueReviewVisibility,
  useVenueBranchReviews,
} from './reviews';
export { useApproveReservation, usePendingReservations, useRejectReservation } from './approvals';
export { useBookingAction, useBranchOverview } from './overview';
export {
  MANAGE_LINK_FAST_POLL_WITHIN_MS,
  MANAGE_LINK_ON_YOUR_WAY_LEAD_MS,
  MANAGE_LINK_POLL_MS,
  MANAGE_LINK_SLOW_POLL_MS,
  PUBLIC_REFRESH_MS,
  manageLinkPollMs,
  useCancelManagedBooking,
  useManagedBooking,
  usePublicBranch,
  usePublicBranchDetail,
  usePublicMenu,
  usePublicReviews,
  usePublicVenue,
  usePublicVenueListings,
  useRescheduleManagedBooking,
} from './publicBranch';
