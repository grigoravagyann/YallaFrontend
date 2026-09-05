/**
 * Client-generated idempotency keys.
 *
 * Every command that changes something on the server carries one, generated
 * once per user action and reused on every retry. That is what makes a flaky
 * connection unable to open two tabs, book two tables, or approve the same
 * guest twice: the backend treats a repeat of the same id as the same command.
 *
 * The backend requires a real UUID, so this is the shared generator rather
 * than a local shortcut.
 */
export { newCommandId } from '@yalla/api';
