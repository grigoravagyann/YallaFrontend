/**
 * Client-generated idempotency keys.
 *
 * Every command that changes something on the server carries one, generated
 * once and reused on every retry, so a flaky connection cannot create the same
 * venue twice. Not a UUID and deliberately not a dependency: the id only has to
 * be unique among the commands one browser sends.
 */
export function newCommandId(): string {
  return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
