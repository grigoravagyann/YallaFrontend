import type { DinerNotificationPage } from '../../contracts/notifications';
import type { YallaGateway } from '../../gateway';
import type { components } from '../../generated/schema';
import { notificationPageFromWire, type WireNotificationPage } from '../placesMapping';
import type { DinerHttpContext } from './context';

type Schemas = components['schemas'];

export function notificationsMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  | 'listNotifications'
  | 'getUnreadNotificationCount'
  | 'markNotificationsRead'
  | 'registerPushDevice'
> {
  const { client } = ctx;
  return {
    // --- The notifications feed (K12) ------------------------------------------------

    async listNotifications(query): Promise<DinerNotificationPage> {
      const { data } = await client.get<WireNotificationPage>('/api/diner/notifications', {
        query: {
          ...(query?.before ? { before: query.before } : {}),
          ...(query?.limit !== undefined ? { limit: query.limit } : {}),
        },
      });
      return notificationPageFromWire(data);
    },

    async getUnreadNotificationCount(): Promise<number> {
      const { data } = await client.get<WireNotificationPage>('/api/diner/notifications', {
        query: { limit: 1 },
      });
      return data?.unreadCount ?? 0;
    },

    async markNotificationsRead(command): Promise<void> {
      await client.post('/api/diner/notifications/read', {
        upTo: command.upTo ?? null,
        ids: command.ids ? [...command.ids] : null,
      } satisfies Schemas['Yalla.Application.Diners.MarkNotificationsReadCommand']);
    },

    // --- Notifications --------------------------------------------------------

    async registerPushDevice({ pushToken, platform, locale }): Promise<{ deviceId: string }> {
      const { data } = await client.post<{ deviceId: string }>('/api/diner/devices', {
        pushToken,
        platform: platform === 'ios' ? 1 : 2,
        locale,
      } satisfies Schemas['Yalla.Api.Endpoints.RegisterDeviceRequest']);
      return { deviceId: data.deviceId };
    },
  };
}
