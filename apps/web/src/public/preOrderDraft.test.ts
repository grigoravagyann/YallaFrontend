import { PRE_ORDER_LIMITS, type BranchMenu, type PreOrder } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  addOne,
  canAddMore,
  draftCommand,
  emptyDraft,
  isDirty,
  priceDraft,
  quantityOf,
  removeLine,
  removeOne,
  setLineNote,
  setNote,
  startDraft,
} from './preOrderDraft';

/**
 * The pre-order editor's draft (2026-10-21): what the guest is building, the
 * whole list every save, priced at the locked prices the server keeps.
 */

const PRE_ORDER: PreOrder = {
  id: 'po-1',
  reservationId: 'r-1',
  state: 'editable',
  lines: [
    {
      id: 'l-1',
      menuItemId: 'khachapuri',
      name: 'Khachapuri',
      unitPriceDram: 3200,
      quantity: 2,
      lineTotalDram: 6400,
      note: 'no egg',
      availableNow: true,
    },
    {
      id: 'l-2',
      menuItemId: 'cold-brew',
      name: 'Cold brew',
      unitPriceDram: 1500,
      quantity: 1,
      lineTotalDram: 1500,
      note: null,
      availableNow: false,
    },
  ],
  note: 'Salad first',
  totalDram: 7900,
  editableUntilUtc: '2026-10-22T15:00:00Z',
  dueAtUtc: '2026-10-22T16:30:00Z',
  sentAtUtc: null,
  kitchenStatus: null,
  onTab: false,
  notComingAtUtc: null,
  updatedAtUtc: '2026-10-21T10:00:00Z',
};

function dish(id: string, name: string, priceDram: number) {
  return {
    id,
    categoryId: 'c-1',
    name,
    description: '',
    priceDram,
    photo: { id: null, thumbnailUrl: '', cardUrl: '', fullUrl: '' },
    ingredients: '',
    allergens: '',
    portionSize: '',
    prepMinutes: 10,
    spiceLevel: 'notSpicy',
    isAvailable: true,
    availableForPreOrder: true,
  };
}

// The picker's menu: khachapuri now costs more; the cold brew is gone from it.
const MENU = {
  branchId: 'b-1',
  fetchedAtUtc: '2026-10-21T10:00:00Z',
  categories: [
    {
      id: 'c-1',
      name: 'Food',
      items: [dish('khachapuri', 'Khachapuri', 3600), dish('salad', 'Salad', 2400)],
    },
  ],
} as unknown as BranchMenu;

describe('the draft', () => {
  it('starts from the pre-order there is, notes as written', () => {
    expect(startDraft(PRE_ORDER)).toEqual({
      lines: [
        { menuItemId: 'khachapuri', quantity: 2, note: 'no egg' },
        { menuItemId: 'cold-brew', quantity: 1, note: '' },
      ],
      note: 'Salad first',
    });
    expect(startDraft(null)).toEqual(emptyDraft);
  });

  it('adds a dish as a new line, then bumps the same line', () => {
    let draft = addOne(emptyDraft, 'salad');
    draft = addOne(draft, 'salad');
    expect(draft.lines).toEqual([{ menuItemId: 'salad', quantity: 2, note: '' }]);
    expect(quantityOf(draft, 'salad')).toBe(2);
  });

  it('takes one away and drops the line at nought', () => {
    let draft = addOne(addOne(emptyDraft, 'salad'), 'salad');
    draft = removeOne(draft, 'salad');
    expect(quantityOf(draft, 'salad')).toBe(1);
    draft = removeOne(draft, 'salad');
    expect(draft.lines).toEqual([]);
  });

  it('never goes past the per-dish or the total bound', () => {
    let draft = emptyDraft;
    for (let i = 0; i < PRE_ORDER_LIMITS.maxQuantity + 3; i += 1) draft = addOne(draft, 'salad');
    expect(quantityOf(draft, 'salad')).toBe(PRE_ORDER_LIMITS.maxQuantity);
    expect(canAddMore(draft, 'salad')).toBe(false);
    expect(canAddMore(draft, 'khachapuri')).toBe(true);

    let full = emptyDraft;
    ['a', 'b', 'c'].forEach((id) => {
      for (let i = 0; i < PRE_ORDER_LIMITS.maxQuantity; i += 1) full = addOne(full, id);
    });
    expect(canAddMore(full, 'd')).toBe(false);
    expect(addOne(full, 'd')).toBe(full);
  });

  it('edits and removes a line, and the booking note', () => {
    let draft = startDraft(PRE_ORDER);
    draft = setLineNote(draft, 1, 'iced');
    draft = setNote(draft, 'Window please');
    expect(draft.lines[1]?.note).toBe('iced');
    expect(draft.note).toBe('Window please');
    expect(removeLine(draft, 0).lines.map((line) => line.menuItemId)).toEqual(['cold-brew']);
  });

  it('sends notes trimmed, blank as none', () => {
    const draft = setNote(setLineNote(startDraft(PRE_ORDER), 0, '   '), '  Salad first ');
    expect(draftCommand(draft)).toEqual({
      lines: [
        { menuItemId: 'khachapuri', quantity: 2, note: null },
        { menuItemId: 'cold-brew', quantity: 1, note: null },
      ],
      note: 'Salad first',
    });
  });

  it('knows when nothing changed', () => {
    expect(isDirty(startDraft(PRE_ORDER), PRE_ORDER)).toBe(false);
    expect(isDirty(setNote(startDraft(PRE_ORDER), 'Salad first  '), PRE_ORDER)).toBe(false);
    expect(isDirty(addOne(startDraft(PRE_ORDER), 'salad'), PRE_ORDER)).toBe(true);
    expect(isDirty(emptyDraft, null)).toBe(false);
  });
});

describe('the price', () => {
  it('keeps the locked price of a dish already ordered and prices a new one now', () => {
    const priced = priceDraft(addOne(startDraft(PRE_ORDER), 'salad'), {
      preOrder: PRE_ORDER,
      menu: MENU,
    });
    expect(priced.lines.map((line) => [line.name, line.unitPriceDram, line.lineTotalDram])).toEqual(
      [
        ['Khachapuri', 3200, 6400],
        ['Cold brew', 1500, 1500],
        ['Salad', 2400, 2400],
      ],
    );
    expect(priced.totalDram).toBe(10300);
  });

  it('flags a dish the server or the menu says is not available now', () => {
    const priced = priceDraft(startDraft(PRE_ORDER), { preOrder: PRE_ORDER, menu: MENU });
    expect(priced.lines.map((line) => line.unavailable)).toEqual([false, true]);
    expect(priced.unavailable).toEqual(['cold-brew']);
  });

  it('flags what a refusal named, and nothing from the menu before it loads', () => {
    const draft = addOne(emptyDraft, 'salad');
    expect(priceDraft(draft, { preOrder: null, menu: null }).unavailable).toEqual([]);
    expect(
      priceDraft(draft, { preOrder: null, menu: MENU, refused: ['salad'] }).unavailable,
    ).toEqual(['salad']);
  });
});
