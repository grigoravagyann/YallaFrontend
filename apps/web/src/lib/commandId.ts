/**
 * Client-generated idempotency keys.
 *
 * Every command that changes something on the server carries one, generated
 * once per user action and reused on every retry, so a flaky connection cannot
 * create the same venue twice. The backend requires a real UUID, so this is
 * the shared generator rather than a local shortcut.
 */
export { newCommandId } from '@yalla/api';
