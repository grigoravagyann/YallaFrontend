import type {
  MyPerformanceQuery,
  MyResults,
  MyResultsQuery,
  StaffMemberPerformance,
} from '../../contracts/activity';
import {
  myPerformanceParams,
  myResultsFromWire,
  myResultsParams,
  staffMemberPerformanceFromWire,
  type WireMyResults,
  type WirePersonPerformance,
} from '../activityMapping';
import type { components } from '../../generated/schema';
import {
  staffNotificationSettingsFromWire,
  staffPushConfigFromWire,
  staffTodayFromWire,
  type WireStaffNotificationSettings,
  type WireStaffPushConfig,
  type WireStaffToday,
} from '../staffPhoneMapping';
import type { StaffGateway } from '../../staffGateway';
import type { StaffHttpContext } from './context';

type Schemas = components['schemas'];

export function phoneMethods(
  ctx: StaffHttpContext,
): Pick<
  StaffGateway,
  | 'getMyPerformance'
  | 'getMyResults'
  | 'unpairOwnPhone'
  | 'getPushConfig'
  | 'savePushSubscription'
  | 'deletePushSubscription'
  | 'getNotificationSettings'
  | 'saveNotificationSettings'
  | 'getToday'
> {
  const { client } = ctx;
  return {
    async getMyPerformance(query: MyPerformanceQuery): Promise<StaffMemberPerformance> {
      const { data } = await client.get<WirePersonPerformance>('/api/staff/me/performance', {
        query: myPerformanceParams(query),
      });
      return staffMemberPerformanceFromWire(data, {
        from: query.from,
        to: query.to,
        staffMemberId: '',
        list: query.list,
      });
    },

    async getMyResults(query: MyResultsQuery): Promise<MyResults> {
      const { data } = await client.get<WireMyResults>('/api/staff/me/results', {
        query: myResultsParams(query),
      });
      return myResultsFromWire(data, { from: query.from, to: query.to });
    },

    // --- The device itself: a personal phone, its pushes (2026-10-24) ---------

    async unpairOwnPhone() {
      await client.post<void>('/api/staff/device/unpair');
    },

    async getPushConfig() {
      const { data } = await client.get<WireStaffPushConfig>('/api/staff/push-config');
      return staffPushConfigFromWire(data);
    },

    async savePushSubscription(subscription) {
      await client.put<void>('/api/staff/device/push-subscription', {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      } satisfies Schemas['Yalla.Api.Endpoints.SaveStaffPushSubscriptionRequest']);
    },

    async deletePushSubscription() {
      await client.delete<void>('/api/staff/device/push-subscription');
    },

    async getNotificationSettings() {
      const { data } = await client.get<WireStaffNotificationSettings>(
        '/api/staff/device/notification-preferences',
      );
      return staffNotificationSettingsFromWire(data);
    },

    async saveNotificationSettings(settings) {
      const { data } = await client.put<WireStaffNotificationSettings>(
        '/api/staff/device/notification-preferences',
        {
          approvals: settings.approvals,
          guestMessages: settings.guestMessages,
          tableCalls: settings.tableCalls,
          takeaway: settings.takeaway,
          kitchenReady: settings.kitchenReady,
          bookingToCall: settings.bookingToCall,
          onlyDuringShift: settings.onlyDuringShift,
          ...(settings.locale ? { locale: settings.locale } : {}),
        } satisfies Schemas['Yalla.Api.Endpoints.SaveStaffNotificationPreferencesRequest'],
      );
      return staffNotificationSettingsFromWire(data);
    },

    async getToday(branchId) {
      const { data } = await client.get<WireStaffToday>('/api/staff/today', {
        ...(branchId ? { query: { branchId } } : {}),
      });
      return staffTodayFromWire(data);
    },
  };
}
