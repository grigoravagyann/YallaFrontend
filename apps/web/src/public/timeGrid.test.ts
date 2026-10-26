import { describe, expect, it } from 'vitest';
import { gridStep } from './timeGrid';

describe('gridStep', () => {
  it('steps across a row with the side arrows', () => {
    expect(gridStep('ArrowRight', 4)).toBe(1);
    expect(gridStep('ArrowLeft', 4)).toBe(-1);
  });

  it('steps down and up a column by the row length', () => {
    expect(gridStep('ArrowDown', 4)).toBe(4);
    expect(gridStep('ArrowUp', 3)).toBe(-3);
  });

  it('is nothing for any other key', () => {
    expect(gridStep('Enter', 4)).toBeNull();
    expect(gridStep('Home', 4)).toBeNull();
  });
});
