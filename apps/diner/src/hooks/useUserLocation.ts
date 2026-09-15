import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Coordinates } from '../places/model';
import { usePosition } from '../places/positionStore';

/** Where the map opens when the phone will not say where it is. */
export const YEREVAN_CENTRE: Coordinates = { latitude: 40.1792, longitude: 44.4991 };

export type UserLocationStatus = 'locating' | 'located' | 'fallback';

export interface UserLocation {
  /** The diner, or Yerevan centre while locating and after a refusal. */
  readonly coords: Coordinates;
  readonly status: UserLocationStatus;
  /** True once the app has given up and is showing Yerevan centre instead. */
  readonly isFallback: boolean;
  readonly isLocating: boolean;
  /** Ask again — the "my location" button after a refusal. */
  readonly refresh: () => Promise<void>;
}

/**
 * The diner's position, asked for once per mount.
 *
 * Permission is requested on first use, not at launch: the map is the first
 * screen with a reason to know. A refusal, a phone with location services off,
 * or the web build (where the browser's prompt is a worse experience than a
 * city-centre default) all fall back to Yerevan centre and say so through
 * `isFallback`, so the map can show one note rather than a blank or a spinner.
 *
 * The last known fix is used first when there is one — it arrives in
 * milliseconds — and a fresh one replaces it when the GPS settles.
 */
export function useUserLocation(): UserLocation {
  const [coords, setCoords] = useState<Coordinates>(YEREVAN_CENTRE);
  // The web build never asks: it opens on the city centre and stays there.
  const [status, setStatus] = useState<UserLocationStatus>(
    Platform.OS === 'web' ? 'fallback' : 'locating',
  );
  // Bumped on unmount and on every refresh so a slow fix from an earlier
  // attempt cannot land after a newer answer.
  const attempt = useRef(0);

  const locate = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const id = ++attempt.current;
    const live = () => attempt.current === id;

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!live()) return;
      if (!permission.granted) {
        setStatus('fallback');
        return;
      }

      const last = await Location.getLastKnownPositionAsync();
      if (!live()) return;
      if (last) {
        setCoords(toCoordinates(last));
        setStatus('located');
        // The lists' distances are keyed on this: a first fix here re-reads them.
        usePosition.getState().note(toCoordinates(last));
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!live()) return;
      setCoords(toCoordinates(current));
      setStatus('located');
      usePosition.getState().note(toCoordinates(current));
    } catch {
      // Services off, airplane mode, a simulator with no fix: the city centre.
      if (live()) setStatus((previous) => (previous === 'located' ? previous : 'fallback'));
    }
  }, []);

  useEffect(() => {
    // Deferred a tick: the permission prompt is a side effect on the platform,
    // not a state to synchronise on the frame this mounts.
    void Promise.resolve().then(locate);
    return () => {
      attempt.current += 1;
    };
  }, [locate]);

  const refresh = useCallback(async () => {
    if (Platform.OS === 'web') return;
    setStatus('locating');
    await locate();
  }, [locate]);

  return {
    coords,
    status,
    isFallback: status === 'fallback',
    isLocating: status === 'locating',
    refresh,
  };
}

function toCoordinates(position: Location.LocationObject): Coordinates {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
