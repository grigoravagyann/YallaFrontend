/**
 * Renders `src/generated/schema.ts` from the backend's OpenAPI document.
 *
 * Shared by `generate.mjs`, which writes the file, and
 * `check-generated-schema.mjs`, which fails when the committed file is not what
 * this renders from the committed `swagger.json` — that is, when someone edited
 * it by hand or committed one half of a regeneration.
 */
import openapiTS, { astToString } from 'openapi-typescript';

/**
 * The full text of `schema.ts`, banner included.
 *
 * @param {object} document the OpenAPI document, as `generate.mjs` writes it to `swagger.json`
 * @param {string} source where it was read from, for the banner
 */
export async function renderSchema(document, source) {
  const ast = await openapiTS(document, {
    additionalProperties: false,
    // The backend sends dram as integers and timestamps as ISO strings; leaving
    // these as `string`/`number` keeps the generated types honest.
    alphabetize: true,
  });

  const banner = [
    '/**',
    ' * GENERATED FILE — do not edit.',
    ' *',
    ` * Source: ${source}`,
    ' * Regenerate with: pnpm api:generate',
    ' */',
    '',
    '/* eslint-disable */',
    '',
  ].join('\n');

  return `${banner}${astToString(ast)}`;
}
