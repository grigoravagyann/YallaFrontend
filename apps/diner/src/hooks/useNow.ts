/**
 * Re-exported, not defined here.
 *
 * The public web page needs the same ticking clock to decide whether its
 * free-table count is stale, so the hook moved into `@yalla/api/react` when the
 * second caller appeared. Every screen in this app imports it from here.
 */
export { useNow } from '@yalla/api/react';
