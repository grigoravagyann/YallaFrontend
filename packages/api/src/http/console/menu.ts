import type { ConsoleGateway } from '../../consoleGateway';
import type { AdminMenuCategory, AdminMenuItem, MenuItemDeletion } from '../../contracts/menuAdmin';
import { absolutePhoto } from '../photoUrl';
import { CategoryInUseError, isFeatureNotEnabled } from '../../contracts/errors';
import { ApiError } from '../../errors';
import type { components } from '../../generated/schema';
import {
  adminCategory,
  adminItem,
  adminMenu,
  menuItemDeletion,
  spiceCode,
} from '../venueSettingsMapping';
import { type ConsoleHttpContext, BRANCHES } from './context';

type Schemas = components['schemas'];
type WireCategory = Schemas['Yalla.Application.Menus.MenuCategoryView'];
type WireItem = Schemas['Yalla.Application.Menus.MenuItemView'];

export function menuMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  | 'getAdminMenu'
  | 'createCategory'
  | 'updateCategory'
  | 'deleteCategory'
  | 'createMenuItem'
  | 'updateMenuItem'
  | 'setMenuItemAvailability'
  | 'reorderMenuCategories'
  | 'reorderMenuItems'
  | 'removeMenuItemPhoto'
  | 'deleteMenuItem'
> {
  const { client } = ctx;
  // Photo links resolved against the API's origin, at the boundary — see
  // `photoUrl.ts`. The console is the one client that draws every variant.
  const absoluteItem = (item: AdminMenuItem): AdminMenuItem => ({
    ...item,
    photo: absolutePhoto(client.baseUrl, item.photo),
  });
  const absoluteCategory = (category: AdminMenuCategory): AdminMenuCategory => ({
    ...category,
    items: category.items.map(absoluteItem),
  });

  return {
    // --- The menu editor --------------------------------------------------------

    async getAdminMenu(branchId: string): Promise<readonly AdminMenuCategory[]> {
      // `/menu/manage`, not the diner's `/menu`: this one is reachable for a
      // suspended venue, and a manager fixing their menu during a suspension is
      // exactly who is looking at this screen.
      const { data } = await client.get<WireCategory[]>(`${BRANCHES}/${branchId}/menu/manage`);
      return adminMenu(data ?? []).map(absoluteCategory);
    },

    async createCategory({ branchId, name, displayOrder }): Promise<AdminMenuCategory> {
      const { data } = await client.post<WireCategory>(`${BRANCHES}/${branchId}/menu/categories`, {
        name,
        ...(displayOrder !== undefined ? { displayOrder } : {}),
      } satisfies Schemas['Yalla.Application.Menus.CreateMenuCategoryCommand']);
      return absoluteCategory(adminCategory(data));
    },

    async updateCategory({ branchId, categoryId, name, displayOrder }) {
      const { data } = await client.patch<WireCategory>(
        `${BRANCHES}/${branchId}/menu/categories/${categoryId}`,
        {
          ...(name !== undefined ? { name } : {}),
          ...(displayOrder !== undefined ? { displayOrder } : {}),
        } satisfies Schemas['Yalla.Application.Menus.UpdateMenuCategoryCommand'],
      );
      return absoluteCategory(adminCategory(data));
    },

    async deleteCategory({ branchId, categoryId }): Promise<void> {
      try {
        await client.delete(`${BRANCHES}/${branchId}/menu/categories/${categoryId}`);
      } catch (error) {
        if (!isFeatureNotEnabled(error) && error instanceof ApiError && error.status === 409) {
          throw new CategoryInUseError({
            url: error.url,
            categoryId,
            requestId: error.requestId,
          });
        }
        throw error;
      }
    },

    async createMenuItem({ branchId, item }): Promise<AdminMenuItem> {
      const { data } = await client.post<WireItem>(
        `${BRANCHES}/${branchId}/menu/categories/${item.categoryId}/items`,
        {
          name: item.name,
          description: item.description,
          priceAmd: item.priceDram,
          ingredients: item.ingredients,
          allergens: item.allergens,
          portionSize: item.portionSize,
          spiceLevel: spiceCode(item.spiceLevel),
          // A draft without them: absent, never an empty id or a zero.
          ...(item.prepMinutes !== null ? { prepMinutes: item.prepMinutes } : {}),
          ...(item.photoId ? { photoId: item.photoId } : {}),
          ...(item.displayOrder !== undefined ? { displayOrder: item.displayOrder } : {}),
        } satisfies Schemas['Yalla.Application.Menus.CreateMenuItemCommand'],
      );
      return absoluteItem(adminItem(data));
    },

    async updateMenuItem({ branchId, itemId, patch }): Promise<AdminMenuItem> {
      const { data } = await client.patch<WireItem>(
        `${BRANCHES}/${branchId}/menu/items/${itemId}`,
        {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.priceDram !== undefined ? { priceAmd: patch.priceDram } : {}),
          ...(patch.ingredients !== undefined ? { ingredients: patch.ingredients } : {}),
          ...(patch.allergens !== undefined ? { allergens: patch.allergens } : {}),
          ...(patch.portionSize !== undefined ? { portionSize: patch.portionSize } : {}),
          ...(patch.spiceLevel !== undefined ? { spiceLevel: spiceCode(patch.spiceLevel) } : {}),
          ...(patch.prepMinutes !== undefined ? { prepMinutes: patch.prepMinutes } : {}),
          ...(patch.photoId !== undefined ? { photoId: patch.photoId } : {}),
          ...(patch.displayOrder !== undefined ? { displayOrder: patch.displayOrder } : {}),
          ...(patch.availableForTakeaway !== undefined
            ? { availableForTakeaway: patch.availableForTakeaway }
            : {}),
        } satisfies Schemas['Yalla.Application.Menus.UpdateMenuItemCommand'],
      );
      return absoluteItem(adminItem(data));
    },

    async setMenuItemAvailability({ branchId, itemId, isAvailable }): Promise<AdminMenuItem> {
      const { data } = await client.post<WireItem>(
        `${BRANCHES}/${branchId}/menu/items/${itemId}/availability`,
        {
          isAvailable,
        } satisfies Schemas['Yalla.Api.Endpoints.VenueAdminEndpoints.SetAvailabilityRequest'],
      );
      return absoluteItem(adminItem(data));
    },

    async reorderMenuCategories({ branchId, categoryIds }) {
      const { data } = await client.put<WireCategory[]>(
        `${BRANCHES}/${branchId}/menu/categories/order`,
        { categoryIds },
      );
      return adminMenu(data ?? []).map(absoluteCategory);
    },

    async reorderMenuItems({ branchId, categoryId, itemIds }) {
      const { data } = await client.put<WireCategory>(
        `${BRANCHES}/${branchId}/menu/categories/${categoryId}/items/order`,
        { itemIds },
      );
      return absoluteCategory(adminCategory(data));
    },

    async removeMenuItemPhoto({ branchId, itemId }) {
      const { data } = await client.delete<WireItem>(
        `${BRANCHES}/${branchId}/menu/items/${itemId}/photo`,
      );
      return absoluteItem(adminItem(data));
    },

    async deleteMenuItem({ branchId, itemId }): Promise<MenuItemDeletion> {
      const { data } = await client.delete<
        Schemas['Yalla.Application.Menus.MenuItemDeletionResult']
      >(`${BRANCHES}/${branchId}/menu/items/${itemId}`);
      return menuItemDeletion(data);
    },
  };
}
