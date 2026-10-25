import {
  type MessageSettings,
  DEFAULT_MESSAGE_SETTINGS,
  messageSettingsViolations,
  normalizeMessageTemplates,
  type StaffConversation,
} from '../../contracts/messages';
import { validationFailed } from '../problems';
import type { MessageHistoryPage } from '../../contracts/messageHistory';
import { ForbiddenError } from '../../errors';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** Guest message settings, message history and a conversation read from it. */
export function messagesMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  'getMessageSettings' | 'saveMessageSettings' | 'listMessageHistory' | 'getStaffConversation'
> {
  const { messageHistory, messageSettings, requireManagerAtBranch, role, wait } = ctx;
  return {
    // --- Messages with guests (2026-10-23) ----------------------------------------

    async getMessageSettings(branchId): Promise<MessageSettings> {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/message-settings`);
      return messageSettings.get(branchId) ?? DEFAULT_MESSAGE_SETTINGS;
    },

    async saveMessageSettings({ branchId, settings }): Promise<MessageSettings> {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/message-settings`;
      requireManagerAtBranch(branchId, url);
      // Every bad field named, nothing saved.
      const violations = messageSettingsViolations(settings);
      if (violations.length > 0) {
        throw validationFailed(
          url,
          violations.map((violation) => ({
            field: violation.field,
            message: violation.message,
            ...(violation.bound !== undefined ? { bound: violation.bound } : {}),
            ...(violation.min !== undefined ? { min: violation.min } : {}),
            ...(violation.max !== undefined ? { max: violation.max } : {}),
          })),
        );
      }
      const saved: MessageSettings = {
        guestsCanWrite: settings.guestsCanWrite,
        waitersCanWrite: settings.waitersCanWrite,
        templates: normalizeMessageTemplates(settings.templates),
        remindAfterMinutes: settings.remindAfterMinutes,
      };
      messageSettings.set(branchId, saved);
      return saved;
    },

    // --- Message history (2026-10-24) -------------------------------------------

    async listMessageHistory(branchId, query): Promise<MessageHistoryPage> {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/conversations/history`;
      requireManagerAtBranch(branchId, url);
      return messageHistory.list(url, branchId, query);
    },

    async getStaffConversation(subject): Promise<StaffConversation | null> {
      await wait();
      const segment = subject.kind === 'takeaway' ? 'takeaway-orders' : 'reservations';
      const url = `${URL_TAG}/${segment}/${subject.id}/conversation`;
      if (role === 'waiter' || role === 'kitchen') throw new ForbiddenError({ url });
      const found = messageHistory.thread(subject);
      if (!found) return null;
      // Another branch's thread is refused as the server refuses it, not hidden.
      requireManagerAtBranch(found.branchId, url);
      return found.thread;
    },
  };
}
