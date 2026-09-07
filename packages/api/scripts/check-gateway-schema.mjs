#!/usr/bin/env node
/**
 * Fails if a hand-written gateway asks for a route the backend does not serve,
 * or sends a body its declared shape refuses.
 *
 * ## Why
 *
 * `generated/schema.ts` is generated from the backend's own swagger and has been
 * right every time. The gateways next to it are written by hand, and five bugs
 * in a row came from the two drifting apart with nothing to notice:
 *
 * - the public page called `/api/public/venues/{v}/branches/{b}` where the
 *   backend serves `/api/public/branches/{venueSlug}/{branchSlug}` — every
 *   public route 404'd, on the page diners open from a QR code;
 * - `resolveVenue` called a by-slug venue route that has never existed;
 * - `getBranchMeta` called it keyed by slugs where the route takes a branch id;
 * - venue creation sent two of the nine fields `CreateBranchCommand` requires,
 *   so every attempt was a 400;
 * - the cancel route was sent a `clientCommandId` it does not accept.
 *
 * Every one was invisible until somebody opened a browser. All five are the same
 * shape as the i18n bug `check-used-keys.mjs` now catches: a reference to
 * something that is not there, in a language that cannot check it for you.
 *
 * ## What is checked
 *
 * **Every URL.** A `client.get|post|put|patch|delete` whose path is a string or
 * a template literal is resolved — including `${PLATFORM}`-style constants
 * declared in the same file — and matched against the route templates in
 * `generated/schema.ts`. A parameter matches a parameter or a literal segment; a
 * literal segment must be present in the route. No match is a failure.
 *
 * **Every body that is written inline.** For a write whose second argument is an
 * object literal, its keys are checked against the request schema: an unknown
 * key and a missing required one both fail, and nested object literals are
 * checked against the nested schema the same way.
 *
 * A body built elsewhere and passed by name is not knowable from here and is not
 * checked. That is the same over-approximation `check-used-keys.mjs` makes and
 * for the same reason: a check that reports working code gets switched off.
 *
 * ## Routes that genuinely do not exist yet
 *
 * A gateway may legitimately call ahead of the backend — `listVenues` has done
 * so since it was written, and degrades through `EndpointNotWiredError` rather
 * than pretending. Marking the call keeps it quiet:
 *
 *     // gateway-schema: awaiting-route — the browse feature has no backend yet
 *
 * The marker is checked in both directions, and the second is the point. If the
 * route turns up in `generated/schema.ts`, the marker is stale and the build
 * fails asking for it to be wired. That is exactly the state the public gateway
 * sat in for weeks: written against routes that did not exist, still saying so
 * in its own header long after they shipped, with every page 404ing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const GATEWAY_DIR = join(PACKAGE_ROOT, 'src', 'http');
const SCHEMA_FILE = join(PACKAGE_ROOT, 'src', 'generated', 'schema.ts');

const WRITE_METHODS = new Set(['post', 'put', 'patch']);

/** `client.get<Wire>(`, `client.post(` … capturing the method and the paren. */
const CALL_RE = /\bclient\.(get|post|put|patch|delete)\s*(?:<[^(]*?>)?\s*\(/gu;

/** Opts one call out, and is itself checked — see the header. */
const AWAITING_RE = /gateway-schema:\s*awaiting-route/u;

/** `const PLATFORM = '/api/platform';` — the prefixes gateways build URLs from. */
const CONST_RE = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'/gu;

/**
 * Everything between a call's parentheses, or `null` if they do not balance.
 * Quotes and escapes are tracked so a bracket inside a string does not end it.
 */
function balanced(source, openIndex) {
  let depth = 0;
  let quote = null;

  for (let i = openIndex; i < source.length; i += 1) {
    const character = source[i];

    if (quote !== null) {
      if (character === '\\') i += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') quote = character;
    else if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  return null;
}

/** Split an argument list on top-level commas only. */
function splitArguments(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (quote !== null) {
      if (character === '\\') i += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') quote = character;
    else if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth -= 1;
    else if (character === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim());
}

/**
 * A URL expression to a route template, or `null` when it is not a literal.
 *
 * `` `${BRANCHES}/${id}/menu` `` with `BRANCHES = '/api/branches'` becomes
 * `/api/branches/{}/menu`: known constants are substituted, and every remaining
 * interpolation is a parameter whose value cannot matter to the match.
 */
function routeTemplate(expression, constants) {
  const text = expression.trim();

  const plain = /^'([^']*)'$/u.exec(text);
  if (plain) return plain[1];

  if (!text.startsWith('`') || !text.endsWith('`')) return null;

  let out = '';
  const body = text.slice(1, -1);
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '$' && body[i + 1] === '{') {
      const end = body.indexOf('}', i);
      if (end === -1) return null;
      const inner = body.slice(i + 2, end).trim();
      // A bare constant is part of the path; anything else is a value in it.
      out += Object.hasOwn(constants, inner) ? constants[inner] : '{}';
      i = end;
      continue;
    }
    out += body[i];
  }
  return out;
}

/** `/api/x/{id}/y` -> `['api','x','{}','y']`, so a parameter compares equal to one. */
function segments(path) {
  return path
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith('{') && segment.endsWith('}') ? '{}' : segment));
}

function matches(routeSegments, schemaSegments) {
  if (routeSegments.length !== schemaSegments.length) return false;
  return routeSegments.every((segment, index) => {
    const other = schemaSegments[index];
    // A parameter on either side stands for any single segment.
    return segment === other || segment === '{}' || other === '{}';
  });
}

/** Top-level keys of an object literal, and the text of each nested literal. */
function objectLiteral(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  const inner = trimmed.slice(1, -1);
  const entries = new Map();

  for (const part of splitArguments(inner)) {
    // A trailing comma leaves an empty part. Skipping it matters more than it
    // looks: every multi-line body in this repo ends with one, so treating it as
    // unparseable silently excused all of them from the check.
    if (!part) continue;
    if (part.startsWith('...')) return null; // a spread hides the real keys
    const colon = (() => {
      let depth = 0;
      let quote = null;
      for (let i = 0; i < part.length; i += 1) {
        const character = part[i];
        if (quote !== null) {
          if (character === '\\') i += 1;
          else if (character === quote) quote = null;
          continue;
        }
        if (character === "'" || character === '"' || character === '`') quote = character;
        else if (character === '(' || character === '[' || character === '{') depth += 1;
        else if (character === ')' || character === ']' || character === '}') depth -= 1;
        else if (character === ':' && depth === 0) return i;
      }
      return -1;
    })();

    // `{ name }` shorthand names its own key.
    const key = (colon === -1 ? part : part.slice(0, colon)).trim().replace(/^['"]|['"]$/gu, '');
    if (!/^[A-Za-z_$][\w$]*$/u.test(key)) return null;
    entries.set(key, colon === -1 ? '' : part.slice(colon + 1).trim());
  }
  return entries;
}

// --- the generated contract -------------------------------------------------

const schemaSource = readFileSync(SCHEMA_FILE, 'utf8');

/** Route templates the backend serves, from the generated `paths` block. */
const schemaPaths = [...schemaSource.matchAll(/^\s{4}"(\/[^"]*)":\s*\{/gmu)].map(
  (match) => match[1],
);
if (schemaPaths.length === 0) {
  console.error('check-gateway-schema: no paths found in generated/schema.ts — regenerate it.');
  process.exit(1);
}
const schemaSegments = schemaPaths.map((path) => ({ path, parts: segments(path) }));

/**
 * The request body shapes, read from the live swagger rather than re-parsed out
 * of the generated TypeScript.
 *
 * `schema.ts` is a type declaration: its request bodies are structural types
 * with no `required` list a script can read back. The swagger document beside it
 * has both, and `api:generate` writes them from the same source in the same run,
 * so they cannot disagree. Absent, the URL half still runs.
 */
function readSwagger() {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'src', 'generated', 'swagger.json'), 'utf8'));
  } catch {
    return null;
  }
}

const bodies = readSwagger();

function schemaFor(swagger, name) {
  return swagger?.components?.schemas?.[name] ?? null;
}

function resolveRef(swagger, node) {
  if (!node) return null;
  if (node.$ref) return schemaFor(swagger, node.$ref.split('/').pop());
  if (Array.isArray(node.allOf)) {
    for (const part of node.allOf) {
      const resolved = resolveRef(swagger, part);
      if (resolved) return resolved;
    }
  }
  return node.properties || node.required ? node : null;
}

function requestSchema(swagger, path, method) {
  const operation = swagger?.paths?.[path]?.[method];
  const node = operation?.requestBody?.content?.['application/json']?.schema;
  return resolveRef(swagger, node);
}

/** Compare an inline literal against a schema, one level and then recursively. */
function checkBody(swagger, schema, literal, where, trail, problems) {
  if (!schema || !literal) return;

  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  for (const key of literal.keys()) {
    if (!Object.hasOwn(properties, key)) {
      problems.push(
        `${where}\n    sends "${trail}${key}", which the request schema does not declare`,
      );
    }
  }
  for (const key of required) {
    if (!literal.has(key)) {
      problems.push(`${where}\n    omits "${trail}${key}", which the request schema requires`);
    }
  }

  for (const [key, valueText] of literal) {
    const nested = resolveRef(swagger, properties[key]);
    if (!nested?.properties) continue;
    const nestedLiteral = objectLiteral(valueText);
    if (nestedLiteral)
      checkBody(swagger, nested, nestedLiteral, where, `${trail}${key}.`, problems);
  }
}

// --- the hand-written gateways ----------------------------------------------

const problems = [];
let urlsChecked = 0;
let bodiesChecked = 0;
let awaitingRoutes = 0;

const gatewayFiles = readdirSync(GATEWAY_DIR)
  .filter((name) => name.endsWith('.ts') && !name.includes('.test.') && !name.includes('Mapping'))
  .sort();

for (const name of gatewayFiles) {
  const file = join(GATEWAY_DIR, name);
  const source = readFileSync(file, 'utf8');
  const shown = relative(REPO_ROOT, file).replaceAll('\\', '/');

  const constants = Object.fromEntries(
    [...source.matchAll(CONST_RE)]
      .filter((match) => match[2].startsWith('/'))
      .map((match) => [match[1], match[2]]),
  );

  for (const call of source.matchAll(CALL_RE)) {
    const method = call[1];
    const open = call.index + call[0].length - 1;
    const args = balanced(source, open);
    if (args === null) continue;

    const parts = splitArguments(args);
    const route = routeTemplate(parts[0] ?? '', constants);
    // A URL assembled elsewhere is not knowable from here.
    if (route === null || !route.startsWith('/')) continue;

    const line = source.slice(0, call.index).split('\n').length;
    const where = `${shown}:${line}  ${method.toUpperCase()} ${route}`;
    urlsChecked += 1;

    // The lines just above the call, where a marker would sit.
    const preceding = source.slice(0, call.index).split('\n').slice(-4).join('\n');
    const awaiting = AWAITING_RE.test(preceding);

    const routeParts = segments(route);
    const hit = schemaSegments.find((candidate) => matches(routeParts, candidate.parts));

    if (!hit) {
      if (awaiting) {
        awaitingRoutes += 1;
        continue;
      }
      problems.push(`${where}\n    no such route in generated/schema.ts`);
      continue;
    }

    if (awaiting) {
      problems.push(
        `${where}\n    marked awaiting-route, but the backend serves "${hit.path}" now — ` +
          'wire it and drop the marker',
      );
      continue;
    }

    if (!bodies || !WRITE_METHODS.has(method)) continue;
    const literal = objectLiteral(parts[1] ?? '');
    if (!literal) continue;
    const schema = requestSchema(bodies, hit.path, method);
    if (!schema) continue;
    bodiesChecked += 1;
    checkBody(bodies, schema, literal, where, '', problems);
  }
}

if (problems.length > 0) {
  console.error('gateway-schema failed:\n');
  for (const problem of problems.sort()) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(
  `gateway-schema passed — ${urlsChecked - awaitingRoutes} of ${urlsChecked} gateway URLs ` +
    `resolve to routes in generated/schema.ts` +
    (awaitingRoutes > 0 ? `, ${awaitingRoutes} awaiting one` : '') +
    (bodies
      ? `, ${bodiesChecked} inline bodies match their request shape`
      : '; bodies not checked (no generated/swagger.json)') +
    '.',
);
