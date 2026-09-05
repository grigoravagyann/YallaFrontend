import { createStore, type UseStore } from 'idb-keyval';

/**
 * The IndexedDB stores the web app owns.
 *
 * Every durable thing the browser keeps — the staff action queue, the refresh
 * token, the tablet's own device token, the cached menu — is opened through
 * this function so the names are spelled once. Nothing in this app uses
 * `localStorage` or `sessionStorage`: both are readable by any script that runs
 * on the origin, neither survives the browser deciding a PWA is idle, and
 * neither holds anything but strings.
 *
 * One database per store, not one database with several stores. `idb-keyval`
 * creates its object store only when it creates the database, so a second
 * store added to an existing database is never created and every read throws
 * `NotFoundError` — which, on a tablet that already has the queue's database,
 * would make the token store fail before the first render. Separate databases
 * cost nothing and cannot collide. The queue keeps its original name so
 * actions already saved on a tablet are still found.
 */
const STORES = {
  'action-queue': { database: 'yalla-staff', store: 'action-queue' },
  auth: { database: 'yalla-auth', store: 'auth' },
  /**
   * The tablet's own credential and the people who have signed in on it.
   *
   * Deliberately its own database rather than a key in `auth`: that one holds
   * the console user's refresh token, and signing a manager out of the console
   * must not unenrol the tablet they are standing at.
   */
  device: { database: 'yalla-device', store: 'device' },
  /**
   * The menu, so order entry works on a tablet that has been rebooted in a
   * basement. Separate again, because clearing it is a cache decision and
   * clearing a credential is a security one.
   */
  'menu-cache': { database: 'yalla-menu', store: 'menu' },
} as const;

export type StoreName = keyof typeof STORES;

export function openStore(name: StoreName): UseStore {
  const { database, store } = STORES[name];
  return createStore(database, store);
}
