import * as Location from 'expo-location';
import { Platform } from 'react-native';
import type { Coordinates } from './model';

/**
 * The phone's position for distances, without ever prompting.
 *
 * The map is the screen that asks for location (see `useUserLocation`); a list
 * refetching must not throw a permission dialog in the diner's face. So this
 * only reads a position the diner has already allowed, and a refusal, a phone
 * with services off, or the web build all answer `null` — which the cards show
 * as "no distance", not as a distance from somewhere invented.
 *
 * The last known fix is enough for "0.3 km": it is instant and a few hundred
 * metres of staleness does not change the order of a list.
 */
export async function readDevicePosition(): Promise<Coordinates | null> {
  if (Platform.OS === 'web') return null;
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    if (!last) return null;
    return { latitude: last.coords.latitude, longitude: last.coords.longitude };
  } catch {
    return null;
  }
}
