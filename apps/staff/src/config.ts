import { resolveApiConfig } from '@yalla/api';

/**
 * Expo inlines only `EXPO_PUBLIC_`-prefixed variables into the bundle.
 * Set it in `.env` (see `.env.example`) to point at a local backend.
 */
export const apiConfig = resolveApiConfig(process.env['EXPO_PUBLIC_API_BASE_URL']);
