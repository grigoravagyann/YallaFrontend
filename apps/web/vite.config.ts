import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { contentSecurityPolicy } from './src/csp';
import { SHELL_FILE, SHELL_MANIFEST, shellFor, withManifest } from './src/manifestShell';

/**
 * Write the built chunk graph beside the bundle, so a test can read it.
 *
 * The public branch page's whole performance argument is that a stranger who
 * opens a venue link downloads the page and **not** the venue console, the
 * counter screen, the offline command queue or the SignalR client. "We import
 * it lazily" is a claim about source; whether the bundler agreed is a claim
 * about output, and only the output can settle it.
 *
 * Rollup's own metadata is the honest source for that: each chunk's static
 * imports, its dynamic imports, and the module ids that went into it. Grepping
 * minified JavaScript for identifiers would be checking a shadow — minification
 * renames everything a test could look for, which is exactly how a bundle test
 * ends up passing while checking nothing.
 *
 * Emitted at build time only, and beside `dist/assets` rather than inside it,
 * so nothing ships it to a browser.
 */
function emitChunkGraph(): Plugin {
  /** Either separator, so the output reads the same on Windows and in CI. */
  const separator = /[\\/]/u;
  /** Rollup names a virtual module with a leading NUL. */
  const nullByte = String.fromCharCode(0);

  return {
    name: 'yalla:chunk-graph',
    apply: 'build',
    generateBundle(_options, bundle) {
      const root = resolvePath(import.meta.dirname);
      const chunks = Object.values(bundle)
        .filter((entry) => entry.type === 'chunk')
        .map((chunk) => ({
          file: chunk.fileName,
          name: chunk.name,
          isEntry: chunk.isEntry,
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          /*
           * `bytes` is what makes this graph usable as an assertion.
           *
           * A module can appear in a chunk's module list having contributed
           * **nothing**: the bundler resolved it, tree-shook every export the
           * chunk did not reach, and left the entry behind with a rendered
           * length of zero. `@yalla/api`'s barrel drags the console and staff
           * gateways into the resolution graph of anything that imports it, and
           * all of them shake out to nothing here — so a test that asserted on
           * module *names* would fail on code that is not in the bundle, and
           * would eventually be "fixed" by deleting the assertion.
           */
          modules: Object.entries(chunk.modules).map(([id, module]) => ({
            // Relative to this app and POSIX-separated, so an assertion can
            // name `src/console/...` and mean it on either platform.
            id: id.includes(nullByte) ? id : relative(root, id).split(separator).join('/'),
            bytes: module.renderedLength,
          })),
        }));

      const out = join(root, 'dist', 'chunk-graph.json');
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(chunks, null, 2), 'utf8');
    },
  };
}

/**
 * Put the brand card on the static shell, but only when it can be absolute.
 *
 * The shell is what a link unfurler actually receives: WhatsApp's fetcher,
 * Telegram's and Slack's do not run JavaScript, so `src/public/meta.ts` never
 * executes for them. Without an `og:image` here, every shared link on the
 * channel this page exists to serve unfurls as a text-only card.
 *
 * The reason it is a plugin rather than two lines in `index.html` is that an
 * `og:image` **must** be an absolute URL — several unfurlers drop a relative
 * one — and there is no origin available at build time unless somebody supplies
 * it. A `%VITE_PUBLIC_ORIGIN%` placeholder left unsubstituted would ship a tag
 * pointing at a URL that resolves nowhere, and a card with a broken image slot
 * in it looks worse than the plain `summary` card it replaced. So: origin set,
 * the card is added and the card type is upgraded; origin absent, the shell is
 * left exactly as it is today, which is a correct if plainer card.
 */
function brandCardMeta(publicOrigin: string): Plugin {
  return {
    name: 'yalla:og-card',
    transformIndexHtml(html) {
      if (!publicOrigin) return html;

      const card = new URL('/og-card.png', publicOrigin).toString();
      return html
        .replace(
          '<meta name="twitter:card" content="summary" />',
          '<meta name="twitter:card" content="summary_large_image" />',
        )
        .replace(
          '</head>',
          `  <meta property="og:image" content="${card}" />
` +
            `    <meta property="og:image:width" content="1200" />
` +
            `    <meta property="og:image:height" content="630" />
` +
            `    <meta property="og:image:alt" content="Yalla" />
` +
            `    <meta name="twitter:image" content="${card}" />
` +
            '  </head>',
        );
    },
  };
}

/**
 * The Content-Security-Policy, on the built shell and beside the bundle.
 *
 * Build only. The dev server injects an inline React Refresh preamble that
 * `script-src 'self'` would block, and a policy that has to be switched off
 * to develop is one nobody notices breaking — so development runs without it
 * and `productionBundle.test.ts` reads it off the real build output.
 *
 * The meta tag goes straight after the charset, because a policy delivered in
 * a meta element only governs what comes after it. The same string is written
 * to `dist/content-security-policy.txt` for the host to send as a header, which
 * is the only way `frame-ancestors` takes effect. See `src/csp.ts`.
 */
function contentSecurityPolicyMeta(apiUrl: string): Plugin {
  const policy = contentSecurityPolicy({ apiUrl });
  return {
    name: 'yalla:csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'content-security-policy.txt',
        source: `${policy}\n`,
      });
    },
  };
}

/**
 * One shell per product, so the manifest link is right before any script runs.
 *
 * iOS Safari installs whatever `<link rel="manifest">` the served HTML names
 * and ignores `public/manifest-link.js` changing it, so the link has to be
 * right in the bytes the server sends (`src/manifestShell.ts`):
 *
 * - build: `dist/index.html` links the console's manifest, and `staff.html` and
 *   `public.html` are written beside it, identical but for that one link.
 *   `deploy/Caddyfile` routes each path to its file.
 * - dev: each request's shell is pointed by its own URL, so a phone on the LAN
 *   (`pnpm dev:stack --lan`) installs what production would.
 * - preview: a navigation to a staff or diner path is answered with that file,
 *   where the SPA fallback would answer `index.html`.
 */
function manifestPerShell(): Plugin {
  return {
    name: 'yalla:manifest-shells',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // Dev: the URL asked for, before the SPA fallback made it /index.html.
        // Build: the file is `index.html`, the console's.
        const pathname = ctx.server
          ? new URL(ctx.originalUrl ?? ctx.path, 'http://localhost').pathname
          : '/';
        return withManifest(html, SHELL_MANIFEST[shellFor(pathname)]);
      },
    },
    writeBundle(options) {
      const dir = options.dir;
      if (!dir) return;
      const shell = readFileSync(join(dir, SHELL_FILE.console), 'utf8');
      for (const kind of ['staff', 'public'] as const) {
        writeFileSync(join(dir, SHELL_FILE[kind]), withManifest(shell, SHELL_MANIFEST[kind]));
      }
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const accept = req.headers.accept ?? '';
        if ((req.method === 'GET' || req.method === 'HEAD') && accept.includes('text/html')) {
          const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
          const last = pathname.split('/').pop() ?? '';
          const kind = shellFor(pathname);
          // A file (`/sw.js`, `/staff.html`) is itself; the console's paths
          // already fall back to `index.html`.
          if (!last.includes('.') && kind !== 'console') req.url = `/${SHELL_FILE[kind]}`;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    emitChunkGraph(),
    manifestPerShell(),
    brandCardMeta((process.env['VITE_PUBLIC_ORIGIN'] ?? '').trim()),
    // `loadEnv` so a value in `.env` counts, with the process environment
    // winning over it — which is how the bundle test pins the origin.
    contentSecurityPolicyMeta(loadEnv(mode, import.meta.dirname, 'VITE_')['VITE_API_URL'] ?? ''),
  ],
  optimizeDeps: {
    exclude: [
      // The workspace packages ship raw TypeScript; Vite must not pre-bundle
      // them or it loses HMR on edits to shared code.
      '@yalla/api',
      '@yalla/format',
      '@yalla/i18n',
      '@yalla/realtime',
      '@yalla/tokens',
    ],
  },
  server: {
    port: 5173,
  },
}));
