/**
 * Client-generated command ids.
 *
 * Every mutation the backend accepts carries a `clientCommandId`, generated
 * **once per user action** and reused on every retry. That is what makes a
 * flaky connection unable to create two bookings or open two tabs: the server
 * treats a repeat of the same id as the same command and returns the original
 * result rather than acting twice.
 *
 * The backend types the field as a `Guid` and rejects anything else with a 400,
 * so this is a real UUID and not the shorter `cmd_…` form the mocks used to
 * accept. `crypto.randomUUID` where the platform has it; Hermes does not ship
 * it, so a Math.random v4 is the fallback — uniqueness among one device's own
 * commands is all an idempotency key needs.
 */
export function newCommandId(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();

  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += hex[(Math.random() * 4) | 8];
    } else {
      out += hex[(Math.random() * 16) | 0];
    }
  }
  return out;
}

/** True when a value has the shape the backend's `Guid` binder will accept. */
export function isCommandId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
