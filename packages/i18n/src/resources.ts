import enAdmin from './locales/en/admin.json';
import enCommon from './locales/en/common.json';
import enDiner from './locales/en/diner.json';
import enStaff from './locales/en/staff.json';
import hyAdmin from './locales/hy/admin.json';
import hyCommon from './locales/hy/common.json';
import hyDiner from './locales/hy/diner.json';
import hyStaff from './locales/hy/staff.json';
import ruAdmin from './locales/ru/admin.json';
import ruCommon from './locales/ru/common.json';
import ruDiner from './locales/ru/diner.json';
import ruStaff from './locales/ru/staff.json';

/**
 * Namespaces are per surface so an app only ships the copy it renders, plus
 * `common` which every surface needs.
 */
export const NAMESPACES = ['common', 'diner', 'staff', 'admin'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE: Namespace = 'common';

export const resources = {
  hy: { common: hyCommon, diner: hyDiner, staff: hyStaff, admin: hyAdmin },
  ru: { common: ruCommon, diner: ruDiner, staff: ruStaff, admin: ruAdmin },
  en: { common: enCommon, diner: enDiner, staff: enStaff, admin: enAdmin },
} as const;

/**
 * Armenian is the fallback, so its files are the shape every other language is
 * checked against by `pnpm i18n:check`.
 */
export type Resources = (typeof resources)['hy'];
