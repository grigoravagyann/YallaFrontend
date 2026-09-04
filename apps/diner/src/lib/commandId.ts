/**
 * Client-generated idempotency keys.
 *
 * Every command that changes something on the server carries one, generated
 * once and reused on every retry. That is what makes a flaky connection unable
 * to open two tabs, book two tables, or approve the same guest twice: the
 * backend treats a repeat of the same id as the same command, not a new one.
 *
 * Not a UUID, and deliberately not a dependency: the id only has to be unique
 * among the commands one device sends, and time plus randomness covers that.
 */
export function newCommandId(): string {
  return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
