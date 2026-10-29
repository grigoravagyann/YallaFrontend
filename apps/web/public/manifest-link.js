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
 * The server already sends each path a shell with the right link, or none
 * (`src/manifestShell.ts`, 2026-10-29): iOS Safari installs from the link as
 * parsed and ignores this script changing it. This keeps the one link right
 * on every client-side navigation after that (a branch manager's Floor link
 * goes from /venue to /staff without a load), for the browsers that follow a
 * changed link, and adds it when the page was first served without one.
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
  var parent;
  var next;
  if (link) {
    parent = link.parentNode;
    next = link.nextSibling;
  } else {
    // A diner's page is served with no link: one goes where it would have been.
    var self = document.currentScript;
    link = document.createElement('link');
    link.setAttribute('rel', 'manifest');
    parent = (self && self.parentNode) || document.head;
    next = self && self.parentNode ? self : null;
  }

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
