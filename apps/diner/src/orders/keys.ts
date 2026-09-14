/**
 * The Orders tab's query keys, in a module with no imports so the sign-out and
 * session-scope tests can seed the very keys the screens use.
 *
 * Named apart from `data/orderQueries.ts`'s `orderKeys`, which are the tab's kitchen orders.
 */
export const dinerOrderKeys = {
  all: ['dinerOrders'] as const,
  list: () => ['dinerOrders', 'list'] as const,
  detail: (orderId: string) => ['dinerOrders', 'detail', orderId] as const,
};
