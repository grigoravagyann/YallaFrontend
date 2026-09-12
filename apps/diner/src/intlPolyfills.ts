/**
 * Hermes ships `Intl.NumberFormat` and `Intl.DateTimeFormat` but not
 * `Intl.ListFormat`, `Intl.RelativeTimeFormat` or `Intl.PluralRules`.
 * `@yalla/format` uses the first two ("Aram, Nare and 1 guest", "3 min ago"),
 * so on a real phone `new Intl.ListFormat` was `undefined` and the tab screen
 * crashed. The web app never noticed because browsers have all of these.
 *
 * Import order matters: each `polyfill` entry checks whether the native
 * implementation exists and only installs itself when it is missing, and the
 * later ones depend on `Intl.Locale` and `Intl.PluralRules` being present.
 * Locale data is loaded for exactly the three languages in `LOCALES`.
 *
 * This module must be the first import of the root layout.
 */
import '@formatjs/intl-getcanonicallocales/polyfill.js';
import '@formatjs/intl-locale/polyfill.js';

import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/hy.js';
import '@formatjs/intl-pluralrules/locale-data/ru.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';

import '@formatjs/intl-listformat/polyfill.js';
import '@formatjs/intl-listformat/locale-data/hy.js';
import '@formatjs/intl-listformat/locale-data/ru.js';
import '@formatjs/intl-listformat/locale-data/en.js';
import '@formatjs/intl-listformat/locale-data/en-GB.js';

import '@formatjs/intl-relativetimeformat/polyfill.js';
import '@formatjs/intl-relativetimeformat/locale-data/hy.js';
import '@formatjs/intl-relativetimeformat/locale-data/ru.js';
import '@formatjs/intl-relativetimeformat/locale-data/en.js';
import '@formatjs/intl-relativetimeformat/locale-data/en-GB.js';
