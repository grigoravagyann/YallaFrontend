import { useMemo, useState } from 'react';
import type { PlaceRoom } from '../places/model';
import { partyFits, resolveChosenTable, type RouteTable } from './formRules';

/**
 * The table from a photo: the one the diner came with, or one tapped here —
 * with every pin's live state, for the moment before the slot has answered.
 */
export function useChosenTable(rooms: readonly PlaceRoom[], route: RouteTable) {
  const { tableId, tableLabel, capacityMin: routeMin, capacityMax: routeMax } = route;
  // Every pin's live state, for the moment before the slot has answered.
  const tables = useMemo(
    () => rooms.flatMap((room) => room.photos.flatMap((photo) => photo.tables)),
    [rooms],
  );

  // The table from a photo: the one the diner came with, or one tapped here.
  const [pickedTableId, setPickedTableId] = useState<string | null>(tableId ?? null);
  const chosenTable = useMemo(
    () =>
      resolveChosenTable(
        pickedTableId,
        { tableId, tableLabel, capacityMin: routeMin, capacityMax: routeMax },
        tables,
      ),
    [pickedTableId, tableId, tableLabel, routeMin, routeMax, tables],
  );
  const capacityMin = chosenTable?.capacityMin ?? null;
  const capacityMax = chosenTable?.capacityMax ?? null;
  const fits = (size: number): boolean => partyFits(size, capacityMin, capacityMax);

  return { tables, pickedTableId, setPickedTableId, chosenTable, capacityMin, capacityMax, fits };
}
