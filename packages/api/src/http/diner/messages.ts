import type {
  ConversationSubjectRef,
  DinerConversation,
  DinerUnreadMessages,
  SentMessage,
} from '../../contracts/messages';
import {
  dinerConversationFromWire,
  rethrowMessageRefusal,
  markReadBody,
  sendMessageBody,
  sentMessageFromWire,
  unreadMessagesFromWire,
  type WireDinerConversation,
  type WireDinerMessageResult,
  type WireUnreadMessages,
} from '../messagesMapping';
import { NotFoundError } from '../../errors';
import type { YallaGateway } from '../../gateway';
import type { DinerHttpContext } from './context';

export function messagesMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  'getConversation' | 'sendGuestMessage' | 'markConversationRead' | 'getUnreadMessages'
> {
  const { client } = ctx;
  return {
    // --- Messages with the venue (2026-10-23) ---------------------------------
    //
    // The diner's own subjects only; somebody else's answers 404, as an id that
    // is no booking does. Every refusal is read by `messagesMapping.ts`.

    async getConversation(subject: ConversationSubjectRef): Promise<DinerConversation | null> {
      const id = encodeURIComponent(subject.id);
      try {
        const { data } =
          subject.kind === 'takeaway'
            ? await client.get<WireDinerConversation>(
                `/api/diner/takeaway-orders/${id}/conversation`,
              )
            : await client.get<WireDinerConversation>(`/api/diner/reservations/${id}/conversation`);
        return dinerConversationFromWire(data, subject);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async sendGuestMessage(command): Promise<SentMessage> {
      const id = encodeURIComponent(command.subject.id);
      const body = sendMessageBody(command);
      try {
        const { data } =
          command.subject.kind === 'takeaway'
            ? await client.post<WireDinerMessageResult>(
                `/api/diner/takeaway-orders/${id}/conversation/messages`,
                body,
              )
            : await client.post<WireDinerMessageResult>(
                `/api/diner/reservations/${id}/conversation/messages`,
                body,
              );
        return sentMessageFromWire(data);
      } catch (error) {
        rethrowMessageRefusal(error);
      }
    },

    async markConversationRead(command): Promise<void> {
      const id = encodeURIComponent(command.id);
      const segment = command.kind === 'takeaway' ? 'takeaway-orders' : 'reservations';
      await client.post(`/api/diner/${segment}/${id}/conversation/read`, markReadBody(command));
    },

    async getUnreadMessages(): Promise<DinerUnreadMessages> {
      const { data } = await client.get<WireUnreadMessages>('/api/diner/messages/unread');
      return unreadMessagesFromWire(data);
    },
  };
}
