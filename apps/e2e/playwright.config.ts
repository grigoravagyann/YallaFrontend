import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

/**
 * Two ways to run, both configured from the environment.
 *
 * **A stack that is already running** (scripts/e2e-local.sh, the CI job):
 *   E2E_API_URL, E2E_DINER_URL, E2E_CONSOLE_URL, and the backend's platform admin
 *   in E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (YALLA_CONTRACT_ADMIN_* also accepted).
 *
 * **E2E_STACK=1**: Playwright starts it. The backend from E2E_BACKEND_DIR (default
 * ../Yalla-browse beside this repository) in Development, on a database of its
 * own that the global teardown drops, with a photo root in the temp directory;
 * and the two builds, served from E2E_DINER_DIST (an `expo export --platform web`
 * with EXPO_PUBLIC_DATA_SOURCE=real) and E2E_CONSOLE_DIST (a `vite build` with
 * VITE_DATA_SOURCE=real). Both builds must have been made with their API URL set
 * to http://localhost:$E2E_API_PORT, because each bakes it in.
 *
 * In stack mode the platform admin and the JWT signing key are made up for this
 * run: random, held in this process's environment, handed to the backend and to
 * the workers that way, and never printed or written anywhere.
 */
const here = dirname(fileURLToPath(import.meta.url));
const stack = process.env.E2E_STACK === '1';

if (stack) {
  const port = (name: string, fallback: number) => Number(process.env[name] ?? fallback);
  const apiPort = port('E2E_API_PORT', 5287);
  const dinerPort = port('E2E_DINER_PORT', 8297);
  const consolePort = port('E2E_CONSOLE_PORT', 5297);
  const run = randomBytes(4).toString('hex');

  process.env.E2E_API_URL ??= `http://localhost:${apiPort}`;
  process.env.E2E_DINER_URL ??= `http://127.0.0.1:${dinerPort}`;
  process.env.E2E_CONSOLE_URL ??= `http://127.0.0.1:${consolePort}`;
  process.env.E2E_ADMIN_EMAIL ??= `e2e-admin-${run}@yalla.test`;
  process.env.E2E_ADMIN_PASSWORD ??= randomBytes(24).toString('base64url');
  process.env.E2E_JWT_SIGNING_KEY ??= randomBytes(48).toString('base64');
  process.env.E2E_DATABASE ??= `YallaE2E_${run}`;
  process.env.E2E_PHOTO_ROOT ??= join(tmpdir(), `yalla-e2e-photos-${run}`);
}

const apiUrl = process.env.E2E_API_URL ?? '';
const dinerUrl = process.env.E2E_DINER_URL ?? '';
const consoleUrl = process.env.E2E_CONSOLE_URL ?? '';

function distDir(name: string): string {
  const value = (process.env[name] ?? '').trim();
  if (value === '') {
    throw new Error(
      `e2e: E2E_STACK=1 needs ${name}, the built app to serve. See apps/e2e/README.md.`,
    );
  }
  return resolve(value);
}

function portOf(url: string): string {
  return new URL(url).port;
}

const webServer = stack
  ? [
      {
        name: 'api',
        command: 'dotnet run --project src/Yalla.Api/Yalla.Api.csproj --no-launch-profile',
        cwd: resolve(process.env.E2E_BACKEND_DIR ?? join(here, '..', '..', '..', 'Yalla-browse')),
        url: `${apiUrl}/api/public/venues`,
        timeout: 360_000,
        reuseExistingServer: false,
        stdout: 'ignore' as const,
        stderr: 'pipe' as const,
        env: {
          ASPNETCORE_ENVIRONMENT: 'Development',
          ASPNETCORE_URLS: apiUrl,
          ConnectionStrings__Yalla:
            `Server=${process.env.E2E_SQL_SERVER ?? 'localhost'};Database=${process.env.E2E_DATABASE};` +
            'Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True',
          PlatformAdmin__Email: process.env.E2E_ADMIN_EMAIL ?? '',
          PlatformAdmin__Password: process.env.E2E_ADMIN_PASSWORD ?? '',
          Jwt__SigningKey: process.env.E2E_JWT_SIGNING_KEY ?? '',
          PhotoStorage__RootPath: process.env.E2E_PHOTO_ROOT ?? '',
          Auth__PasswordResetUrlTemplate: `${consoleUrl}/reset-password#token={token}`,
          DevSeed__Enabled: 'true',
          DevActor__Enabled: 'false',
          'Serilog__MinimumLevel__Override__Microsoft.EntityFrameworkCore.Database.Command':
            'Warning',
        },
      },
      {
        name: 'diner',
        command: `node scripts/serve-static.mjs --mode expo --port ${portOf(dinerUrl)} --root "${distDir('E2E_DINER_DIST')}"`,
        cwd: here,
        url: dinerUrl,
        timeout: 30_000,
        reuseExistingServer: false,
      },
      {
        name: 'console',
        command: `node scripts/serve-static.mjs --mode spa --port ${portOf(consoleUrl)} --root "${distDir('E2E_CONSOLE_DIST')}"`,
        cwd: here,
        url: consoleUrl,
        timeout: 30_000,
        reuseExistingServer: false,
      },
    ]
  : undefined;

export default defineConfig({
  testDir: 'specs',
  // One worker, in file order: the console spec changes the demo branch's cover,
  // which clears the table pins the diner specs read.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  ...(stack ? { globalTeardown: './support/globalTeardown.ts' } : {}),
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'Asia/Yerevan',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'diner',
      testDir: 'specs/diner',
      use: { baseURL: dinerUrl, viewport: { width: 390, height: 844 } },
    },
    {
      name: 'console',
      testDir: 'specs/console',
      use: { baseURL: consoleUrl, viewport: { width: 1280, height: 900 } },
    },
  ],
  ...(webServer ? { webServer } : {}),
});
