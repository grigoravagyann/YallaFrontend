import {
  type PreOrderSettings,
  PRE_ORDER_MINUTES_BEFORE_MIN,
  PRE_ORDER_MINUTES_BEFORE_MAX,
} from '../../contracts/preOrder';
import { type MockViolation, validationFailed } from '../problems';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** The branch's pre-order settings. */
export function preOrdersMethods(
  ctx: ConsoleMockContext,
): Pick<ConsoleGateway, 'getPreOrderSettings' | 'savePreOrderSettings'> {
  const { menuFor, preOrderSettingsOf, preOrderSwitches, requireManagerAtBranch, wait } = ctx;
  return {
    // --- Pre-orders (2026-10-21) ----------------------------------------------

    async getPreOrderSettings(branchId): Promise<PreOrderSettings> {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/pre-order-settings`);
      return preOrderSettingsOf(branchId);
    },

    async savePreOrderSettings({ branchId, settings }): Promise<PreOrderSettings> {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/pre-order-settings`;
      requireManagerAtBranch(branchId, url);
      const dishes = menuFor(branchId).flatMap((category) => category.items);
      // Every field out of bounds named, nothing saved — as the server answers.
      const violations: MockViolation[] = [];
      if (
        !Number.isInteger(settings.minutesBefore) ||
        settings.minutesBefore < PRE_ORDER_MINUTES_BEFORE_MIN ||
        settings.minutesBefore > PRE_ORDER_MINUTES_BEFORE_MAX
      ) {
        violations.push({
          field: 'minutesBefore',
          message: `minutesBefore must be between ${PRE_ORDER_MINUTES_BEFORE_MIN} and ${PRE_ORDER_MINUTES_BEFORE_MAX}.`,
          bound: 'range',
          min: PRE_ORDER_MINUTES_BEFORE_MIN,
          max: PRE_ORDER_MINUTES_BEFORE_MAX,
        });
      }
      const unknown = settings.excludedMenuItemIds.filter(
        (id) => !dishes.some((dish) => dish.id === id),
      );
      if (unknown.length > 0) {
        violations.push({
          field: 'excludedMenuItemIds',
          message: `Not on this branch's menu: ${unknown.join(', ')}.`,
        });
      }
      if (violations.length > 0) throw validationFailed(url, violations);

      preOrderSwitches.set(branchId, {
        acceptsPreOrders: settings.acceptsPreOrders,
        minutesBefore: settings.minutesBefore,
      });
      // The whole list: every dish not named becomes pre-orderable again.
      const excluded = new Set(settings.excludedMenuItemIds);
      for (const dish of dishes) dish.excludedFromPreOrder = excluded.has(dish.id);
      return preOrderSettingsOf(branchId);
    },
  };
}
