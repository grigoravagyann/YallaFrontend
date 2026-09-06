import { common } from './bundles/common';
import { diner } from './bundles/diner';
import { publicBundle } from './bundles/public';

/**
 * What the public branch page loads: `common`, `diner`, `public`.
 *
 * `diner` is here because the page reuses the reservation copy rather than
 * rewriting it — the availability window, the free-cancellation deadline, every
 * verification failure and every reason a table cannot be picked all resolve
 * against keys the phone app already has, in three languages. See
 * `@yalla/api`'s `contracts/reservation.ts` for why the rules moved too.
 *
 * What is *not* here is the point of the file. `admin` and `staff` are about
 * 138 kB of JSON across three languages, and a stranger opening a link on
 * mobile data outside a restaurant should not download the venue console's
 * copy to find out whether table 7 is free.
 */
export const publicResources = {
  hy: { common: common.hy, diner: diner.hy, public: publicBundle.hy },
  ru: { common: common.ru, diner: diner.ru, public: publicBundle.ru },
  en: { common: common.en, diner: diner.en, public: publicBundle.en },
} as const;

export const PUBLIC_NAMESPACES = ['common', 'diner', 'public'] as const;
