import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPosition, type PositionSource } from './positionFix';
import { positionKey, usePosition } from './positionStore';

const HERE = { latitude: 40.1792, longitude: 44.4991 };

function source(over: Partial<PositionSource> = {}): PositionSource {
  return {
    permissionGranted: async () => true,
    lastKnown: async () => null,
    current: async () => HERE,
    ...over,
  };
}

describe('reading the position for distances', () => {
  it('uses a recent cached fix and asks for nothing more', async () => {
    const current = vi.fn(async () => HERE);
    expect(await readPosition(source({ lastKnown: async () => HERE, current }))).toEqual(HERE);
    expect(current).not.toHaveBeenCalled();
  });

  it('asks for a fresh fix when the phone has no recent one', async () => {
    expect(await readPosition(source())).toEqual(HERE);
  });

  it('goes on without a distance when the fresh fix is slow', async () => {
    const never = () => new Promise<null>(() => undefined);
    expect(await readPosition(source({ current: never }), 5)).toBeNull();
  });

  it('never reads a position the diner has not allowed', async () => {
    const lastKnown = vi.fn(async () => HERE);
    expect(
      await readPosition(source({ permissionGranted: async () => false, lastKnown })),
    ).toBeNull();
    expect(lastKnown).not.toHaveBeenCalled();
  });

  it('treats location services that fail as no position', async () => {
    const failing = async () => {
      throw new Error('location services are off');
    };
    expect(await readPosition(source({ current: failing }))).toBeNull();
  });
});

describe('the position the place queries are keyed on', () => {
  beforeEach(() => usePosition.setState({ position: null }));

  it('takes the first fix, ignores a few metres of jitter and takes a real move', () => {
    usePosition.getState().note(HERE);
    expect(usePosition.getState().position).toEqual(HERE);

    // About 55 m north.
    usePosition.getState().note({ latitude: 40.1797, longitude: 44.4991 });
    expect(usePosition.getState().position).toEqual(HERE);

    // About 1.1 km north.
    const across = { latitude: 40.1892, longitude: 44.4991 };
    usePosition.getState().note(across);
    expect(usePosition.getState().position).toEqual(across);
  });

  it('rounds to about a hundred metres', () => {
    expect(positionKey({ latitude: 40.17923, longitude: 44.49917 })).toEqual([40.179, 44.499]);
    expect(positionKey(null)).toBeNull();
  });
});
