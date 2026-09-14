import { haversineKm } from '@yalla/api';
import { create } from 'zustand';
import type { Coordinates } from './model';

/** Latitude and longitude rounded to about a hundred metres: what place queries are keyed on. */
export type PositionKey = readonly [latitude: number, longitude: number];

/** A move shorter than this changes no distance on a card enough to read the lists again. */
export const POSITION_CHANGE_KM = 0.15;

interface PositionState {
  /** The last position worth reading the lists again for; `null` until the phone has given one. */
  readonly position: Coordinates | null;
  /** A fix from anywhere in the app: the map's, or a list's own read. Small moves are ignored. */
  readonly note: (next: Coordinates) => void;
}

/**
 * The phone's position as the browse queries see it.
 *
 * Distances and nearest-first depend on it, so it is part of their cache keys:
 * a first fix after permission is granted on the map, or a real move, is a new
 * answer rather than one that stays wrong for the five minutes the lists are
 * cached. Jitter under {@link POSITION_CHANGE_KM} is ignored, so two reads a few
 * metres apart cannot bounce the lists between keys. A lost fix does not clear
 * it: the lists keep the last answer rather than flickering to no distances.
 */
export const usePosition = create<PositionState>((set, get) => ({
  position: null,
  note: (next) => {
    if (!Number.isFinite(next.latitude) || !Number.isFinite(next.longitude)) return;
    const current = get().position;
    if (current && haversineKm(current, next) < POSITION_CHANGE_KM) return;
    set({ position: { latitude: next.latitude, longitude: next.longitude } });
  },
}));

export function positionKey(position: Coordinates | null): PositionKey | null {
  if (!position) return null;
  return [
    Math.round(position.latitude * 1000) / 1000,
    Math.round(position.longitude * 1000) / 1000,
  ];
}
