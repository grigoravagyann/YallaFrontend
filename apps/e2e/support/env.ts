/**
 * Where the stack is, read from the environment `playwright.config.ts` settles.
 *
 * Credentials are read here and nowhere else, only from the environment, and are
 * never logged, attached to a report or written to disk. An assertion message
 * never quotes one either.
 */
function required(name: string): string {
  const value = (process.env[name] ?? '').trim();
  if (value === '') {
    throw new Error(`e2e: ${name} is not set. See apps/e2e/README.md.`);
  }
  return value.replace(/\/+$/, '');
}

function firstOf(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? '').trim();
    if (value !== '') return value;
  }
  throw new Error(
    `e2e: a platform admin is needed; set ${names.join(' or ')} to the backend's PlatformAdmin settings.`,
  );
}

export const env = {
  get apiUrl(): string {
    return required('E2E_API_URL');
  },
  get dinerUrl(): string {
    return required('E2E_DINER_URL');
  },
  get consoleUrl(): string {
    return required('E2E_CONSOLE_URL');
  },
  /** The backend's `PlatformAdmin:Email`. */
  adminEmail(): string {
    return firstOf('E2E_ADMIN_EMAIL', 'YALLA_CONTRACT_ADMIN_EMAIL');
  },
  /** The backend's `PlatformAdmin:Password`. */
  adminPassword(): string {
    return firstOf('E2E_ADMIN_PASSWORD', 'YALLA_CONTRACT_ADMIN_PASSWORD');
  },
};
