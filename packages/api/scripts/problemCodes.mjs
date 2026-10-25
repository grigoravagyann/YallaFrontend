/**
 * Renders `src/generated/problemCodes.ts` from the backend's `x-problem-codes`
 * OpenAPI extension.
 *
 * The backend declares every problem code once — on its constant in
 * `src/Yalla.Api/Errors/ErrorCodes.cs`, with the HTTP status it always answers
 * with, a one-line meaning and the members of its `context` — and publishes
 * that catalogue at the root of its OpenAPI document:
 *
 *     "x-problem-codes": {
 *       "takeaway-busy": {
 *         "name": "TakeawayBusy", "status": 409, "title": "Kitchen busy",
 *         "description": "…",
 *         "context": { "type": "object", "properties": { … }, "required": [ … ] }
 *       }
 *     }
 *
 * `openapi-typescript` does not read extensions, so this writes the TypeScript
 * half: the code constants (`ProblemCodes.TakeawayBusy`), each code's status, a
 * typed `context` interface per code and a map from code to context. Shared by
 * `generate.mjs`, which writes the file, and `check-problem-codes.mjs`, which
 * fails when the committed file is not what this renders from the committed
 * `swagger.json`.
 */

export const EXTENSION = 'x-problem-codes';

/** The catalogue in the document, or a readable failure. */
export function catalogueOf(document) {
  const catalogue = document?.[EXTENSION];
  if (!catalogue || typeof catalogue !== 'object' || Object.keys(catalogue).length === 0) {
    throw new Error(
      `the OpenAPI document has no "${EXTENSION}" extension — generate from a backend that publishes it`,
    );
  }
  return catalogue;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

function key(name) {
  return IDENTIFIER.test(name) ? name : `'${name}'`;
}

function comment(text) {
  return text.replace(/\*\//gu, '*\\/');
}

function contextName(entry) {
  return `${entry.name}ProblemContext`;
}

/** One schema as a TypeScript type, at `indent` for nested object literals. */
function typeOf(schema, indent) {
  let type;

  if (schema.$ref) {
    const id = schema.$ref.replace('#/components/schemas/', '');
    type = `components['schemas']['${id}']`;
  } else if (Array.isArray(schema.enum)) {
    type = schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  } else if (schema.type === 'array') {
    const item = typeOf(schema.items ?? {}, indent);
    type = `readonly (${item})[]`.replace(/^readonly \(([\w'[\]]+)\)\[\]$/u, 'readonly $1[]');
  } else if (schema.type === 'object') {
    type = objectOf(schema, indent);
  } else if (schema.type === 'string') {
    type = 'string';
  } else if (schema.type === 'integer' || schema.type === 'number') {
    type = 'number';
  } else if (schema.type === 'boolean') {
    type = 'boolean';
  } else {
    type = 'unknown';
  }

  return schema.nullable ? `${type} | null` : type;
}

function memberLines(schema, indent) {
  const required = new Set(schema.required ?? []);
  const pad = ' '.repeat(indent);
  const lines = [];

  for (const [name, member] of Object.entries(schema.properties ?? {})) {
    if (member['x-enum-name']) {
      const legend = member.enum
        .map((value, i) => `${value} ${member['x-enum-varnames']?.[i] ?? ''}`.trim())
        .join(', ');
      lines.push(`${pad}/** \`${member['x-enum-name']}\`: ${legend}. */`);
    }
    const optional = required.has(name) ? '' : '?';
    lines.push(`${pad}readonly ${key(name)}${optional}: ${typeOf(member, indent + 2)};`);
  }

  return lines;
}

function objectOf(schema, indent) {
  const lines = memberLines(schema, indent + 2);
  if (lines.length === 0) return 'Readonly<Record<string, unknown>>';
  return `{\n${lines.join('\n')}\n${' '.repeat(indent)}}`;
}

/** The whole file. `source` names where the document came from, for the banner. */
export function renderProblemCodes(document, source) {
  const catalogue = catalogueOf(document);
  const codes = Object.keys(catalogue).sort();
  const body = JSON.stringify(catalogue);
  const usesComponents = body.includes('"$ref"');

  const out = [
    '/**',
    ' * GENERATED FILE — do not edit.',
    ' *',
    ` * Source: ${source} (the \`${EXTENSION}\` extension)`,
    ' * Regenerate with: pnpm api:generate',
    ' *',
    ' * Every problem code the backend answers with. Each is declared once, on its',
    ' * constant in the backend’s `src/Yalla.Api/Errors/ErrorCodes.cs`: the slug, the',
    ' * HTTP status it always carries and the members of its `context`. Branch on',
    ' * `ProblemCodes.X`, never on a hand-typed slug, so a code the backend drops or',
    ' * renames is a compile error here rather than a branch that silently never runs.',
    ' *',
    ' * A context member that is not optional is present whenever `context` is; some',
    ' * codes answer without a context on some routes. Read values defensively all the',
    ' * same — an older server may lag behind this file.',
    ' */',
    '',
    '/* eslint-disable */',
    '',
  ];

  if (usesComponents) {
    out.push("import type { components } from './schema';", '');
  }

  out.push('/** Every problem code, by the name of its backend constant. */');
  out.push('export const ProblemCodes = {');
  for (const code of codes) {
    const entry = catalogue[code];
    out.push(`  /** ${entry.status} ${comment(entry.title)} — ${comment(entry.description)} */`);
    out.push(`  ${entry.name}: '${code}',`);
  }
  out.push('} as const;', '');

  out.push('/** Any problem code the backend declares. */');
  out.push('export type ProblemCode = (typeof ProblemCodes)[keyof typeof ProblemCodes];', '');

  out.push('/** The HTTP status each code always answers with. */');
  out.push('export const PROBLEM_CODE_STATUS = {');
  for (const code of codes) {
    out.push(`  '${code}': ${catalogue[code].status},`);
  }
  out.push('} as const satisfies { readonly [C in ProblemCode]: number };', '');

  for (const code of codes) {
    const entry = catalogue[code];
    if (!entry.context) continue;
    out.push(`/** \`${code}\` (${entry.status}): ${comment(entry.description)} */`);
    out.push(`export interface ${contextName(entry)} {`);
    out.push(...memberLines(entry.context, 2));
    out.push('}', '');
  }

  out.push('/** Each code’s `context`; `undefined` for a code that carries none. */');
  out.push('export interface ProblemContexts {');
  for (const code of codes) {
    const entry = catalogue[code];
    out.push(`  readonly '${code}': ${entry.context ? contextName(entry) : 'undefined'};`);
  }
  out.push('}', '');

  out.push('const ALL_CODES: ReadonlySet<string> = new Set(Object.values(ProblemCodes));', '');
  out.push('/** Whether a slug is one the backend declares. */');
  out.push('export function isProblemCode(code: unknown): code is ProblemCode {');
  out.push("  return typeof code === 'string' && ALL_CODES.has(code);");
  out.push('}', '');

  return out.join('\n');
}
