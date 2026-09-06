import { admin } from './bundles/admin';
import { common } from './bundles/common';
import { diner } from './bundles/diner';
import { publicBundle } from './bundles/public';
import { staff } from './bundles/staff';
export { DEFAULT_NAMESPACE, NAMESPACES } from './namespaces';
export type { Namespace } from './namespaces';

/**
 * Namespaces are per surface so an app only ships the copy it renders, plus
 * `common` which every surface needs.
 *
 * `public` is the branch page a stranger opens from a link. It is deliberately
 * *small*: everything the page says about a table, a window, a cancellation
 * deadline or a verification code comes from `diner`, because that copy is
 * already written, already translated three times, and describes the same
 * promise. A second wording of "held for you 20:00 – 21:45" would drift within
 * a release and would have to be translated twice.
 */
export const resources = {
  hy: {
    common: common.hy,
    diner: diner.hy,
    public: publicBundle.hy,
    staff: staff.hy,
    admin: admin.hy,
  },
  ru: {
    common: common.ru,
    diner: diner.ru,
    public: publicBundle.ru,
    staff: staff.ru,
    admin: admin.ru,
  },
  en: {
    common: common.en,
    diner: diner.en,
    public: publicBundle.en,
    staff: staff.en,
    admin: admin.en,
  },
} as const;

/**
 * Armenian is the fallback, so its files are the shape every other language is
 * checked against by `pnpm i18n:check`.
 */
export type Resources = (typeof resources)['hy'];
