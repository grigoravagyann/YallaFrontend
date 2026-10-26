import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach } from 'vitest';

/**
 * Holds the gateway tests' stubbed wire to the backend's own swagger.
 *
 * ## Why
 *
 * `generated/schema.ts` types what the gateways read, and
 * `check-gateway-schema.mjs` checks the URLs and inline bodies they send. The
 * one side nothing checked was the tests' answers: a hand-written JSON body in a
 * stub is `unknown`, so a test could keep serving a field the backend renamed a
 * month ago and stay green — the mapper under test reading a shape the server
 * no longer sends, and the test proving it works.
 *
 * `fakeBackend` runs every exchange through here: the request body the gateway
 * sent against the route's request schema, and every 2xx body the stub answers
 * against the route's response schema for that status. A regenerated
 * `swagger.json` therefore fails `pnpm test` on every stub that no longer
 * matches — no annotation at the call site, nothing for a new test to forget.
 *
 * ## What is checked
 *
 * The subset of OpenAPI 3.0 the backend emits (`$ref`, single `allOf` wrappers,
 * `nullable`, `enum`, `type`, `required`, `properties`, `additionalProperties`,
 * `items`): a missing required field, an unknown one, a wrong type, a value
 * outside an enum, `null` where the schema does not allow it. `format` is not
 * checked — test ids such as `b-1` stand in for UUIDs on purpose.
 *
 * The route is found the way ASP.NET finds it: same method, same number of
 * segments, a literal segment beats a parameter.
 */

type Schema = Readonly<Record<string, unknown>>;

interface Operation {
  readonly requestBody?: { readonly content?: Readonly<Record<string, { schema?: Schema }>> };
  readonly responses?: Readonly<
    Record<string, { readonly content?: Readonly<Record<string, { schema?: Schema }>> }>
  >;
}

interface Swagger {
  readonly paths: Readonly<Record<string, Readonly<Record<string, Operation>>>>;
  readonly components: { readonly schemas: Readonly<Record<string, Schema>> };
}

interface Route {
  readonly method: string;
  readonly template: string;
  readonly segments: readonly (string | null)[];
  readonly operation: Operation;
}

const SWAGGER_FILE = join(import.meta.dirname, '..', 'generated', 'swagger.json');

let loaded: { swagger: Swagger; routes: Route[] } | undefined;

function swagger(): { swagger: Swagger; routes: Route[] } {
  if (loaded) return loaded;
  const document = JSON.parse(readFileSync(SWAGGER_FILE, 'utf8')) as Swagger;
  const routes: Route[] = [];
  for (const [template, operations] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      routes.push({
        method: method.toUpperCase(),
        template,
        segments: template
          .split('/')
          .filter(Boolean)
          .map((segment) => (segment.startsWith('{') ? null : segment)),
        operation,
      });
    }
  }
  loaded = { swagger: document, routes };
  return loaded;
}

/** The swagger route a request lands on, or `undefined` when the backend has none. */
export function routeFor(method: string, path: string): Route | undefined {
  const parts = path.split('/').filter(Boolean);
  let best: { route: Route; literals: number } | undefined;
  for (const route of swagger().routes) {
    if (route.method !== method || route.segments.length !== parts.length) continue;
    let literals = 0;
    const fits = route.segments.every((segment, index) => {
      if (segment === null) return true;
      if (segment !== decodeURIComponent(parts[index] ?? '')) return false;
      literals += 1;
      return true;
    });
    if (fits && (!best || literals > best.literals)) best = { route, literals };
  }
  return best?.route;
}

function resolve(schema: Schema): Schema {
  const ref = schema.$ref;
  if (typeof ref !== 'string') return schema;
  const name = ref.replace('#/components/schemas/', '');
  const target = swagger().swagger.components.schemas[name];
  if (!target) throw new Error(`swagger.json has no schema ${name}`);
  return resolve(target);
}

function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

/** Every way `value` breaks `schema`, as `$.path: problem` lines. */
export function violations(value: unknown, schema: Schema, at = '$'): string[] {
  const resolved = resolve(schema);

  if (value === null) {
    if (resolved.nullable === true || schema.nullable === true) return [];
    return [`${at}: null, but the schema does not allow null`];
  }

  const parts = resolved.allOf;
  if (Array.isArray(parts)) {
    return (parts as Schema[]).flatMap((part) => violations(value, part, at));
  }

  const enumeration = resolved.enum;
  if (Array.isArray(enumeration) && !enumeration.includes(value)) {
    return [`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(enumeration)}`];
  }

  const type = resolved.type;
  const kind = kindOf(value);
  if (typeof type === 'string') {
    const fits = type === kind || (type === 'number' && kind === 'integer');
    if (!fits) return [`${at}: expected ${type}, got ${kind} ${JSON.stringify(value)}`];
  }

  if (kind === 'array' && resolved.items) {
    return (value as unknown[]).flatMap((item, index) =>
      violations(item, resolved.items as Schema, `${at}[${index}]`),
    );
  }

  if (kind !== 'object') return [];

  const record = value as Readonly<Record<string, unknown>>;
  const properties = (resolved.properties ?? {}) as Readonly<Record<string, Schema>>;
  const required = (resolved.required ?? []) as readonly string[];
  const extra = resolved.additionalProperties;
  const found: string[] = [];

  for (const name of required) {
    if (!(name in record)) found.push(`${at}: missing required ${name}`);
  }
  for (const [name, item] of Object.entries(record)) {
    const property = properties[name];
    if (property) found.push(...violations(item, property, `${at}.${name}`));
    else if (extra === false) found.push(`${at}: ${name} is not in the schema`);
    else if (extra && typeof extra === 'object') {
      found.push(...violations(item, extra as Schema, `${at}.${name}`));
    }
  }
  return found;
}

function jsonSchema(
  content: Readonly<Record<string, { schema?: Schema }>> | undefined,
): Schema | undefined {
  return content?.['application/json']?.schema;
}

/** The JSON as it crosses the wire: `undefined` members dropped, dates as strings. */
function onTheWire(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/** What is wrong with a request body the gateway sent, against its route. */
export function requestViolations(route: Route, body: unknown): string[] {
  const schema = jsonSchema(route.operation.requestBody?.content);
  if (body === undefined) return [];
  if (!schema) return [`the route takes no JSON body, but the gateway sent one`];
  return violations(onTheWire(body), schema);
}

/** What is wrong with a stubbed answer, against the status its route declares. */
export function responseViolations(route: Route, status: number, body: unknown): string[] {
  const responses = route.operation.responses ?? {};
  const response = responses[String(status)];
  if (!response) {
    const declared = Object.keys(responses).filter((code) => code.startsWith('2'));
    return [`the route answers ${declared.join(' or ')} on success, never ${status}`];
  }
  if (body === undefined) return [];
  const content = response.content;
  if (!content) return [`the route answers ${status} with no body, but the stub sends one`];
  const schema = jsonSchema(content);
  // A non-JSON answer (the CSV exports) is checked only for being text.
  if (!schema) return typeof body === 'string' ? [] : [`expected a text body, got ${kindOf(body)}`];
  return violations(onTheWire(body), schema);
}

// --- The fetch boundary ------------------------------------------------------

/** Answers a test marked as deliberately off the schema; see {@link offSchema}. */
const excused = new WeakSet<object>();

/** What the current test's exchanges broke, reported when it ends. */
const found: string[] = [];

afterEach(() => {
  if (found.length === 0) return;
  const lines = found.splice(0);
  throw new Error(
    'A stubbed exchange does not match generated/swagger.json — fix the stub (or the gateway), ' +
      'or wrap a deliberate one in offSchema(…, why):\n  ' +
      lines.join('\n  '),
  );
});

/** Hand over (and clear) what was found so far — for the check's own tests. */
export function takeViolations(): string[] {
  return found.splice(0);
}

/**
 * Excuse one answer from the schema check, for a test whose point is a shape the
 * backend does not declare: a malformed body the gateway must survive, a status
 * an older server sent. `why` is required so the excuse reads as one.
 */
export function offSchema<T extends object>(answer: T, why: string): T {
  if (why.trim() === '') throw new Error('offSchema needs a reason');
  excused.add(answer);
  return answer;
}

/** Whether {@link offSchema} excused this answer. */
export function isOffSchema(answer: object): boolean {
  return excused.has(answer);
}

function urlOf(input: Parameters<typeof globalThis.fetch>[0]): URL {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

async function bodyOf(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.clone().text();
  } catch {
    return undefined;
  }
  if (text === '') return undefined;
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('json')) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function check(
  input: Parameters<typeof globalThis.fetch>[0],
  init: RequestInit | undefined,
  response: Response,
): Promise<void> {
  if (excused.has(response)) return;
  const url = urlOf(input);
  const method = (init?.method ?? 'GET').toUpperCase();
  const label = `${method} ${url.pathname}`;
  const route = routeFor(method, url.pathname);
  if (!route) {
    if (response.ok)
      found.push(`${label}: answered ${response.status}, but swagger.json has no such route`);
    return;
  }
  const sent = init?.body;
  if (typeof sent === 'string') {
    let body: unknown = sent;
    try {
      body = JSON.parse(sent) as unknown;
    } catch {
      // Not JSON: checked as the text it is.
    }
    for (const problem of requestViolations(route, body)) {
      found.push(`${label} (${route.template}) request: ${problem}`);
    }
  }
  if (!response.ok) return;
  for (const problem of responseViolations(route, response.status, await bodyOf(response))) {
    found.push(`${label} (${route.template}) ${response.status}: ${problem}`);
  }
}

/**
 * A fetch that checks every exchange against `swagger.json`: the request body
 * the gateway sent, and a 2xx answer the stub gave. `fakeBackend` uses it for
 * every route; a test that stubs `fetch` by hand passes its stub through it.
 * A violation fails the test when it ends, so a gateway that swallows the
 * answer cannot hide it.
 */
export function checkedFetch(inner: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await inner(input, init);
    await check(input, init, response);
    return response;
  };
}
