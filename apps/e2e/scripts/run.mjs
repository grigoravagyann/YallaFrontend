// `pnpm --filter @yalla/e2e test`: Playwright against a Yalla stack.
//
// The suite needs a backend and both web builds. With none configured it says so
// and exits 0, because the repository's `pnpm -r test` runs every package's
// `test` script in the unit-test job, where no stack exists. A job that exists to
// run this suite sets E2E_REQUIRED=1, and then a missing stack fails it rather
// than passing silently.
//
// Arguments after `test` are passed to `playwright test` unchanged.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const set = (name) => (process.env[name] ?? '').trim() !== '';
const configured = set('E2E_API_URL') || process.env.E2E_STACK === '1';

if (!configured) {
  const message =
    'e2e: not run, no stack is configured. Either point it at a running stack with ' +
    'E2E_API_URL, E2E_DINER_URL and E2E_CONSOLE_URL (scripts/e2e-local.sh does), or set ' +
    'E2E_STACK=1 with E2E_DINER_DIST and E2E_CONSOLE_DIST to have Playwright start the ' +
    'backend and serve the builds itself. See apps/e2e/README.md.';
  if (process.env.E2E_REQUIRED === '1') {
    console.error(message);
    process.exit(1);
  }
  console.log(message);
  process.exit(0);
}

const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const child = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
