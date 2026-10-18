/**
 * The web build's `Intl`: the same @formatjs implementation and locale data the
 * phone runs on Hermes, installed whatever the browser ships.
 *
 * `intlPolyfills.ts` probes and steps aside where the native `Intl` has the
 * features. A browser can have every feature and still lack Armenian locale
 * data, and then it answers each `hy-AM` request in its own default, en-US —
 * the QA pass read "Fri 16", "Oct 14, 2026" and "09:00 AM – 01:00 AM" under
 * Armenian labels. Forcing the formatters here makes the web export format as
 * the phone does, for every browser. The code is already in the bundle: the
 * probing entries carry the whole implementation too.
 *
 * Same order and the same locale set as the phone's file; keep the two in step.
 * Metro resolves `./intlPolyfills` to this file in the browser.
 *
 * The forced `DateTimeFormat` defaults to UTC, so the browser's own zone is
 * read first — `deviceTimeZone` is imported before any polyfill — and handed
 * to it once installed: a time on the diner's own clock stays theirs.
 */
import { adoptDefaultTimeZone, platformTimeZone } from './deviceTimeZone';

import '@formatjs/intl-getcanonicallocales/polyfill.js';
import '@formatjs/intl-locale/polyfill.js';

import '@formatjs/intl-pluralrules/polyfill-force.js';
import '@formatjs/intl-pluralrules/locale-data/hy.js';
import '@formatjs/intl-pluralrules/locale-data/ru.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';

import '@formatjs/intl-numberformat/polyfill-force.js';
import '@formatjs/intl-numberformat/locale-data/hy.js';
import '@formatjs/intl-numberformat/locale-data/ru.js';
import '@formatjs/intl-numberformat/locale-data/en.js';
import '@formatjs/intl-numberformat/locale-data/en-GB.js';

import '@formatjs/intl-datetimeformat/polyfill-force.js';
import '@formatjs/intl-datetimeformat/add-golden-tz.js';
import '@formatjs/intl-datetimeformat/locale-data/hy.js';
import '@formatjs/intl-datetimeformat/locale-data/ru.js';
import '@formatjs/intl-datetimeformat/locale-data/en.js';
import '@formatjs/intl-datetimeformat/locale-data/en-GB.js';

import '@formatjs/intl-listformat/polyfill-force.js';
import '@formatjs/intl-listformat/locale-data/hy.js';
import '@formatjs/intl-listformat/locale-data/ru.js';
import '@formatjs/intl-listformat/locale-data/en.js';
import '@formatjs/intl-listformat/locale-data/en-GB.js';

import '@formatjs/intl-relativetimeformat/polyfill-force.js';
import '@formatjs/intl-relativetimeformat/locale-data/hy.js';
import '@formatjs/intl-relativetimeformat/locale-data/ru.js';
import '@formatjs/intl-relativetimeformat/locale-data/en.js';
import '@formatjs/intl-relativetimeformat/locale-data/en-GB.js';

adoptDefaultTimeZone(platformTimeZone);
