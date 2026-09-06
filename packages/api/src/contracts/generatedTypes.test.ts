import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Test 1: the guessed shapes are gone, and what replaced them is generated.
 *
 * `contracts/unshipped.ts` existed so that swapping guesses for generated types
 * would be one import path changing. It was renamed to `ordering.ts` when the
 * counter screen was wired, and the diner half of it was reconciled in this
 * task. A file that comes back — or an import that survives — would mean
 * somebody re-added a shape nothing on the wire produces, which is the whole
 * failure mode this file guards.
 *
 * This is a grep rather than a type assertion on purpose: a *missing* module
 * cannot be asserted about by the compiler, only its presence can.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const SEARCHED = ['packages', 'apps'];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.expo') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* sourceFiles(path);
      continue;
    }
    if (/\.tsx?$/u.test(entry)) yield path;
  }
}

describe('the swap to generated types', () => {
  it('leaves no reference to unshipped.ts anywhere in the monorepo', () => {
    const needle = ['un', 'shipped'].join('');
    const offenders: string[] = [];
    for (const root of SEARCHED) {
      for (const file of sourceFiles(join(ROOT, root))) {
        // This file names it in prose; everything else naming it is a caller.
        if (file === import.meta.filename) continue;
        if (readFileSync(file, 'utf8').includes(needle)) {
          offenders.push(file.slice(ROOT.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no file named unshipped.ts left to import', () => {
    const contracts = readdirSync(join(ROOT, 'packages', 'api', 'src', 'contracts'));
    expect(contracts).not.toContain('unshipped.ts');
  });

  /**
   * The diner's shapes are built by a mapper, not written by hand.
   *
   * The mappers are the single place a wire field becomes a client field, which
   * is what makes `pnpm api:generate` a compiler-checked step rather than an
   * afternoon of `undefined` on a bill. A contract that stopped being built from
   * `generated/schema.ts` would compile perfectly and be a guess again.
   */
  it('builds the diner tab and reservation shapes from the generated schema', () => {
    const mapper = readFileSync(
      join(ROOT, 'packages', 'api', 'src', 'http', 'dinerMapping.ts'),
      'utf8',
    );
    expect(mapper).toContain("from '../generated/schema'");
    expect(mapper).toContain("Schemas['Yalla.Application.Tabs.TabView']");
    expect(mapper).toContain("Schemas['Yalla.Application.Tabs.TabLineView']");
    expect(mapper).toContain("Schemas['Yalla.Application.Reservations.ReservationView']");
  });

  /**
   * And the diner gateway calls real endpoints for the whole ordering loop.
   *
   * Each of these six raised `EndpointNotWiredError` before this task. A
   * regression to that state would be invisible in a typecheck — the signature
   * is identical — and would show up as "not switched on for this place yet" on
   * a screen at a table.
   */
  it('wires the ordering loop to real paths rather than raising not-wired', () => {
    const gateway = readFileSync(
      join(ROOT, 'packages', 'api', 'src', 'http', 'httpGateway.ts'),
      'utf8',
    );

    for (const path of [
      '/menu`',
      '/api/tabs/${tabId}`',
      '/events`',
      '/orders`',
      '/shares`',
      '/settlement-mode`',
      '/service-requests`',
      "'/api/diner/devices'",
    ]) {
      expect(gateway, `expected the gateway to call ${path}`).toContain(path);
    }

    // The one endpoint the diner genuinely does not have. It is allowed to
    // remain, and nothing else is.
    const notWired = [...gateway.matchAll(/notWired\('(\w+)'/gu)].map((match) => match[1]);
    expect(new Set(notWired)).toEqual(new Set(['listVenues', 'getVenue']));
  });
});
