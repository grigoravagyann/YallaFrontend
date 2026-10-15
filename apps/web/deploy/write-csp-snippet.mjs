// Turns the policy the build wrote (dist/content-security-policy.txt) into a
// Caddyfile snippet that deploy/Caddyfile imports:
//
//   header Content-Security-Policy "default-src 'self'; ..."
//
// Caddy can send a header but cannot read one from a file at runtime, so the
// Dockerfile runs this once in the build stage, after `pnpm build:web`.
//
//   node write-csp-snippet.mjs <content-security-policy.txt> <csp.caddy>
import { readFileSync, writeFileSync } from 'node:fs';

const [policyPath, outPath] = process.argv.slice(2);
if (!policyPath || !outPath) {
  console.error('usage: write-csp-snippet.mjs <content-security-policy.txt> <csp.caddy>');
  process.exit(2);
}

const policy = readFileSync(policyPath, 'utf8').trim();
if (policy === '' || /[\r\n]/u.test(policy)) {
  console.error(`${policyPath}: expected exactly one non-empty line`);
  process.exit(1);
}

// A Caddyfile double-quoted token: backslash and double quote are the escapes.
// The policy has neither today (it quotes 'self' with single quotes), but a
// policy that grows one must not silently break the Caddyfile.
const quoted = policy.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');

writeFileSync(outPath, `header Content-Security-Policy "${quoted}"\n`);
console.log(`wrote ${outPath}: ${policy}`);
