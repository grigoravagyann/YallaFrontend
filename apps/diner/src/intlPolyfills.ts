/**
 * Hermes ships a partial `Intl`: `NumberFormat` and `DateTimeFormat` exist but
 * lack `formatToParts`, `useGrouping: 'always'`, unit styles and `longOffset`;
 * `ListFormat`, `RelativeTimeFormat` and `PluralRules` are missing outright.
 * `@yalla/format` leans on all of those ("5,610 ֏", "Aram, Nare and 1 guest",
 * "3 min ago", branch-day boundaries), so on a real phone the tab screen
 * crashed the moment it rendered a bill. The web app never noticed because
 * browsers have the full set.
 *
 * Each `polyfill` entry probes the native implementation for the exact
 * features it needs and only installs itself when something is missing, so
 * this is a no-op on web and in Node tests. Import order matters: the later
 * polyfills depend on `Intl.Locale`, `PluralRules` and `NumberFormat` being
 * present first. Locale data is loaded for exactly the three languages in
 * `LOCALES`; time zone data uses the "golden" set, which includes Yerevan.
 *
 * This module must be the first import of the root layout.
 */
import '@formatjs/intl-getcanonicallocales/polyfill.js';
import '@formatjs/intl-locale/polyfill.js';

import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/hy.js';
import '@formatjs/intl-pluralrules/locale-data/ru.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';

import '@formatjs/intl-numberformat/polyfill.js';
import '@formatjs/intl-numberformat/locale-data/hy.js';
import '@formatjs/intl-numberformat/locale-data/ru.js';
import '@formatjs/intl-numberformat/locale-data/en.js';
import '@formatjs/intl-numberformat/locale-data/en-GB.js';

import '@formatjs/intl-datetimeformat/polyfill.js';
import '@formatjs/intl-datetimeformat/add-golden-tz.js';
import '@formatjs/intl-datetimeformat/locale-data/hy.js';
import '@formatjs/intl-datetimeformat/locale-data/ru.js';
import '@formatjs/intl-datetimeformat/locale-data/en.js';
import '@formatjs/intl-datetimeformat/locale-data/en-GB.js';

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
