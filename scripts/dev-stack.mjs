#!/usr/bin/env node
/**
 * One command for the whole local stack: the .NET backend, the web app (console,
 * /staff tablet and phone PWA, public page) and the diner app's Metro server for
 * Expo Go. `pnpm dev:stack --help` lists the flags; docs/dev-stack.md explains them.
 *
 * Order: pre-flight (ports, tools, LAN address) -> backend build when sources are
 * newer than the output -> backend -> wait for GET /health to say Healthy -> web
 * and phone together -> a summary with every URL and a QR for Expo Go.
 *
 * Stopping: Ctrl+C (or one service dying, unless --keep-going) stops every child
 * and everything they started. On Windows that is a process-table snapshot plus
 * `taskkill /T /F`, because Vite and Metro start workers of their own and a
 * killed parent leaves them holding the port.
 *
 * Never reads the backend's user secrets: the backend loads them itself. Never
 * touches the connection string unless --db names a throwaway database.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import dgram from 'node:dgram';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectionString,
  DevStackError,
  descendantPids,
  lanCandidates,
  parseArgs,
  parseNetstatListeners,
  parseProcessCsv,
  parseTasklistCsv,
  publicPagePath,
  USAGE,
} from './dev-stack/lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIR = join(ROOT, 'apps', 'web');
const DINER_DIR = join(ROOT, 'apps', 'diner');
const IS_WINDOWS = process.platform === 'win32';
const started = Date.now();

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const color =
  !process.env.NO_COLOR && (Boolean(process.env.FORCE_COLOR) || Boolean(process.stdout.isTTY));
const paint = (/** @type {string} */ code, /** @type {string} */ text) =>
  color ? `\x1b[${code}m${text}\x1b[0m` : text;
const TAG_COLORS = { stack: '1;37', build: '35', api: '36', web: '32', phone: '33' };
const TAG_WIDTH = 5;

/** @param {keyof typeof TAG_COLORS} tag @param {string} line */
function log(tag, line) {
  process.stdout.write(`${paint(TAG_COLORS[tag], tag.padEnd(TAG_WIDTH))} │ ${line}\n`);
}
const note = (/** @type {string} */ line) => log('stack', line);
const warn = (/** @type {string} */ line) => log('stack', paint('33', line));

/** A message nobody scrolls past. */
function loud(/** @type {string} */ title, /** @type {string[]} */ lines = []) {
  const bar = '!'.repeat(72);
  const out = ['', bar, `  ${title}`, ...lines.map((l) => `  ${l}`), bar, ''];
  process.stderr.write(`${out.map((l) => paint('1;31', l)).join('\n')}\n`);
}

const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;

// ---------------------------------------------------------------------------
// Child processes
// ---------------------------------------------------------------------------
/**
 * @typedef {{
 *   name: 'build' | 'api' | 'web' | 'phone',
 *   child: import('node:child_process').ChildProcess,
 *   exited: boolean,
 *   code: number | null,
 *   tail: string[],
 *   oneShot: boolean,
 *   done: Promise<number>,
 * }} Service
 */
/** @type {Service[]} */
const services = [];
let stopping = false;
let shuttingDown = /** @type {Promise<never> | null} */ (null);
let keepGoing = false;
/** A second Ctrl+C: skip the grace period. */
let forceNow = false;

/**
 * Starts a process with its output prefixed. `oneShot` is a step expected to
 * exit (the build, the token CSS); anything else exiting is a crash.
 *
 * @param {Service['name']} name
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv, oneShot?: boolean, shell?: boolean }} options
 * @returns {Service}
 */
function launch(name, command, args, { cwd, env = process.env, oneShot = false, shell = false }) {
  const child = spawn(command, args, {
    cwd,
    env,
    shell,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    // Its own process group elsewhere, so the whole group can be signalled.
    detached: !IS_WINDOWS,
  });
  /** @type {(code: number) => void} */
  let settle = () => {};
  /** @type {Service} */
  const service = {
    name,
    child,
    exited: false,
    code: null,
    tail: [],
    oneShot,
    done: new Promise((r) => (settle = r)),
  };
  services.push(service);

  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream?.setEncoding('utf8');
    stream?.on('data', (/** @type {string} */ chunk) => {
      pending += chunk;
      const lines = pending.split(/\r\n|\n|\r/);
      pending = lines.pop() ?? '';
      for (const line of lines) emit(service, line);
    });
    stream?.on('end', () => {
      if (pending) emit(service, pending);
      pending = '';
    });
  }

  child.on('error', (error) => {
    emit(service, paint('31', `could not start ${command}: ${error.message}`));
  });
  child.on('exit', (code, signal) => {
    service.exited = true;
    service.code = code ?? (signal ? 1 : 0);
    settle(service.code);
    if (!oneShot) void onServiceExit(service, signal);
  });
  return service;
}

/** @param {Service} service @param {string} line */
function emit(service, line) {
  if (line.trim() === '') return;
  service.tail.push(line);
  if (service.tail.length > 60) service.tail.shift();
  log(service.name, line);
  if (service.name === 'api' && !telegramWarned && /Telegram getUpdates answered 409/.test(line)) {
    telegramWarned = true;
    warn(
      'another backend polls the same Telegram bot, and only one of them gets each update. ' +
        'Stop the other one, or restart this stack with --no-telegram.',
    );
  }
}
let telegramWarned = false;

/** @param {Service} service @param {NodeJS.Signals | null} signal */
async function onServiceExit(service, signal) {
  // Ctrl+C reaches every process on the console at once, so a child can report
  // its exit a moment before this process sees the signal. Give it that moment.
  await new Promise((r) => setTimeout(r, 600));
  if (stopping) {
    note(`${service.name} stopped`);
    return;
  }
  const code = service.code ?? 1;
  // Windows reports NTSTATUS values; 0xE0434352 is an unhandled .NET exception.
  const ntstatus =
    code > 255
      ? ` (0x${code.toString(16).toUpperCase()}${code === 0xe0434352 ? ', an unhandled .NET exception' : ''})`
      : '';
  const how = signal ? `was killed (${signal})` : `exited with code ${code}${ntstatus}`;
  loud(`${service.name.toUpperCase()} DIED: it ${how}.`, [
    ...crashHints(service),
    keepGoing && live().length > 0
      ? `--keep-going: ${live()
          .map((s) => s.name)
          .join(', ')} keep running. Ctrl+C stops them.`
      : 'Stopping everything else.',
  ]);
  if (!keepGoing || live().length === 0) await shutdown(code > 0 && code < 256 ? code : 1);
}

/** @param {Service} service */
function crashHints(service) {
  const text = service.tail.join('\n');
  const hints = [];
  if (/PlatformAdmin|Jwt:SigningKey|SigningKey/i.test(text)) {
    hints.push(
      'The backend wants its user secrets (Jwt:SigningKey, PlatformAdmin:Email, PlatformAdmin:Password).',
      'Set them once in the backend repo: see "Once per machine" in README.md.',
    );
  }
  if (
    /network-related|instance-specific|Login failed|Cannot open database|SqlException/i.test(text)
  ) {
    hints.push(
      'SQL Server refused or was not found. Is the service running? With --db, is --db-server right?',
    );
  }
  if (/EADDRINUSE|address already in use|Failed to bind/i.test(text)) {
    hints.push('Its port was taken after the pre-flight check. Something else started meanwhile.');
  }
  return hints;
}

const live = () => services.filter((s) => !s.exited && !s.oneShot);

/** Process table as pid/ppid rows. Empty when it cannot be read. */
function processTable() {
  try {
    if (IS_WINDOWS) {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId)" }',
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 15000 },
      );
      return parseProcessCsv(out);
    }
    const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' });
    return out
      .split('\n')
      .map((l) => l.trim().split(/\s+/).map(Number))
      .filter(([pid, ppid]) => pid > 0 && ppid >= 0)
      .map(([pid, ppid]) => ({ pid, ppid }));
  } catch {
    return [];
  }
}

const isAlive = (/** @type {number} */ pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM';
  }
};

/** @param {number} pid @param {boolean} tree */
function killPid(pid, tree) {
  if (IS_WINDOWS) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), ...(tree ? ['/T'] : []), '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      // Already gone.
    }
    return;
  }
  try {
    process.kill(tree ? -pid : pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

/**
 * Stops every child and everything below it, then exits.
 * @param {number} exitCode
 * @param {{ graceful?: boolean }} [options] graceful: the children already got
 *   Ctrl+C from the console and are given a few seconds to finish on their own
 */
function shutdown(exitCode, { graceful = false } = {}) {
  if (shuttingDown) return shuttingDown;
  stopping = true;
  shuttingDown = (async () => {
    const roots = services.map((s) => s.child.pid).filter((pid) => typeof pid === 'number');
    if (live().length > 0 || services.some((s) => !s.exited)) {
      note(graceful ? 'stopping (Ctrl+C again to force)...' : 'stopping...');
    }
    // Snapshot first: a parent that exits during the grace period leaves its
    // children with a parent id nobody holds, and they are found by that id.
    const before = processTable();
    const descendants = descendantPids(before, roots);

    if (!IS_WINDOWS) {
      for (const s of services) {
        if (!s.exited && s.child.pid) {
          try {
            process.kill(-s.child.pid, 'SIGTERM');
          } catch {
            // Gone.
          }
        }
      }
    }
    if (graceful || !IS_WINDOWS) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && services.some((s) => !s.exited) && !forceNow) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    for (const s of services) {
      if (!s.exited && s.child.pid) killPid(s.child.pid, true);
    }
    // Grandchildren whose parent is already gone: still in the table with the
    // same parent id as in the snapshot, so it is the same process.
    const leftovers = descendants.filter((pid) => isAlive(pid));
    /** @type {number[]} */
    const killed = [];
    if (leftovers.length > 0) {
      const now = new Map(processTable().map((r) => [r.pid, r.ppid]));
      const parentOf = new Map(before.map((r) => [r.pid, r.ppid]));
      for (const pid of leftovers) {
        if (now.get(pid) === parentOf.get(pid)) {
          killPid(pid, true);
          killed.push(pid);
        }
      }
    }

    await Promise.race([
      Promise.all(services.map((s) => s.done)),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    // Only what is known to be ours: an exited child's pid may already be reused.
    const stuck = [
      ...services.filter((s) => !s.exited).map((s) => /** @type {number} */ (s.child.pid)),
      ...killed.filter((pid) => isAlive(pid)),
    ];
    if (stuck.length > 0) {
      warn(`could not stop pid ${stuck.join(', ')}; stop it by hand (taskkill /PID <pid> /T /F).`);
    } else {
      note('all stopped.');
    }
    process.exit(exitCode >= 0 && exitCode < 256 ? exitCode : 1);
  })();
  return shuttingDown;
}

let interrupts = 0;
for (const signal of /** @type {NodeJS.Signals[]} */ ([
  'SIGINT',
  'SIGTERM',
  'SIGHUP',
  'SIGBREAK',
])) {
  process.on(signal, () => {
    interrupts += 1;
    if (interrupts > 1) {
      forceNow = true;
      return;
    }
    process.stdout.write('\n');
    void shutdown(0, { graceful: signal === 'SIGINT' || signal === 'SIGBREAK' });
  });
}
process.on('uncaughtException', (error) => {
  loud('dev:stack itself failed', [String(error?.stack ?? error)]);
  void shutdown(1);
});
// Last resort if something calls process.exit() before shutdown ran.
process.on('exit', () => {
  if (shuttingDown) return;
  for (const s of services) if (!s.exited && s.child.pid) killPid(s.child.pid, true);
});

// ---------------------------------------------------------------------------
// Pre-flight helpers
// ---------------------------------------------------------------------------
/** @param {number} port @param {string} host */
function tryListen(port, host) {
  return new Promise((done) => {
    const server = net.createServer();
    server.once('error', (/** @type {NodeJS.ErrnoException} */ error) => done(error.code ?? 'ERR'));
    server.listen({ port, host, exclusive: true }, () => server.close(() => done(null)));
  });
}

/** @param {number} port */
function answersOnLoopback(port) {
  return new Promise((done) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      done(false);
    });
    socket.once('error', () => done(false));
  });
}

/** Who listens on a port, as "pid 123 node.exe: <command line>". */
function describeHolders(/** @type {number} */ port) {
  try {
    if (!IS_WINDOWS) {
      const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
      });
      return out.trim().split('\n').slice(1);
    }
    const netstat = ['tcp', 'tcpv6']
      .map((proto) =>
        execFileSync('netstat', ['-ano', '-p', proto], { encoding: 'utf8', windowsHide: true }),
      )
      .join('\n');
    return parseNetstatListeners(netstat, port).map((pid) => {
      let name = '?';
      let commandLine = '';
      try {
        const csv = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
          encoding: 'utf8',
          windowsHide: true,
        });
        name = parseTasklistCsv(csv).get(pid) ?? '?';
        commandLine = execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
          ],
          { encoding: 'utf8', windowsHide: true, timeout: 10000 },
        ).trim();
      } catch {
        // Best effort.
      }
      const short = commandLine.length > 140 ? `${commandLine.slice(0, 137)}...` : commandLine;
      return `pid ${pid} ${name}${short ? `: ${short}` : ''}`;
    });
  } catch {
    return [];
  }
}

/** @param {number} port @param {string} label */
async function checkPortFree(port, label) {
  const results = await Promise.all([tryListen(port, '0.0.0.0'), tryListen(port, '::')]);
  const inUse = results.includes('EADDRINUSE') || (await answersOnLoopback(port));
  if (inUse) {
    const holders = describeHolders(port);
    return [
      `${label} port ${port} is already in use${holders.length ? ' by:' : '.'}`,
      ...holders.map((h) => `  ${h}`),
      holders.some((h) =>
        /YallaFrontend|yalla-dev-stack|Yalla\.Api\.dll|apps[\\/](web|diner)/i.test(h),
      )
        ? '  It looks like a leftover dev server. Stop it: taskkill /PID <pid> /T /F'
        : `  Stop it, or pick another port (--${label === 'metro' ? 'metro' : label}-port).`,
    ];
  }
  if (results.includes('EACCES')) {
    return [
      `${label} port ${port} cannot be bound (EACCES). Windows reserves some ranges for Hyper-V/WSL:`,
      '  netsh interface ipv4 show excludedportrange protocol=tcp',
      `  Pick a port outside them (--${label}-port).`,
    ];
  }
  return null;
}

/** The address the OS would use for an outbound connection: the default route's adapter. */
function routeAddress() {
  return new Promise((done) => {
    const socket = dgram.createSocket('udp4');
    const finish = (/** @type {string | null} */ value) => {
      try {
        socket.close();
      } catch {
        // Closed.
      }
      done(value);
    };
    const timer = setTimeout(() => finish(null), 1000);
    socket.once('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    // UDP connect sends nothing; it only asks the routing table.
    socket.connect(53, '8.8.8.8', () => {
      clearTimeout(timer);
      try {
        finish(socket.address().address);
      } catch {
        finish(null);
      }
    });
  });
}

/** @param {string} url @param {number} timeoutMs */
async function httpGet(url, timeoutMs = 2500) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { status: response.status, body: await response.text() };
  } catch {
    return null;
  }
}

/** @param {string} dir */
function newestSourceTime(dir) {
  let newest = 0;
  const skip = new Set(['bin', 'obj', '.git', '.vs', 'node_modules', 'Logs', 'TestResults']);
  const wanted = /\.(cs|csproj|json|props|targets|resx|cshtml|razor|sql|xml|config)$/i;
  const walk = (/** @type {string} */ current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(join(current, entry.name));
      } else if (wanted.test(entry.name)) {
        newest = Math.max(newest, statSync(join(current, entry.name)).mtimeMs);
      }
    }
  };
  walk(join(dir, 'src'));
  for (const file of [
    'Directory.Build.props',
    'Directory.Packages.props',
    'global.json',
    'NuGet.config',
  ]) {
    if (existsSync(join(dir, file))) newest = Math.max(newest, statSync(join(dir, file)).mtimeMs);
  }
  return newest;
}

function findBackendDir(/** @type {string | null} */ given) {
  const isBackend = (/** @type {string} */ dir) =>
    existsSync(join(dir, 'src', 'Yalla.Api', 'Yalla.Api.csproj'));
  if (given) {
    const dir = resolve(ROOT, given);
    if (!isBackend(dir)) {
      throw new DevStackError(
        `${dir} has no src/Yalla.Api/Yalla.Api.csproj (--backend / YALLA_BACKEND_DIR).`,
        1,
      );
    }
    return dir;
  }
  const candidates = [
    resolve(ROOT, '..', 'Yalla'),
    resolve(ROOT, '..', 'Yalla-browse'),
    join(os.homedir(), 'source', 'repos', 'Yalla'),
  ];
  const found = candidates.find(isBackend);
  if (!found) {
    throw new DevStackError(
      `no backend checkout found at ${candidates.join(', ')}. Clone it there, or pass --backend <dir> / set YALLA_BACKEND_DIR.`,
      1,
    );
  }
  return found;
}

const which = (/** @type {string} */ tool) => {
  try {
    execFileSync(IS_WINDOWS ? 'where' : 'which', [tool], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
};

/** @param {string} pkgDir @param {string} name */
function resolveBin(pkgDir, name, bin = name) {
  const require = createRequire(join(pkgDir, 'package.json'));
  const manifestPath = require.resolve(`${name}/package.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const relative = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[bin];
  if (!relative) throw new DevStackError(`${name} has no '${bin}' executable.`, 1);
  return join(dirname(manifestPath), relative);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const options = parseArgs(process.argv.slice(2), process.env);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  keepGoing = options.keepGoing;
  const want = (/** @type {string} */ part) => options.parts.includes(part);
  const dataSource = options.mock ? 'mock' : 'real';

  if (process.env.npm_lifecycle_event === 'dev:real') {
    warn('dev:real is now dev:stack: new ports (api 5199, web 5192, Metro 8110), phone = Expo Go.');
  }
  note(
    `starting ${options.parts.join(' + ')} on ${dataSource} data` +
      (options.db ? `, throwaway database ${options.db} on ${options.dbServer}` : ''),
  );

  // --- Pre-flight ----------------------------------------------------------
  const problems = [];
  if ((want('web') || want('phone')) && !existsSync(join(ROOT, 'node_modules'))) {
    problems.push('no node_modules here. Run pnpm install first.');
  }

  /** @type {string | null} */
  let lanIp = null;
  if (want('phone') || options.lan) {
    const candidates = lanCandidates(os.networkInterfaces(), {
      routeAddress: await routeAddress(),
    });
    if (options.lanIp) {
      lanIp = options.lanIp;
      if (!candidates.some((c) => c.address === lanIp)) {
        warn(`--lan-ip ${lanIp} is not on any non-virtual adapter here; using it anyway.`);
      }
    } else if (candidates.length > 0) {
      lanIp = candidates[0].address;
      const others = candidates.slice(1).map((c) => `${c.address} (${c.name})`);
      note(
        `LAN address ${lanIp} (${candidates[0].name})` +
          (others.length ? `; also seen: ${others.join(', ')} - --lan-ip picks another` : ''),
      );
    } else {
      problems.push(
        'no LAN address found (Wi-Fi off? only virtual adapters?). The phone needs one: connect to Wi-Fi or pass --lan-ip.',
      );
    }
  }

  const portChecks = [];
  if (want('api')) portChecks.push(checkPortFree(options.apiPort, 'api'));
  if (want('web')) portChecks.push(checkPortFree(options.webPort, 'web'));
  if (want('phone')) portChecks.push(checkPortFree(options.metroPort, 'metro'));
  for (const result of await Promise.all(portChecks)) if (result) problems.push(...result);

  /** @type {string | null} */
  let backendDir = null;
  /** @type {string | null} */
  let outDir = null;
  if (want('api')) {
    if (!which('dotnet')) problems.push('dotnet is not on PATH; the backend needs the .NET SDK.');
    try {
      backendDir = findBackendDir(options.backendDir);
      const key = createHash('sha1').update(backendDir.toLowerCase()).digest('hex').slice(0, 8);
      outDir = options.outDir
        ? isAbsolute(options.outDir)
          ? options.outDir
          : resolve(process.cwd(), options.outDir)
        : join(os.tmpdir(), 'yalla-dev-stack', `api-${key}-${options.apiPort}`);
    } catch (error) {
      problems.push(/** @type {Error} */ (error).message);
    }
  }

  if (problems.length > 0) {
    loud('dev:stack cannot start', problems);
    process.exit(1);
  }

  const apiHost = options.lan ? lanIp : 'localhost';
  const webApiUrl = `http://${apiHost}:${options.apiPort}`;
  const phoneApiUrl = `http://${lanIp}:${options.apiPort}`;
  const webHost = options.lan ? lanIp : 'localhost';

  // --- Backend -------------------------------------------------------------
  if (want('api') && backendDir && outDir) {
    const stampPath = join(outDir, '.dev-stack-build.json');
    const dll = join(outDir, 'Yalla.Api.dll');
    let reason = /** @type {string | null} */ (null);
    if (options.build === 'always') reason = '--rebuild';
    else if (!existsSync(dll)) reason = 'no build yet';
    else if (options.build === 'auto') {
      try {
        const stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
        if (stamp.backendDir !== backendDir) reason = 'built from another checkout';
        else if (newestSourceTime(backendDir) > stamp.sourcesAt) reason = 'sources changed';
      } catch {
        reason = 'no build stamp';
      }
    }
    if (options.build === 'never' && !existsSync(dll)) {
      loud('dev:stack cannot start', [`--no-build, but ${dll} does not exist.`]);
      process.exit(1);
    }

    if (reason) {
      note(`building backend (${reason}): ${backendDir} -> ${outDir}`);
      mkdirSync(outDir, { recursive: true });
      const sourcesAt = newestSourceTime(backendDir);
      // --disable-build-servers: no MSBuild nodes or compiler server left
      // running after the build, so a stopped stack leaves no dotnet behind.
      const build = launch(
        'build',
        'dotnet',
        [
          'build',
          join('src', 'Yalla.Api', 'Yalla.Api.csproj'),
          '-c',
          'Debug',
          '-o',
          outDir,
          '--disable-build-servers',
          '-nologo',
          '-v',
          'q',
          '-clp:NoSummary',
        ],
        { cwd: backendDir, oneShot: true },
      );
      const code = await build.done;
      if (stopping) return;
      if (code !== 0) {
        loud(`BACKEND BUILD FAILED (exit ${code})`, ['See the [build] lines above.']);
        await shutdown(code);
      }
      writeFileSync(
        stampPath,
        JSON.stringify({ backendDir, sourcesAt, builtAt: Date.now() }, null, 2),
      );
      note(`build done (${elapsed()})`);
    } else {
      note(`backend build is current (${outDir}); --rebuild forces one`);
    }

    /** @type {NodeJS.ProcessEnv} */
    const env = {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Development',
      DOTNET_ENVIRONMENT: 'Development',
      ASPNETCORE_URLS: `http://0.0.0.0:${options.apiPort}`,
    };
    if (options.db)
      env['ConnectionStrings__Yalla'] = connectionString(options.dbServer, options.db);
    // One bot token, one long-polling instance: a second backend polling it
    // takes updates away from the first (Telegram answers 409 to one of them).
    if (!options.telegram) env['Telegram__Enabled'] = 'false';
    if (!options.sqlLog) {
      env['Serilog__MinimumLevel__Override__Microsoft.EntityFrameworkCore.Database.Command'] =
        'Warning';
    }
    // The manage link in booking messages should open this stack's web app.
    env['PublicWeb__ManageBookingUrlTemplate'] ??=
      `http://${webHost}:${options.webPort}/booking/{token}`;

    note(
      `api: http://0.0.0.0:${options.apiPort}, Development, ` +
        (options.db
          ? `database ${options.db} on ${options.dbServer}`
          : "the backend's own database config"),
    );
    const api = launch('api', 'dotnet', ['Yalla.Api.dll'], { cwd: outDir, env });

    const deadline = Date.now() + options.healthTimeout * 1000;
    let lastReport = Date.now();
    let lastBody = '';
    for (;;) {
      if (stopping) return;
      if (api.exited) return; // onServiceExit reports it and stops the rest.
      const health = await httpGet(`http://127.0.0.1:${options.apiPort}/health`);
      if (health?.status === 200 && /Healthy/.test(health.body)) break;
      if (health) lastBody = health.body;
      if (Date.now() > deadline) {
        loud(`API NOT HEALTHY after ${options.healthTimeout}s`, [
          lastBody ? `/health said: ${lastBody.slice(0, 300)}` : 'GET /health never answered.',
        ]);
        await shutdown(1);
      }
      if (Date.now() - lastReport > 15000) {
        lastReport = Date.now();
        note(`waiting for /health (${elapsed()})${health ? `: HTTP ${health.status}` : ''}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    note(paint('32', `api healthy after ${elapsed()}`));
  } else if (!options.mock) {
    const health = await httpGet(`http://127.0.0.1:${options.apiPort}/health`);
    if (health?.status === 200) note(`using the backend already on :${options.apiPort}`);
    else {
      warn(
        `nothing healthy answers on :${options.apiPort}/health; the apps will show connection errors until a backend runs there.`,
      );
    }
  }

  // --- Web and phone -------------------------------------------------------
  // Children see a pipe, not a terminal: tell them whether to colour. Both
  // variables at once makes every Node process print a warning per worker.
  const childEnv = () => {
    const env = { ...process.env };
    if (color) {
      env.FORCE_COLOR = '1';
      delete env.NO_COLOR;
    } else {
      delete env.FORCE_COLOR;
    }
    return env;
  };
  if (want('web')) {
    const manifest = JSON.parse(readFileSync(join(WEB_DIR, 'package.json'), 'utf8'));
    const predev = manifest.scripts?.predev;
    if (predev) {
      // The generated token CSS that `pnpm dev` would have written first.
      const step = launch('web', predev, [], { cwd: WEB_DIR, oneShot: true, shell: true });
      const code = await step.done;
      if (stopping) return;
      if (code !== 0) {
        loud(`WEB PREDEV FAILED (exit ${code})`, [predev]);
        await shutdown(code);
      }
    }
    /** @type {NodeJS.ProcessEnv} */
    const env = { ...childEnv(), VITE_DATA_SOURCE: dataSource };
    if (!options.mock) env['VITE_API_URL'] = webApiUrl;
    const args = [resolveBin(WEB_DIR, 'vite'), '--port', String(options.webPort), '--strictPort'];
    if (options.lan) args.push('--host', '0.0.0.0');
    note(
      `web: ${dataSource}${options.mock ? '' : ` -> ${webApiUrl}`}${options.lan ? ', on the LAN' : ''}`,
    );
    launch('web', process.execPath, args, { cwd: WEB_DIR, env });
  }

  if (want('phone') && lanIp) {
    /** @type {NodeJS.ProcessEnv} */
    const env = {
      ...childEnv(),
      EXPO_PUBLIC_DATA_SOURCE: dataSource,
      // Expo would otherwise pick its own adapter, VirtualBox's included.
      REACT_NATIVE_PACKAGER_HOSTNAME: lanIp,
    };
    if (!options.mock) env['EXPO_PUBLIC_API_URL'] = phoneApiUrl;
    const args = [
      resolveBin(DINER_DIR, 'expo'),
      'start',
      '--lan',
      '--port',
      String(options.metroPort),
    ];
    if (options.clear) args.push('--clear');
    note(
      `phone: Metro on ${lanIp}:${options.metroPort}, ${dataSource}${options.mock ? '' : ` -> ${phoneApiUrl}`}`,
    );
    launch('phone', process.execPath, args, { cwd: DINER_DIR, env });
  }

  // --- Ready ---------------------------------------------------------------
  const waits = [];
  if (want('web')) {
    waits.push(waitFor('web', `http://localhost:${options.webPort}/`, (r) => r.status === 200));
  }
  if (want('phone')) {
    waits.push(
      waitFor('phone', `http://127.0.0.1:${options.metroPort}/status`, (r) =>
        r.body.includes('packager-status:running'),
      ),
    );
  }
  const ready = await Promise.all(waits);
  if (stopping) return;

  // The mock's first public branch (packages/api/src/mocks/publicVenues.ts).
  let publicPath = options.mock ? '/lumen-coffee/northern-avenue' : null;
  if (!options.mock) {
    const venues = await httpGet(`http://127.0.0.1:${options.apiPort}/api/public/venues`, 5000);
    try {
      publicPath = venues?.status === 200 ? publicPagePath(JSON.parse(venues.body)) : null;
    } catch {
      publicPath = null;
    }
  }

  await printSummary({ options, lanIp, webHost, publicPath, allReady: ready.every(Boolean) });
}

/**
 * @param {'web' | 'phone'} name
 * @param {string} url
 * @param {(r: { status: number, body: string }) => boolean} ok
 */
async function waitFor(name, url, ok, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stopping) return false;
    const service = services.find((s) => s.name === name && !s.oneShot);
    if (service?.exited) return false;
    const response = await httpGet(url);
    if (response && ok(response)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  warn(`${name} did not answer ${url} within ${timeoutMs / 1000}s; it may still be starting.`);
  return false;
}

/** @param {string} text */
async function qr(text) {
  try {
    const require = createRequire(join(WEB_DIR, 'package.json'));
    const QRCode = require('qrcode');
    // 'terminal' paints black on white explicitly, which scans on a dark theme;
    // 'utf8' is the plain-text fallback for a log file.
    const out = await QRCode.toString(
      text,
      color ? { type: 'terminal', small: true } : { type: 'utf8' },
    );
    return String(out).replace(/\n+$/, '');
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   options: ReturnType<typeof parseArgs>,
 *   lanIp: string | null,
 *   webHost: string | null,
 *   publicPath: string | null,
 *   allReady: boolean,
 * }} input
 */
async function printSummary({ options, lanIp, webHost, publicPath, allReady }) {
  const want = (/** @type {string} */ part) => options.parts.includes(part);
  const web = `http://localhost:${options.webPort}`;
  const lanWeb = lanIp ? `http://${lanIp}:${options.webPort}` : null;
  const expoUrl = lanIp ? `exp://${lanIp}:${options.metroPort}` : null;
  /** @type {Array<[string, string]>} */
  const rows = [];

  if (want('api')) {
    rows.push(['API', `http://localhost:${options.apiPort}  (/swagger, /health)`]);
    rows.push([
      'Database',
      options.db ? `${options.db} on ${options.dbServer} (throwaway)` : "backend's own config",
    ]);
  } else if (!options.mock) {
    rows.push(['API', `http://localhost:${options.apiPort} (not started here)`]);
  }
  if (want('web')) {
    rows.push(['Console', `${web}/`]);
    rows.push(['Tablet', `${web}/staff`]);
    rows.push(['Public page', publicPath ? `${web}${publicPath}` : `${web}/<venue>/<branch>`]);
    if (options.lan && lanWeb) rows.push(['Staff phone', `${lanWeb}/staff  (same Wi-Fi)`]);
  }
  if (want('phone') && expoUrl) {
    rows.push(['Phone', `${expoUrl}  (Expo Go, same Wi-Fi)`]);
    rows.push(['Diner (web)', `http://localhost:${options.metroPort}`]);
  }
  rows.push(['Data', options.mock ? 'mock (in memory, resets on reload)' : 'real']);

  const width = Math.max(...rows.map(([k]) => k.length));
  const title = allReady
    ? `Time to Eat dev stack ready in ${elapsed()}`
    : `Time to Eat dev stack started (${elapsed()}), not everything answered yet`;
  const line = '─'.repeat(64);
  const out = [
    '',
    paint(allReady ? '1;32' : '1;33', `${line}\n  ${title}\n${line}`),
    ...rows.map(([k, v]) => `  ${paint('1', k.padEnd(width))}  ${v}`),
  ];
  if (!options.lan && want('web') && webHost === 'localhost') {
    out.push(`  ${''.padEnd(width)}  (staff PWA on a real phone: add --lan)`);
  }

  if (options.qr && want('phone') && expoUrl) {
    const code = await qr(expoUrl);
    if (code)
      out.push('', `  Expo Go: scan with the camera (iOS) or Expo Go (Android) - ${expoUrl}`, code);
  }
  if (options.qr && options.lan && want('web') && lanWeb) {
    const code = await qr(`${lanWeb}/staff`);
    if (code) out.push('', `  Staff phone PWA - ${lanWeb}/staff`, code);
  }
  out.push(
    '',
    paint('1', '  Ctrl+C stops everything.'),
    paint(allReady ? '1;32' : '1;33', line),
    '',
  );
  process.stdout.write(`${out.join('\n')}\n`);
}

main().catch(async (error) => {
  if (error instanceof DevStackError) {
    process.stderr.write(`${paint('31', `dev:stack: ${error.message}`)}\n`);
    if (services.length === 0) process.exit(error.exitCode);
    await shutdown(error.exitCode);
    return;
  }
  loud('dev:stack itself failed', [String(error?.stack ?? error)]);
  await shutdown(1);
});
