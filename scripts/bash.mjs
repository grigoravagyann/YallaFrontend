#!/usr/bin/env node
/**
 * Runs a bash script with a bash that can actually run it, on every OS.
 *
 *   node scripts/bash.mjs <script> [args...]
 *
 * Only Windows needs this, and for one reason: the first `bash` on the Windows
 * PATH is usually `C:\Windows\System32\bash.exe`, which is WSL — a different
 * machine with its own `node_modules`, no `dotnet` and no SQL Server. pnpm runs
 * package scripts through cmd.exe, so `"dev:real": "bash scripts/dev-real.sh"`
 * would start that one and fail in a confusing way. Git for Windows ships the
 * right bash; this finds it. Everywhere else it is plain `bash`.
 *
 * Set YALLA_BASH to a bash executable to skip the search.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

function findGitBash() {
  const candidates = [];

  try {
    // e.g. C:/Program Files/Git/mingw64/libexec/git-core -> C:/Program Files/Git
    const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
    const root = dirname(dirname(dirname(execPath)));
    // bin/bash.exe first: it is the wrapper that puts /usr/bin (awk, curl) on PATH.
    candidates.push(join(root, 'bin', 'bash.exe'), join(root, 'usr', 'bin', 'bash.exe'));
  } catch {
    // git is not on PATH; fall through to the default install locations.
  }

  for (const base of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']]) {
    if (base) candidates.push(join(base, 'Git', 'bin', 'bash.exe'));
  }
  if (process.env['LOCALAPPDATA']) {
    candidates.push(join(process.env['LOCALAPPDATA'], 'Programs', 'Git', 'bin', 'bash.exe'));
  }

  return candidates.find((candidate) => existsSync(candidate));
}

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error('usage: node scripts/bash.mjs <script> [args...]');
  process.exit(2);
}

const bash = process.env['YALLA_BASH'] || (process.platform === 'win32' ? findGitBash() : 'bash');

if (!bash) {
  console.error(
    'Could not find Git Bash. Install Git for Windows, or set YALLA_BASH to the full path of bash.exe.',
  );
  process.exit(1);
}

const child = spawn(bash, [script, ...args], { stdio: 'inherit' });

// Ctrl+C reaches the whole console group, bash included. Staying alive until bash
// has run its cleanup trap is what stops the three servers being orphaned.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (process.platform !== 'win32') child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error(`Could not start ${bash}: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
