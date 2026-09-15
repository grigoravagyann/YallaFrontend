import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';

/**
 * E2E_STACK=1 only: removes what the run made, and nothing else.
 *
 * The database is dropped only when its name is the `YallaE2E_<8 hex>` the config
 * generated, and the photo root only when it sits in the temp directory. Global
 * teardown runs before Playwright stops the backend, so the drop first takes the
 * database to single-user with ROLLBACK IMMEDIATE, which ends the API's own
 * connections instead of failing on them.
 */
export default function globalTeardown(): void {
  dropDatabase();
  removePhotoRoot();
}

function dropDatabase(): void {
  const name = process.env.E2E_DATABASE ?? '';
  if (!/^YallaE2E_[0-9a-f]{8}$/.test(name)) return;

  const sqlcmd = findSqlcmd();
  if (!sqlcmd) {
    console.warn(`e2e teardown: sqlcmd was not found, so database ${name} was left in place.`);
    return;
  }

  const server = process.env.E2E_SQL_SERVER ?? 'localhost';
  const query =
    `IF DB_ID(N'${name}') IS NOT NULL BEGIN ` +
    `ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END`;
  const result = spawnSync(sqlcmd, ['-S', server, '-E', '-C', '-b', '-Q', query], {
    encoding: 'utf8',
  });
  if (result.status === 0) {
    console.log(`e2e teardown: dropped database ${name}.`);
  } else {
    console.warn(
      `e2e teardown: could not drop database ${name}: ${(result.stderr || result.stdout || '').trim()}`,
    );
  }
}

function findSqlcmd(): string | null {
  const candidates = [
    process.env.E2E_SQLCMD,
    'sqlcmd',
    'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\sqlcmd.exe',
    '/opt/mssql-tools18/bin/sqlcmd',
    '/opt/mssql-tools/bin/sqlcmd',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-?'], { encoding: 'utf8' });
    if (!probe.error) return candidate;
  }
  return null;
}

function removePhotoRoot(): void {
  const root = process.env.E2E_PHOTO_ROOT;
  if (!root) return;
  const full = resolve(root);
  if (!full.startsWith(resolve(tmpdir()) + sep) || !existsSync(full)) return;
  rmSync(full, { recursive: true, force: true });
}
