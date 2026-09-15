import * as Location from 'expo-location';
import { Platform } from 'react-native';
import type { Coordinates } from './model';
import { readPosition } from './positionFix';
import { usePosition } from './positionStore';

/**
 * The phone's position for distances, without ever prompting.
 *
 * The map is the screen that asks for location (see `useUserLocation`); a list
 * refetching must not throw a permission dialog in the diner's face. So this
 * only reads a position the diner has already allowed, and a refusal, a phone
 * with services off, or the web build all answer `null` — which the cards show
 * as "no distance", not as a distance from somewhere invented.
 *
 * A recent cached fix is used when there is one; otherwise a fresh
 * low-accuracy fix is asked for (still no prompt) and waited on briefly — see
 * `readPosition`. Every fix is noted in `usePosition`, which the place queries
 * are keyed on.
 */
export async function readDevicePosition(): Promise<Coordinates | null> {
  if (Platform.OS === 'web') return null;
  const position = await readPosition({
    permissionGranted: async () => (await Location.getForegroundPermissionsAsync()).granted,
    lastKnown: async (maxAge) =>
      toCoordinates(await Location.getLastKnownPositionAsync({ maxAge })),
    current: async () =>
      toCoordinates(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })),
  });
  if (position) usePosition.getState().note(position);
  return position;
}

function toCoordinates(fix: Location.LocationObject | null): Coordinates | null {
  return fix ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude } : null;
}
