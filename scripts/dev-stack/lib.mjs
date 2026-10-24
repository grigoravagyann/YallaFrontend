/**
 * The pure half of `scripts/dev-stack.mjs`: argument parsing, the port rules,
 * the LAN address pick and the parsers for what Windows tools print. Nothing in
 * here starts a process, opens a socket or touches the disk, which is what lets
 * `lib.test.mjs` pin it with plain `node:test`.
 */

export class DevStackError extends Error {
  /** @param {string} message @param {number} [exitCode] */
  constructor(message, exitCode = 2) {
    super(message);
    this.name = 'DevStackError';
    this.exitCode = exitCode;
  }
}

export const DEFAULT_PORTS = Object.freeze({ api: 5199, web: 5192, metro: 8110 });

/**
 * Ports this script will not use, whoever asks. Each one is somebody's default
 * and is normally already taken by something started by hand, so landing on it
 * means either a confusing "port busy" or, worse, talking to the wrong server.
 */
export const RESERVED_PORTS = new Map([
  [5086, "the backend's own default, dotnet run"],
  [5173, "Vite's default, pnpm dev:web"],
  [8081, "Metro's default, pnpm dev:diner"],
  [8095, 'the old dev:real diner web port'],
]);

export const PARTS = Object.freeze(['api', 'web', 'phone']);

/** Old dev:real names, kept so muscle memory still works. */
const PART_ALIASES = new Map([
  ['console', 'web'],
  ['diner', 'phone'],
  ['backend', 'api'],
  ['metro', 'phone'],
  ['expo', 'phone'],
]);

/** The database names `--db` refuses: the real local ones. */
const REAL_DATABASES = new Set(['yalla', 'yalla_staging', 'master', 'model', 'msdb', 'tempdb']);

/**
 * @param {string | undefined} raw
 * @param {string} what  the flag or variable the value came from, for the message
 * @returns {number}
 */
export function parsePort(raw, what) {
  const text = String(raw ?? '').trim();
  if (!/^\d+$/.test(text)) {
    throw new DevStackError(`${what}: '${raw ?? ''}' is not a port number.`);
  }
  const port = Number(text);
  if (port < 1024 || port > 65535) {
    throw new DevStackError(`${what}: ${port} is outside 1024-65535.`);
  }
  const reserved = RESERVED_PORTS.get(port);
  if (reserved) {
    throw new DevStackError(
      `${what}: ${port} is reserved (${reserved}) and is never used by dev:stack. Pick another port.`,
    );
  }
  return port;
}

/**
 * @param {string} raw  e.g. "api,web" or "console"
 * @param {string} what
 * @returns {string[]}
 */
export function parseParts(raw, what) {
  const parts = String(raw ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => PART_ALIASES.get(part) ?? part);
  if (parts.length === 0) {
    throw new DevStackError(`${what} needs a list: ${PARTS.join(', ')}.`);
  }
  for (const part of parts) {
    if (!PARTS.includes(part)) {
      throw new DevStackError(`${what}: unknown part '${part}' (expected ${PARTS.join(', ')}).`);
    }
  }
  return parts;
}

/** @param {string} name */
export function validateDbName(name) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(name)) {
    throw new DevStackError(
      `--db: '${name}' is not a plain database name (letters, digits and _ only, starting with a letter).`,
    );
  }
  if (REAL_DATABASES.has(name.toLowerCase())) {
    throw new DevStackError(
      `--db: '${name}' is a real database. --db is for a throwaway one, e.g. --db Yalla_Scratch; ` +
        'leave --db off to use the backend as it is configured.',
    );
  }
  return name;
}

/** @param {string} server @param {string} database */
export function connectionString(server, database) {
  return (
    `Server=${server};Database=${database};Trusted_Connection=True;` +
    'TrustServerCertificate=True;MultipleActiveResultSets=True'
  );
}

/** @param {string} value */
function isIPv4(value) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** 10/8, 172.16/12, 192.168/16: what a home or office router hands out. */
export function isPrivateIPv4(address) {
  if (!isIPv4(address)) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

const VIRTUAL_NAME =
  /virtual|vmware|hyper-v|vethernet|virtualbox|vbox|docker|wsl|loopback|tailscale|zerotier|vpn|tap-|tun|utun|bridge|npcap/i;

/**
 * MAC prefixes of virtual adapters that Windows names plainly ("Ethernet 2").
 * VirtualBox's host-only adapter is the one this machine has: 0a:00:27, on
 * 192.168.56.0/24.
 */
const VIRTUAL_MAC_PREFIXES = [
  '0a:00:27', // VirtualBox host-only
  '08:00:27', // VirtualBox guest
  '00:05:69', // VMware
  '00:0c:29', // VMware
  '00:1c:14', // VMware
  '00:50:56', // VMware
  '00:15:5d', // Hyper-V / WSL
  '02:42:', // Docker bridge
];

/**
 * @param {{ name: string, mac?: string, address: string }} candidate
 */
export function isVirtualAdapter({ name, mac = '', address }) {
  if (VIRTUAL_NAME.test(name)) return true;
  const lower = mac.toLowerCase();
  if (VIRTUAL_MAC_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  // VirtualBox's and VMware's default host-only subnets, whatever the adapter is called.
  return address.startsWith('192.168.56.') || address.startsWith('192.168.99.');
}

/**
 * Every IPv4 address a phone on the same network could plausibly reach, best
 * first. Virtual adapters are dropped, not just ranked last: an address the
 * phone cannot route to is worse than no address, because it fails silently.
 *
 * @param {Record<string, Array<{ address: string, family: string | number, internal: boolean, mac?: string }> | undefined>} interfaces
 *   what `os.networkInterfaces()` returns
 * @param {{ routeAddress?: string | null }} [hints]
 *   `routeAddress` is the source address the OS would use for an outbound
 *   connection, i.e. the adapter holding the default route
 * @returns {Array<{ name: string, address: string }>}
 */
export function lanCandidates(interfaces, hints = {}) {
  const found = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      const family = entry.family === 4 ? 'IPv4' : entry.family;
      if (family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue; // no DHCP lease
      if (isVirtualAdapter({ name, mac: entry.mac, address: entry.address })) continue;
      found.push({ name, address: entry.address });
    }
  }
  const score = (/** @type {{ name: string, address: string }} */ c) =>
    (c.address === hints.routeAddress ? 100 : 0) +
    (isPrivateIPv4(c.address) ? 10 : 0) +
    (/wi-?fi|wlan|wireless|беспровод/i.test(c.name) ? 2 : 0) +
    (/ethernet|^en\d|^eth\d/i.test(c.name) ? 1 : 0);
  return found.sort((a, b) => score(b) - score(a));
}

/**
 * @param {Parameters<typeof lanCandidates>[0]} interfaces
 * @param {Parameters<typeof lanCandidates>[1]} [hints]
 */
export function pickLanAddress(interfaces, hints) {
  return lanCandidates(interfaces, hints)[0] ?? null;
}

/**
 * PIDs listening on a TCP port, from `netstat -ano -p tcp` (and the tcpv6
 * table). The state column is localised on some Windows builds, so a row
 * counts when its foreign address is the wildcard rather than when it says
 * LISTENING.
 *
 * @param {string} text
 * @param {number} port
 * @returns {number[]}
 */
export function parseNetstatListeners(text, port) {
  const pids = new Set();
  for (const line of text.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5 || cols[0].toUpperCase() !== 'TCP') continue;
    const local = cols[1];
    const foreign = cols[2];
    const pid = Number(cols[cols.length - 1]);
    if (!local.endsWith(`:${port}`)) continue;
    if (!/^(0\.0\.0\.0|\[::\]):0$/.test(foreign)) continue;
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

/**
 * Parses `tasklist /FO CSV /NH` output into pid -> image name.
 * @param {string} text
 */
export function parseTasklistCsv(text) {
  /** @type {Map<number, string>} */
  const names = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^"([^"]*)","(\d+)"/.exec(line.trim());
    if (match) names.set(Number(match[2]), match[1]);
  }
  return names;
}

/**
 * Every descendant of `roots`, from a process table snapshot. Children are
 * found through the snapshot rather than asked for one at a time, because the
 * point is to catch the grandchildren whose parent has already exited.
 *
 * @param {Array<{ pid: number, ppid: number }>} rows
 * @param {Iterable<number>} roots
 * @returns {number[]} descendants only, roots excluded
 */
export function descendantPids(rows, roots) {
  /** @type {Map<number, number[]>} */
  const children = new Map();
  for (const { pid, ppid } of rows) {
    if (pid === ppid) continue;
    const list = children.get(ppid) ?? [];
    list.push(pid);
    children.set(ppid, list);
  }
  const rootSet = new Set(roots);
  const seen = new Set();
  const queue = [...rootSet];
  while (queue.length > 0) {
    const parent = /** @type {number} */ (queue.shift());
    for (const child of children.get(parent) ?? []) {
      if (seen.has(child) || rootSet.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return [...seen];
}

/**
 * Parses the CSV from `Get-CimInstance Win32_Process | Select ProcessId,ParentProcessId | ConvertTo-Csv`.
 * @param {string} text
 */
export function parseProcessCsv(text) {
  /** @type {Array<{ pid: number, ppid: number }>} */
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^"?(\d+)"?,"?(\d+)"?/.exec(line.trim());
    if (match) rows.push({ pid: Number(match[1]), ppid: Number(match[2]) });
  }
  return rows;
}

/**
 * A public page path from `GET /api/public/venues`, preferring the dev seed's
 * demo venue. Null when the list is empty or not the expected shape.
 *
 * @param {unknown} venues
 * @returns {string | null}
 */
export function publicPagePath(venues) {
  if (!Array.isArray(venues)) return null;
  const withBranch = venues.filter(
    (v) =>
      v &&
      typeof v.venueSlug === 'string' &&
      Array.isArray(v.branches) &&
      v.branches.some((/** @type {any} */ b) => b && typeof b.branchSlug === 'string'),
  );
  const venue = withBranch.find((v) => v.venueSlug === 'yalla-demo') ?? withBranch[0];
  if (!venue) return null;
  const branch = venue.branches.find((/** @type {any} */ b) => typeof b?.branchSlug === 'string');
  return `/${venue.venueSlug}/${branch.branchSlug}`;
}

/**
 * Parses the command line. Environment variables give defaults; flags win.
 *
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} [env]
 */
export function parseArgs(argv, env = {}) {
  const options = {
    help: false,
    parts: /** @type {string[] | null} */ (null),
    skip: /** @type {string[]} */ ([]),
    mock: false,
    lan: false,
    lanIp: env.YALLA_LAN_IP?.trim() || null,
    apiPort: env.YALLA_API_PORT
      ? parsePort(env.YALLA_API_PORT, 'YALLA_API_PORT')
      : DEFAULT_PORTS.api,
    webPort: env.YALLA_WEB_PORT
      ? parsePort(env.YALLA_WEB_PORT, 'YALLA_WEB_PORT')
      : DEFAULT_PORTS.web,
    metroPort: env.YALLA_METRO_PORT
      ? parsePort(env.YALLA_METRO_PORT, 'YALLA_METRO_PORT')
      : DEFAULT_PORTS.metro,
    backendDir: env.YALLA_BACKEND_DIR?.trim() || null,
    outDir: env.YALLA_API_OUT?.trim() || null,
    build: /** @type {'auto' | 'always' | 'never'} */ ('auto'),
    db: /** @type {string | null} */ (null),
    dbServer: env.YALLA_DB_SERVER?.trim() || 'localhost\\SQLEXPRESS',
    keepGoing: false,
    /** null: off with --db (a throwaway must not take the bot's updates), else as configured. */
    telegram: /** @type {boolean | null} */ (null),
    sqlLog: false,
    qr: true,
    clear: true,
    healthTimeout: 240,
  };

  const args = [...argv];
  while (args.length > 0) {
    const raw = /** @type {string} */ (args.shift());
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1;
    const flag = eq > 0 ? raw.slice(0, eq) : raw;
    const inline = eq > 0 ? raw.slice(eq + 1) : undefined;
    const value = () => {
      if (inline !== undefined) return inline;
      const next = args.shift();
      if (next === undefined || next.startsWith('--')) {
        throw new DevStackError(`${flag} needs a value.`);
      }
      return next;
    };
    const noValue = () => {
      if (inline !== undefined) throw new DevStackError(`${flag} takes no value.`);
    };

    switch (flag) {
      case '-h':
      case '--help':
        noValue();
        options.help = true;
        break;
      case '--only':
        options.parts = [...(options.parts ?? []), ...parseParts(value(), '--only')];
        break;
      case '--skip':
        options.skip.push(...parseParts(value(), '--skip'));
        break;
      case '--no-api': // dev:real's spelling
        noValue();
        options.skip.push('api');
        break;
      case '--mock':
        noValue();
        options.mock = true;
        break;
      case '--lan':
        noValue();
        options.lan = true;
        break;
      case '--lan-ip':
        options.lanIp = value();
        break;
      case '--api-port':
        options.apiPort = parsePort(value(), '--api-port');
        break;
      case '--web-port':
        options.webPort = parsePort(value(), '--web-port');
        break;
      case '--metro-port':
        options.metroPort = parsePort(value(), '--metro-port');
        break;
      case '--backend':
        options.backendDir = value();
        break;
      case '--out':
        options.outDir = value();
        break;
      case '--rebuild':
        noValue();
        options.build = 'always';
        break;
      case '--no-build':
        noValue();
        options.build = 'never';
        break;
      case '--db':
        options.db = validateDbName(value());
        break;
      case '--db-server':
        options.dbServer = value();
        break;
      case '--telegram':
        noValue();
        options.telegram = true;
        break;
      case '--no-telegram':
        noValue();
        options.telegram = false;
        break;
      case '--keep-going':
        noValue();
        options.keepGoing = true;
        break;
      case '--sql-log':
        noValue();
        options.sqlLog = true;
        break;
      case '--no-qr':
        noValue();
        options.qr = false;
        break;
      case '--no-clear':
        noValue();
        options.clear = false;
        break;
      case '--health-timeout': {
        const seconds = Number(value());
        if (!Number.isFinite(seconds) || seconds < 5) {
          throw new DevStackError('--health-timeout needs a number of seconds, at least 5.');
        }
        options.healthTimeout = seconds;
        break;
      }
      default:
        throw new DevStackError(`unknown argument '${raw}'. Try --help.`);
    }
  }

  if (options.lanIp !== null && !isIPv4(options.lanIp)) {
    throw new DevStackError(`--lan-ip: '${options.lanIp}' is not an IPv4 address.`);
  }

  const chosen = options.parts ?? (options.mock ? ['web', 'phone'] : [...PARTS]);
  const parts = PARTS.filter((p) => chosen.includes(p) && !options.skip.includes(p));
  if (parts.length === 0) {
    throw new DevStackError('nothing to start: --only/--skip left no parts.');
  }
  if (options.mock && parts.includes('api')) {
    throw new DevStackError(
      '--mock runs the apps on in-memory data; it starts no backend. Drop api.',
    );
  }
  if (options.mock && options.db) {
    throw new DevStackError('--db needs the backend; --mock starts none.');
  }
  if (options.db && !parts.includes('api')) {
    throw new DevStackError(
      '--db sets the database of the backend this starts, and api is not selected.',
    );
  }

  const ports = [
    ['api', options.apiPort],
    ['web', options.webPort],
    ['phone', options.metroPort],
  ].filter(([part]) => parts.includes(/** @type {string} */ (part)) || part === 'api');
  const seen = new Map();
  for (const [part, port] of ports) {
    if (seen.has(port)) {
      throw new DevStackError(`${seen.get(port)} and ${part} cannot share port ${port}.`);
    }
    seen.set(port, part);
  }

  if (options.telegram === null) options.telegram = options.db ? false : true;

  return { ...options, parts };
}

export const USAGE = `pnpm dev:stack [options]      (or: node scripts/dev-stack.mjs [options])

Starts the backend, waits for its /health to answer Healthy, then starts the
web app (console, /staff tablet, public page) and the diner app's Metro server
for Expo Go. Ctrl+C stops all of it, process trees included.

Parts
  --only <list>        start only these: api, web, phone (comma list or repeated)
  --skip <list>        start everything except these
  --mock               web + phone on in-memory mock data; no backend at all

Phone / LAN
  --lan                serve web on 0.0.0.0 and point it at the API by LAN IP,
                       so the staff PWA and public page work from a real phone
  --lan-ip <ip>        use this address instead of the detected one   [YALLA_LAN_IP]
  --no-qr              no ASCII QR codes in the ready summary

Ports (5086, 5173, 8081, 8095 are refused)
  --api-port <n>       default ${DEFAULT_PORTS.api}                          [YALLA_API_PORT]
  --web-port <n>       default ${DEFAULT_PORTS.web}                          [YALLA_WEB_PORT]
  --metro-port <n>     default ${DEFAULT_PORTS.metro}                          [YALLA_METRO_PORT]

Backend
  --backend <dir>      backend checkout, default ../Yalla               [YALLA_BACKEND_DIR]
  --out <dir>          build output, default <temp>/yalla-dev-stack/... [YALLA_API_OUT]
  --rebuild            always build (default: only when sources are newer)
  --no-build           never build; run what is in the output folder
  --db <name>          use a THROWAWAY database of this name instead of the
                       backend's own config; its migrations create it
  --db-server <srv>    server for --db, default localhost\\SQLEXPRESS  [YALLA_DB_SERVER]
  --sql-log            keep EF Core's per-command SQL log (quiet by default)
  --no-telegram        switch the Telegram bot off for this backend (default with --db)
  --telegram           keep it on even with --db
  --health-timeout <s> how long to wait for /health, default 240

Behaviour
  --keep-going         if a service dies, report it and keep the rest running
                       (default: stop everything)
  --no-clear           start Metro without --clear (faster, may serve a stale bundle)
  -h, --help           this text

Examples
  pnpm dev:stack                          everything, real data
  pnpm dev:stack --lan                    everything, and test /staff on a phone
  pnpm dev:stack --mock                   console + phone app on mock data
  pnpm dev:stack --only api,web --db Yalla_Scratch
  pnpm dev:stack --only web,phone         apps against a backend you started yourself

Docs: docs/dev-stack.md`;
