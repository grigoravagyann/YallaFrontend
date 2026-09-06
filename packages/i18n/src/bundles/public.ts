import en from '../locales/en/public.json';
import hy from '../locales/hy/public.json';
import ru from '../locales/ru/public.json';

/** Named `publicBundle` because `public` is a reserved word inside a module. */
export const publicBundle = { hy, ru, en } as const;
