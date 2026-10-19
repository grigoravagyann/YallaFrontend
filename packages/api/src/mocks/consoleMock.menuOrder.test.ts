import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/** The mock reorders the menu as the server does (VC3 wire §2): the whole list, or nothing. */

const BRANCH = 'b-lumen-cascade';

describe('reordering the menu in the mock', () => {
  it('puts the categories in the order sent, and answers with the whole menu', async () => {
    const mock = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const ids = (await mock.getAdminMenu(BRANCH)).map((category) => category.id);
    const reversed = [...ids].reverse();

    const menu = await mock.reorderMenuCategories({ branchId: BRANCH, categoryIds: reversed });
    expect(menu.map((category) => category.id)).toEqual(reversed);
    expect((await mock.getAdminMenu(BRANCH)).map((category) => category.id)).toEqual(reversed);
  });

  it("puts a category's dishes in the order sent", async () => {
    const mock = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const [first] = await mock.getAdminMenu(BRANCH);
    const itemIds = first!.items.map((entry) => entry.id).reverse();

    const category = await mock.reorderMenuItems({
      branchId: BRANCH,
      categoryId: first!.id,
      itemIds,
    });
    expect(category.items.map((entry) => entry.id)).toEqual(itemIds);
  });

  it('refuses a list that misses one or repeats one, and changes nothing', async () => {
    const mock = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const ids = (await mock.getAdminMenu(BRANCH)).map((category) => category.id);

    const short = await mock
      .reorderMenuCategories({ branchId: BRANCH, categoryIds: ids.slice(1) })
      .catch((error: unknown) => error);
    expect(short).toBeInstanceOf(ValidationError);
    expect((short as ValidationError).violations[0]).toMatchObject({
      field: 'categoryIds',
      bound: 'conflict',
    });

    const twice = await mock
      .reorderMenuCategories({ branchId: BRANCH, categoryIds: [ids[0]!, ...ids.slice(0, -1)] })
      .catch((error: unknown) => error);
    expect(twice).toBeInstanceOf(ValidationError);
    expect((await mock.getAdminMenu(BRANCH)).map((category) => category.id)).toEqual(ids);
  });
});
