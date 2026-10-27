/*
 * Which app "Add to Home Screen" installs from this page (2026-10-27).
 *
 * One origin serves three products, and each installs differently:
 *
 * - /staff…: the floor tablet and the staff phone (`manifest.webmanifest`,
 *   scope /staff).
 * - the console — `/`, /sign-in, /platform…, /venue…, /reset-password and the
 *   other reserved first segments: `manifest-console.webmanifest`, scope /.
 * - everything else is the public venue page or a booking's manage link, which
 *   a diner opens: no manifest, so a diner's "Add to Home Screen" bookmarks the
 *   page instead of installing the console.
 *
 * `index.html` keeps one `<link rel="manifest">`; this points it, or takes it
 * out, before anything else runs, and again on every client-side navigation
 * (a branch manager's Floor link goes from /venue to /staff without a load).
 *
 * A file rather than an inline script: the Content-Security-Policy is
 * `script-src 'self'` with no inline script (`src/csp.ts`). The reserved words
 * are `RESERVED_FIRST_SEGMENTS` in `src/publicRoutes.ts`;
 * `src/manifestLink.test.ts` fails when the two lists part.
 */
(function () {
  var RESERVED = [
    'assets',
    'dev',
    'fonts',
    'platform',
    'reset-password',
    'sign-in',
    'staff',
    'venue',
  ];
  var STAFF = '/manifest.webmanifest';
  var CONSOLE = '/manifest-console.webmanifest';

  var link = document.querySelector('link[rel="manifest"]');
  if (!link) return;
  var parent = link.parentNode;
  var next = link.nextSibling;

  function manifestFor(pathname) {
    var first = (pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
    if (first === 'staff') return STAFF;
    if (first === '' || RESERVED.indexOf(first) >= 0) return CONSOLE;
    return null;
  }

  function apply() {
    var href = manifestFor(window.location.pathname);
    if (href === null) {
      if (link.parentNode) link.parentNode.removeChild(link);
      return;
    }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    if (!link.parentNode)
      parent.insertBefore(link, next && next.parentNode === parent ? next : null);
  }

  apply();
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = window.history[name];
    window.history[name] = function () {
      var result = original.apply(this, arguments);
      apply();
      return result;
    };
  });
  window.addEventListener('popstate', apply);
})();
