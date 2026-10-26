import type {
  BranchConversations,
  ConversationSubjectRef,
  SentMessage,
  StaffConversation,
} from '../../contracts/messages';
import {
  branchConversationsFromWire,
  rethrowMessageRefusal,
  markReadBody,
  sendMessageBody,
  sentMessageFromWire,
  staffConversationFromWire,
  type WireBranchConversations,
  type WireStaffConversation,
  type WireStaffMessageResult,
} from '../messagesMapping';
import { NotFoundError } from '../../errors';
import type { StaffGateway } from '../../staffGateway';
import type { StaffHttpContext } from './context';

export function messagesMethods(
  ctx: StaffHttpContext,
): Pick<
  StaffGateway,
  'listConversations' | 'getStaffConversation' | 'sendStaffMessage' | 'markStaffConversationRead'
> {
  const { client } = ctx;
  return {
    // --- Messages with guests (2026-10-23) -----------------------------------
    //
    // Sends are online only, like the rail's actions; every refusal is read by
    // `messagesMapping.ts`. Kitchen and a platform admin writing get a plain
    // 403 `forbidden`, the client's `ForbiddenError`.

    async listConversations(branchId): Promise<BranchConversations> {
      const { data } = await client.get<WireBranchConversations>(
        `/api/branches/${branchId}/conversations`,
      );
      return branchConversationsFromWire(data);
    },

    async getStaffConversation(subject: ConversationSubjectRef): Promise<StaffConversation | null> {
      try {
        const { data } =
          subject.kind === 'takeaway'
            ? await client.get<WireStaffConversation>(
                `/api/takeaway-orders/${subject.id}/conversation`,
              )
            : await client.get<WireStaffConversation>(
                `/api/reservations/${subject.id}/conversation`,
              );
        return staffConversationFromWire(data, subject);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async sendStaffMessage(command): Promise<SentMessage> {
      const { id } = command.subject;
      const body = sendMessageBody(command);
      try {
        const { data } =
          command.subject.kind === 'takeaway'
            ? await client.post<WireStaffMessageResult>(
                `/api/takeaway-orders/${id}/conversation/messages`,
                body,
              )
            : await client.post<WireStaffMessageResult>(
                `/api/reservations/${id}/conversation/messages`,
                body,
              );
        return sentMessageFromWire(data);
      } catch (error) {
        rethrowMessageRefusal(error);
      }
    },

    async markStaffConversationRead(command): Promise<void> {
      const segment = command.kind === 'takeaway' ? 'takeaway-orders' : 'reservations';
      await client.post(`/api/${segment}/${command.id}/conversation/read`, markReadBody(command));
    },
  };
}
