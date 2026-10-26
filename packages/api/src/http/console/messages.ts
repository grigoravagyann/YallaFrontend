import type {
  ConversationSubjectRef,
  MessageSettings,
  StaffConversation,
} from '../../contracts/messages';
import type { MessageHistoryPage } from '../../contracts/messageHistory';
import {
  messageSettingsBody,
  messageSettingsFromWire,
  staffConversationFromWire,
  type WireMessageSettings,
  type WireStaffConversation,
} from '../messagesMapping';
import {
  messageHistoryPageFromWire,
  messageHistoryParams,
  type WireMessageHistoryPage,
} from '../messageHistoryMapping';
import type { ConsoleGateway } from '../../consoleGateway';
import { NotFoundError } from '../../errors';
import { type ConsoleHttpContext, BRANCHES } from './context';

export function messagesMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  'getMessageSettings' | 'saveMessageSettings' | 'listMessageHistory' | 'getStaffConversation'
> {
  const { client } = ctx;
  return {
    // --- Messages with guests (2026-10-23) ---------------------------------------

    async getMessageSettings(branchId: string): Promise<MessageSettings> {
      const { data } = await client.get<WireMessageSettings>(
        `${BRANCHES}/${branchId}/message-settings`,
      );
      return messageSettingsFromWire(data);
    },

    async saveMessageSettings({ branchId, settings }): Promise<MessageSettings> {
      // All four, every time (`templates: null` is the default set). A `422
      // validation-failed` naming every bad field stays the client's
      // `ValidationError`.
      const { data } = await client.put<WireMessageSettings>(
        `${BRANCHES}/${branchId}/message-settings`,
        messageSettingsBody(settings),
      );
      return messageSettingsFromWire(data);
    },

    // --- Message history (2026-10-24) -----------------------------------------
    //
    // Read only, with the console's own session: nothing here marks a thread
    // read, so the tablet's unread counts stay as they are. A bad parameter is
    // a `422 validation-failed` naming every field — the client's
    // `ValidationError`.

    async listMessageHistory(branchId, query): Promise<MessageHistoryPage> {
      const { data } = await client.get<WireMessageHistoryPage>(
        `${BRANCHES}/${branchId}/conversations/history`,
        { query: messageHistoryParams(query) },
      );
      return messageHistoryPageFromWire(data, query);
    },

    async getStaffConversation(subject: ConversationSubjectRef): Promise<StaffConversation | null> {
      const id = encodeURIComponent(subject.id);
      try {
        const { data } =
          subject.kind === 'takeaway'
            ? await client.get<WireStaffConversation>(`/api/takeaway-orders/${id}/conversation`)
            : await client.get<WireStaffConversation>(`/api/reservations/${id}/conversation`);
        return staffConversationFromWire(data, subject);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },
  };
}
