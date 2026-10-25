import type { DinerConversation, SentMessage, DinerUnreadMessages } from '../../contracts/messages';
import { newCommandId } from '../../ids';
import { type DinerMockContext, MOCK_WAITER_NAME, URL_TAG, type MockGateway } from './context';

/** Messages with the venue, and the venue's side for tests and the demo. */
export function messagesMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'getConversation'
  | 'sendGuestMessage'
  | 'markConversationRead'
  | 'getUnreadMessages'
  | 'sendMessageAsVenue'
  | 'readConversationAsVenue'
  | 'setMessageSettingsAsVenue'
> {
  const { conversations, me, wait } = ctx;
  return {
    // --- Messages with the venue (2026-10-23) ------------------------------------

    async getConversation(subject): Promise<DinerConversation | null> {
      await wait();
      return conversations.guestConversation(subject, me());
    },

    async sendGuestMessage(command): Promise<SentMessage> {
      await wait();
      const segment = command.subject.kind === 'takeaway' ? 'takeaway-orders' : 'reservations';
      return conversations.sendAsGuest({
        url: `${URL_TAG}/api/diner/${segment}/${command.subject.id}/conversation/messages`,
        ref: command.subject,
        actor: me(),
        text: command.text,
        clientCommandId: command.clientCommandId,
      });
    },

    async markConversationRead(subject): Promise<void> {
      await wait();
      const segment = subject.kind === 'takeaway' ? 'takeaway-orders' : 'reservations';
      conversations.readAsGuest(
        `${URL_TAG}/api/diner/${segment}/${subject.id}/conversation/read`,
        { kind: subject.kind, id: subject.id },
        me(),
        subject.upToUtc,
      );
    },

    async getUnreadMessages(): Promise<DinerUnreadMessages> {
      await wait();
      return conversations.unread(me());
    },

    sendMessageAsVenue(subject, text, staffName) {
      const segment = subject.kind === 'takeaway' ? 'takeaway-orders' : 'reservations';
      return conversations.sendAsVenue({
        url: `${URL_TAG}/api/${segment}/${subject.id}/conversation/messages`,
        ref: subject,
        role: 'manager',
        staffName: staffName ?? MOCK_WAITER_NAME,
        text,
        clientCommandId: newCommandId(),
      });
    },

    readConversationAsVenue(subject) {
      const segment = subject.kind === 'takeaway' ? 'takeaway-orders' : 'reservations';
      conversations.readAsVenue(
        `${URL_TAG}/api/${segment}/${subject.id}/conversation/read`,
        subject,
      );
    },

    setMessageSettingsAsVenue(branchId, settings) {
      conversations.setSettings(
        `${URL_TAG}/api/branches/${branchId}/message-settings`,
        branchId,
        settings,
      );
    },
  };
}
