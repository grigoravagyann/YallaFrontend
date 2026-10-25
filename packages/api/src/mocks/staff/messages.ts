import type { BranchConversations, StaffConversation, SentMessage } from '../../contracts/messages';
import type { StaffGateway } from '../../staffGateway';
import { type StaffMockContext } from './context';

/** Messages with guests, from the floor. */
export function messagesMethods(
  ctx: StaffMockContext,
): Pick<
  StaffGateway,
  'listConversations' | 'getStaffConversation' | 'sendStaffMessage' | 'markStaffConversationRead'
> {
  const {
    FLOOR_BRANCH,
    conversationUrl,
    conversations,
    requireSession,
    settle,
    staffName,
    staffRole,
  } = ctx;
  return {
    // --- Messages with guests (2026-10-23) -----------------------------------

    async listConversations(): Promise<BranchConversations> {
      requireSession('/api/branches/conversations');
      return settle(conversations.branchConversations(FLOOR_BRANCH));
    },

    async getStaffConversation(subject): Promise<StaffConversation | null> {
      requireSession(conversationUrl(subject));
      return settle(conversations.staffConversation(subject, staffRole));
    },

    async sendStaffMessage(command): Promise<SentMessage> {
      const url = conversationUrl(command.subject, '/messages');
      requireSession(url);
      return settle(
        conversations.sendAsVenue({
          url,
          ref: command.subject,
          role: staffRole,
          staffName,
          text: command.text,
          clientCommandId: command.clientCommandId,
        }),
      );
    },

    async markStaffConversationRead(subject): Promise<void> {
      const url = conversationUrl(subject, '/read');
      requireSession(url);
      conversations.readAsVenue(url, { kind: subject.kind, id: subject.id }, subject.upToUtc);
      return settle(undefined);
    },
  };
}
