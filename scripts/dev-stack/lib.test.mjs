/**
 * The pure helpers behind `pnpm dev:stack`. Plain `node:test`, run by
 * `pnpm test:scripts` (and so by `pnpm test`).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PORTS,
  descendantPids,
  DevStackError,
  lanCandidates,
  parseArgs,
  parseNetstatListeners,
  parsePort,
  parseProcessCsv,
  parseTasklistCsv,
  pickLanAddress,
  publicPagePath,
  RESERVED_PORTS,
} from './lib.mjs';

/** What `os.networkInterfaces()` returned on the machine this was written on. */
const THIS_LAPTOP = {
  'Ethernet 2': [
    {
      address: 'fe80::d57:74ed:432d:3279',
      family: 'IPv6',
      internal: false,
      mac: '0a:00:27:00:00:12',
    },
    { address: '192.168.56.1', family: 'IPv4', internal: false, mac: '0a:00:27:00:00:12' },
  ],
  'Беспроводная сеть': [
    {
      address: 'fe80::a0f8:4c09:ac6e:c3de',
      family: 'IPv6',
      internal: false,
      mac: 'bc:38:98:7d:1c:f2',
    },
    { address: '192.168.0.29', family: 'IPv4', internal: false, mac: 'bc:38:98:7d:1c:f2' },
  ],
  'Loopback Pseudo-Interface 1': [
    { address: '127.0.0.1', family: 'IPv4', internal: true, mac: '00:00:00:00:00:00' },
  ],
};

test('the LAN pick skips the VirtualBox host-only adapter even when it is called "Ethernet 2"', () => {
  assert.deepEqual(pickLanAddress(THIS_LAPTOP), {
    name: 'Беспроводная сеть',
    address: '192.168.0.29',
  });
  assert.deepEqual(
    lanCandidates(THIS_LAPTOP).map((c) => c.address),
    ['192.168.0.29'],
  );
});

test('the LAN pick prefers the default-route adapter, then a private address', () => {
  const interfaces = {
    Ethernet: [{ address: '10.0.0.5', family: 'IPv4', internal: false, mac: 'aa:bb:cc:00:00:01' }],
    'Wi-Fi': [
      { address: '192.168.1.42', family: 'IPv4', internal: false, mac: 'aa:bb:cc:00:00:02' },
    ],
    Odd: [{ address: '100.64.1.1', family: 'IPv4', internal: false, mac: 'aa:bb:cc:00:00:03' }],
  };
  assert.equal(pickLanAddress(interfaces)?.address, '192.168.1.42'); // Wi-Fi wins a tie
  assert.equal(pickLanAddress(interfaces, { routeAddress: '10.0.0.5' })?.address, '10.0.0.5');
  assert.equal(lanCandidates(interfaces).at(-1)?.address, '100.64.1.1');
});

test('the LAN pick drops link-local, IPv6, loopback and named virtual adapters', () => {
  const interfaces = {
    'vEthernet (WSL)': [
      { address: '172.20.0.1', family: 'IPv4', internal: false, mac: '00:15:5d:01:02:03' },
    ],
    Docker: [{ address: '10.1.2.3', family: 'IPv4', internal: false, mac: '02:42:ac:11:00:02' }],
    Ethernet: [
      { address: '169.254.10.10', family: 'IPv4', internal: false, mac: 'aa:bb:cc:dd:ee:ff' },
    ],
    'Wi-Fi': [{ address: 'fe80::1', family: 'IPv6', internal: false, mac: 'aa:bb:cc:dd:ee:00' }],
    lo: [{ address: '127.0.0.1', family: 4, internal: true }],
  };
  assert.equal(pickLanAddress(interfaces), null);
});

test('ports: defaults, ranges, and the reserved four', () => {
  assert.deepEqual(DEFAULT_PORTS, { api: 5199, web: 5192, metro: 8110 });
  assert.equal(parsePort('5299', '--api-port'), 5299);
  for (const reserved of [5086, 5173, 8095, 8081]) {
    assert.ok(RESERVED_PORTS.has(reserved));
    assert.throws(() => parsePort(String(reserved), '--web-port'), /reserved/);
  }
  assert.throws(() => parsePort('80', '--web-port'), /outside/);
  assert.throws(() => parsePort('70000', '--web-port'), /outside/);
  assert.throws(() => parsePort('51a', '--web-port'), /not a port/);
  assert.throws(() => parsePort('', '--web-port'), DevStackError);
});

test('ports from the environment are checked the same way, and flags win', () => {
  assert.throws(() => parseArgs([], { YALLA_WEB_PORT: '5173' }), /reserved/);
  const options = parseArgs(['--web-port=5292'], { YALLA_WEB_PORT: '5392' });
  assert.equal(options.webPort, 5292);
});

test('parts: everything by default, --only/--skip, old dev:real names, --mock', () => {
  assert.deepEqual(parseArgs([]).parts, ['api', 'web', 'phone']);
  assert.deepEqual(parseArgs(['--only', 'web,api']).parts, ['api', 'web']);
  assert.deepEqual(parseArgs(['--only', 'console', '--only', 'diner']).parts, ['web', 'phone']);
  assert.deepEqual(parseArgs(['--no-api']).parts, ['web', 'phone']);
  assert.deepEqual(parseArgs(['--skip', 'phone']).parts, ['api', 'web']);
  assert.deepEqual(parseArgs(['--mock']).parts, ['web', 'phone']);
  assert.deepEqual(parseArgs(['--mock', '--only', 'web']).parts, ['web']);
  assert.throws(() => parseArgs(['--mock', '--only', 'api']), /no backend/);
  assert.throws(() => parseArgs(['--only', 'tablet']), /unknown part/);
  assert.throws(() => parseArgs(['--only', 'web', '--skip', 'web']), /nothing to start/);
});

test('--db takes only a throwaway name, and only with the backend', () => {
  assert.equal(parseArgs(['--db', 'Yalla_DevStackQA']).db, 'Yalla_DevStackQA');
  assert.throws(() => parseArgs(['--db', 'Yalla']), /real database/);
  assert.throws(() => parseArgs(['--db', 'yalla']), /real database/);
  assert.throws(() => parseArgs(['--db', 'x;DROP']), /plain database name/);
  assert.throws(() => parseArgs(['--mock', '--db', 'Scratch']), /--mock/);
  assert.throws(() => parseArgs(['--only', 'web', '--db', 'Scratch']), /api is not selected/);
});

test('Telegram is off for a throwaway database unless asked for', () => {
  assert.equal(parseArgs([]).telegram, true);
  assert.equal(parseArgs(['--db', 'Scratch']).telegram, false);
  assert.equal(parseArgs(['--db', 'Scratch', '--telegram']).telegram, true);
  assert.equal(parseArgs(['--no-telegram']).telegram, false);
});

test('two parts cannot share a port, and flags must be known', () => {
  assert.throws(() => parseArgs(['--web-port', '5199']), /cannot share port 5199/);
  assert.throws(() => parseArgs(['--frobnicate']), /unknown argument/);
  assert.throws(() => parseArgs(['--api-port']), /needs a value/);
  assert.throws(() => parseArgs(['--lan-ip', 'my-laptop']), /not an IPv4/);
});

test('netstat: listeners on the port only, IPv4 and IPv6, not connections or other ports', () => {
  const text = [
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    0.0.0.0:5199           0.0.0.0:0              LISTENING       4242',
    '  TCP    127.0.0.1:5199         127.0.0.1:53000        ESTABLISHED     4242',
    '  TCP    0.0.0.0:51990          0.0.0.0:0              LISTENING       1111',
    '  TCP    [::]:5199              [::]:0                 LISTENING       4243',
    '  TCP    127.0.0.1:5199         0.0.0.0:0              ПРОСЛУШИВАНИЕ   4244',
  ].join('\r\n');
  assert.deepEqual(parseNetstatListeners(text, 5199), [4242, 4243, 4244]);
  assert.deepEqual(parseNetstatListeners(text, 8110), []);
});

test('tasklist CSV and the process table parse', () => {
  assert.deepEqual(
    [...parseTasklistCsv('"node.exe","4242","Console","1","121,460 K"\r\n')],
    [[4242, 'node.exe']],
  );
  assert.deepEqual(parseProcessCsv('10,4\r\n11,10\r\n"12","11"\r\n'), [
    { pid: 10, ppid: 4 },
    { pid: 11, ppid: 10 },
    { pid: 12, ppid: 11 },
  ]);
});

test('descendants include grandchildren whose parent already exited, and never the roots', () => {
  const rows = [
    { pid: 1, ppid: 0 },
    { pid: 100, ppid: 1 }, // root: node vite
    { pid: 101, ppid: 100 }, // esbuild
    { pid: 200, ppid: 1 }, // root: node expo
    { pid: 201, ppid: 200 }, // metro worker
    { pid: 202, ppid: 201 }, // its child
    { pid: 300, ppid: 999 }, // orphan of an already-gone root 999
    { pid: 400, ppid: 1 }, // unrelated
  ];
  assert.deepEqual(
    descendantPids(rows, [100, 200, 999]).sort((a, b) => a - b),
    [101, 201, 202, 300],
  );
});

test('the public page link prefers the demo venue and survives odd input', () => {
  const venues = [
    { venueSlug: 'cafe-one', branches: [{ branchSlug: 'main' }] },
    { venueSlug: 'yalla-demo', branches: [{ branchSlug: 'yerevan-centre' }] },
  ];
  assert.equal(publicPagePath(venues), '/yalla-demo/yerevan-centre');
  assert.equal(publicPagePath([venues[0]]), '/cafe-one/main');
  assert.equal(publicPagePath([{ venueSlug: 'empty', branches: [] }]), null);
  assert.equal(publicPagePath({ items: [] }), null);
});
