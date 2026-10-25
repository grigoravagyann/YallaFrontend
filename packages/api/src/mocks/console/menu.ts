import type {
  AdminMenuCategory,
  AdminMenuItem,
  MenuItemDeletion,
  Photo,
} from '../../contracts/menuAdmin';
import { CategoryInUseError, UnsupportedImageError } from '../../contracts/errors';
import { validationFailed } from '../problems';
import type { PhotoUpload } from '../../consoleGateway';
import type { ConsoleGateway } from '../../consoleGateway';
import {
  type ConsoleMockContext,
  MOCK_MAX_UPLOAD_BYTES,
  type MockCategory,
  type MockItem,
  URL_TAG,
} from './context';

/** The menu editor and photo upload. */
export function menuMethods(
  ctx: ConsoleMockContext,
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
  | 'uploadPhoto'
> {
  const {
    isPermutation,
    menuFor,
    nextId,
    orderedItemIds,
    photoBranch,
    photosById,
    requireBranchInVenue,
    requireCategory,
    requireItem,
    sortedMenu,
    toCategory,
    toItem,
    uploadedPhotos,
    wait,
  } = ctx;
  return {
    // --- The menu editor --------------------------------------------------------

    async getAdminMenu(branchId): Promise<readonly AdminMenuCategory[]> {
      await wait();
      requireBranchInVenue(branchId);
      return sortedMenu(menuFor(branchId));
    },

    async createCategory({ branchId, name, displayOrder }): Promise<AdminMenuCategory> {
      await wait();
      const categories = menuFor(branchId);
      // Absent: last, as the server places it.
      const order =
        displayOrder ?? Math.max(-1, ...categories.map((candidate) => candidate.displayOrder)) + 1;
      const category: MockCategory = { id: nextId('cat'), name, displayOrder: order, items: [] };
      categories.push(category);
      return toCategory(category);
    },

    async updateCategory({ branchId, categoryId, name, displayOrder }) {
      await wait();
      const category = requireCategory(branchId, categoryId);
      if (name !== undefined) category.name = name;
      if (displayOrder !== undefined) category.displayOrder = displayOrder;
      return toCategory(category);
    },

    async deleteCategory({ branchId, categoryId }): Promise<void> {
      await wait();
      const category = requireCategory(branchId, categoryId);
      // The real refusal, simulated: an item that has been ordered cannot go,
      // and the category cannot go without it. `orderedItemIds` is seeded so
      // the branch is reachable without placing an order first.
      if (category.items.some((item) => orderedItemIds.has(item.id))) {
        throw new CategoryInUseError({
          url: `${URL_TAG}/menu/${categoryId}`,
          categoryId,
          // `MenuService.DeleteCategoryAsync`'s DomainStateException, verbatim.
          detail:
            `Category '${category.name}' has items that appear on orders and cannot be deleted. ` +
            'Mark its items unavailable instead.',
        });
      }
      const categories = menuFor(branchId);
      categories.splice(categories.indexOf(category), 1);
    },

    async createMenuItem({ branchId, item }): Promise<AdminMenuItem> {
      await wait();
      const category = requireCategory(branchId, item.categoryId);
      const created: MockItem = {
        id: nextId('item'),
        categoryId: category.id,
        name: item.name,
        description: item.description,
        priceDram: item.priceDram,
        ingredients: item.ingredients,
        allergens: item.allergens,
        portionSize: item.portionSize,
        spiceLevel: item.spiceLevel,
        prepMinutes: item.prepMinutes ?? 0,
        photoId: item.photoId,
        isAvailable: true,
        displayOrder:
          item.displayOrder ??
          Math.max(-1, ...category.items.map((candidate) => candidate.displayOrder)) + 1,
      };
      category.items.push(created);
      return toItem(created);
    },

    async updateMenuItem({ branchId, itemId, patch }): Promise<AdminMenuItem> {
      await wait();
      const item = requireItem(branchId, itemId);
      if (patch.name !== undefined) item.name = patch.name;
      if (patch.description !== undefined) item.description = patch.description;
      if (patch.priceDram !== undefined) item.priceDram = patch.priceDram;
      if (patch.ingredients !== undefined) item.ingredients = patch.ingredients;
      if (patch.allergens !== undefined) item.allergens = patch.allergens;
      if (patch.portionSize !== undefined) item.portionSize = patch.portionSize;
      if (patch.spiceLevel !== undefined) item.spiceLevel = patch.spiceLevel;
      if (patch.prepMinutes !== undefined) item.prepMinutes = patch.prepMinutes;
      if (patch.photoId !== undefined) item.photoId = patch.photoId;
      if (patch.displayOrder !== undefined) item.displayOrder = patch.displayOrder;
      if (patch.availableForTakeaway !== undefined) {
        item.notForTakeaway = !patch.availableForTakeaway;
      }
      return toItem(item);
    },

    async setMenuItemAvailability({ branchId, itemId, isAvailable }): Promise<AdminMenuItem> {
      await wait();
      const item = requireItem(branchId, itemId);
      item.isAvailable = isAvailable;
      return toItem(item);
    },

    async reorderMenuCategories({ branchId, categoryIds }) {
      await wait();
      requireBranchInVenue(branchId);
      const categories = menuFor(branchId);
      // The whole list, each once: anything else is a stale menu, refused whole.
      if (
        !isPermutation(
          categoryIds,
          categories.map((category) => category.id),
        )
      ) {
        throw validationFailed(`${URL_TAG}/menu/categories/order`, [
          {
            field: 'categoryIds',
            message: 'The list must name every category of the branch exactly once.',
            bound: 'conflict',
          },
        ]);
      }
      categoryIds.forEach((id, index) => {
        categories.find((category) => category.id === id)!.displayOrder = index;
      });
      return sortedMenu(categories);
    },

    async reorderMenuItems({ branchId, categoryId, itemIds }) {
      await wait();
      requireBranchInVenue(branchId);
      const category = requireCategory(branchId, categoryId);
      if (
        !isPermutation(
          itemIds,
          category.items.map((item) => item.id),
        )
      ) {
        throw validationFailed(`${URL_TAG}/menu/categories/${categoryId}/items/order`, [
          {
            field: 'itemIds',
            message: 'The list must name every item of the category exactly once.',
            bound: 'conflict',
          },
        ]);
      }
      itemIds.forEach((id, index) => {
        category.items.find((item) => item.id === id)!.displayOrder = index;
      });
      return toCategory(category);
    },

    async removeMenuItemPhoto({ branchId, itemId }) {
      await wait();
      const item = requireItem(branchId, itemId);
      item.photoId = null;
      return toItem(item);
    },

    async deleteMenuItem({ branchId, itemId }): Promise<MenuItemDeletion> {
      await wait();
      const item = requireItem(branchId, itemId);

      // An item on an order is deactivated rather than deleted: the order line
      // points at it and that reference has to survive. The server says which
      // happened and so does this, because a "deleted" item still on the list
      // is the kind of thing somebody deletes twice.
      if (orderedItemIds.has(item.id)) {
        item.isAvailable = false;
        return {
          itemId,
          deleted: false,
          deactivated: true,
          message: 'This item appears on an order, so it was marked unavailable instead.',
        };
      }

      for (const category of menuFor(branchId)) {
        const index = category.items.indexOf(item);
        if (index >= 0) category.items.splice(index, 1);
      }
      return { itemId, deleted: true, deactivated: false, message: 'Removed.' };
    },

    // --- Photos ------------------------------------------------------------------

    async uploadPhoto({ branchId, file, fileName, onProgress }): Promise<PhotoUpload> {
      requireBranchInVenue(branchId);
      // Progress in steps, because a bar that jumps from nothing to done is a
      // bar nobody believes, and this is the one screen where the wait is real.
      for (const fraction of [0.25, 0.6, 0.9]) {
        await wait();
        onProgress?.(fraction);
      }

      // The real refusals, on the same signals the server uses. The bytes are
      // not sniffed here — a mock cannot decode an image — so the extension
      // stands in, with the one case that matters called out: a HEIC saved as
      // `.jpg` is refused by the server and would sail through this check.
      if (file.size > MOCK_MAX_UPLOAD_BYTES) {
        throw new UnsupportedImageError({
          url: `${URL_TAG}/photos`,
          reason: 'tooLarge',
          detail: 'That photo is larger than 8 MB. Export it smaller and try again.',
        });
      }
      if (!/\.(jpe?g|png|webp)$/iu.test(fileName)) {
        throw new UnsupportedImageError({
          url: `${URL_TAG}/photos`,
          reason: 'format',
          detectedFormat: fileName.split('.').pop()?.toLowerCase() ?? null,
          detail: 'That file is not a JPEG, PNG or WebP.',
        });
      }

      // Deduplicated by size and name, which is the closest a mock gets to the
      // server's content hash. Reported rather than hidden: an upload that
      // wrote nothing looks like a failure.
      // Per branch, as the server's content hash is looked up per branch.
      const key = `${branchId}:${fileName}:${file.size}`;
      const existing = uploadedPhotos.get(key);
      if (existing) {
        onProgress?.(1);
        return { photo: existing, wasDeduplicated: true, bytesStored: 0 };
      }

      const photoId = nextId('photo');
      const stored: Photo = {
        photoId,
        thumbnailUrl: `/api/photos/${photoId}/thumbnail`,
        cardUrl: `/api/photos/${photoId}/card`,
        fullUrl: `/api/photos/${photoId}/full`,
        width: 1600,
        height: 1200,
      };
      uploadedPhotos.set(key, stored);
      photosById.set(photoId, stored);
      photoBranch.set(photoId, branchId);
      onProgress?.(1);
      return { photo: stored, wasDeduplicated: false, bytesStored: file.size };
    },
  };
}
