import {
  CategoryInUseError,
  EMPTY_DRAFT,
  allergenText,
  duplicateDraft,
  incompleteCount,
  isComplete,
  itemToDraft,
  splitList,
  storedItemGaps,
  type AdminMenuCategory,
  type AdminMenuItem,
  type MenuItemDraft,
  type Photo,
} from '@yalla/api';
import {
  useAdminMenu,
  useCreateCategory,
  useCreateMenuItem,
  useDeleteCategory,
  useDeleteMenuItem,
  usePreOrderSettings,
  useReorderMenuCategories,
  useReorderMenuItems,
  useRemoveMenuItemPhoto,
  useSavePreOrderSettings,
  useSetMenuItemAvailability,
  useTakeawaySettings,
  useUpdateCategory,
  useUpdateMenuItem,
} from '@yalla/api/react';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { DataTable } from '../../kit';
import { Dialog } from '../../ui/Dialog';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ImageIcon,
  PlusIcon,
  SearchIcon,
} from '../../ui/icons';
import { PageHeader } from '../../ui/PageHeader';
import { useToast } from '../../ui/toast';
import { menuItemAnchorId, menuItemIdFromHash } from '../menuAnchors';
import { useVenueOutlet } from '../VenueLayout';
import { useFeatureLocked } from '../featureLock';
import { BulkPhotoDrop } from './BulkPhotoDrop';
import { CategoryNameDialog } from './CategoryNameDialog';
import { DESCRIPTIVE_FIELDS, DishDrawer, knownValues } from './DishDrawer';

type Editing =
  | {
      readonly mode: 'create';
      readonly categoryId: string;
      readonly draft: MenuItemDraft;
      readonly photo: Photo | null;
    }
  | {
      readonly mode: 'edit';
      readonly item: AdminMenuItem;
      readonly draft: MenuItemDraft;
      readonly photo: Photo | null;
    };

type Deleting =
  | { readonly kind: 'category'; readonly category: AdminMenuCategory }
  /** From the drawer: Cancel and Escape go back to it, with its edits. */
  | { readonly kind: 'item'; readonly item: AdminMenuItem; readonly back: Editing };

/**
 * The menu (Menu artboard): categories on the left in the order a guest sees
 * them, the chosen category's dishes on the right.
 *
 * Two audiences pull in opposite directions, and where they conflict the
 * first one wins:
 *
 * - **A bulk first pass.** Somebody entering eighty dishes in an afternoon,
 *   sitting in the cafe with the owner. Hence the drawer that saves a half-
 *   entered dish as a draft, bulk photos, and the banner whenever anything is
 *   unfinished: during onboarding it is the to-do list, and the answer to "is
 *   this venue ready to switch ordering on".
 * - **A one-off edit in March.** The same person comes back to mark the trout
 *   sold out, and remembers nothing: the switch is on the row.
 *
 * Where the branch takes pre-orders (2026-10-21), a dish can be switched off
 * for them on its row too: the policy's pre-order settings keep the whole
 * list, and the switch sends it with this dish in or out.
 *
 * A table rather than cards: somebody scanning eighty dishes for the one with
 * the wrong price needs density. The search looks through every category.
 * Categories and dishes move with the arrows (and by dragging); the order is
 * the one a guest sees.
 */
export function MenuEditorScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const { branchId, branchName } = useVenueOutlet();

  const menuQuery = useAdminMenu(branchId ?? undefined);
  const categories = useMemo(() => menuQuery.data ?? [], [menuQuery.data]);

  const createCategory = useCreateCategory(branchId ?? undefined);
  const updateCategory = useUpdateCategory(branchId ?? undefined);
  const deleteCategory = useDeleteCategory(branchId ?? undefined);
  const createItem = useCreateMenuItem(branchId ?? undefined);
  const updateItem = useUpdateMenuItem(branchId ?? undefined);
  const setAvailability = useSetMenuItemAvailability(branchId ?? undefined);
  const deleteItem = useDeleteMenuItem(branchId ?? undefined);
  const removePhoto = useRemoveMenuItemPhoto(branchId ?? undefined);
  const reorderCategories = useReorderMenuCategories(branchId ?? undefined);
  const reorderItems = useReorderMenuItems(branchId ?? undefined);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [deleteRefusal, setDeleteRefusal] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  /** The category being named, in the console's own dialog rather than `prompt()`. */
  const [naming, setNaming] = useState<
    { mode: 'add' } | { mode: 'rename'; category: AdminMenuCategory } | null
  >(null);
  const [dragging, setDragging] = useState<{ list: 'category' | 'item'; index: number } | null>(
    null,
  );
  /** The dish whose sold-out switch is on its way to the server. */
  const [availabilityFor, setAvailabilityFor] = useState<string | null>(null);
  /** The dish whose pre-order switch is being saved: one at a time, as availability. */
  const [preOrderFor, setPreOrderFor] = useState<string | null>(null);
  const preOrderQuery = usePreOrderSettings(branchId ?? undefined);
  const savePreOrders = useSavePreOrderSettings(branchId ?? undefined);
  /** The branch's pre-order settings, while it takes them: the column is there only then. */
  // Pre-orders blocked by the platform (2026-10-27): no per-dish switch; the
  // Policy card says why.
  const preOrdersLocked = useFeatureLocked('preOrders');
  const preOrders =
    preOrderQuery.data?.acceptsPreOrders && !preOrdersLocked ? preOrderQuery.data : null;
  /** The dish whose "for takeaway" switch is being saved: one at a time, as availability. */
  const [takeawayFor, setTakeawayFor] = useState<string | null>(null);
  const takeawayQuery = useTakeawaySettings(branchId ?? undefined);
  /** The branch takes takeaway (2026-10-22): the column is there only then. */
  const takeaway = takeawayQuery.data?.enabled === true;
  /** A reorder in flight: its orders are computed from the list as it was. */
  const [moving, setMoving] = useState(false);

  /*
   * Arriving from a report.
   *
   * The never-ordered list links here with `#menu-item-<id>`, and a hash alone
   * does nothing in a single-page app: the row does not exist when the browser
   * would have scrolled to it. Both halves are **derived** — the category to
   * open from the hash and the loaded menu, the highlight from the hash, fading
   * through a CSS animation — and the one genuine side effect, scrolling, is
   * the effect.
   */
  const { hash } = useLocation();
  const linkedItemId = menuItemIdFromHash(hash);
  const linkedCategoryId = useMemo(
    () =>
      linkedItemId
        ? (categories.find((category) => category.items.some((item) => item.id === linkedItemId))
            ?.id ?? null)
        : null,
    [linkedItemId, categories],
  );
  useEffect(() => {
    if (!linkedItemId) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(menuItemAnchorId(linkedItemId))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [linkedItemId, linkedCategoryId]);

  const selected =
    categories.find((category) => category.id === selectedId) ??
    categories.find((category) => category.id === linkedCategoryId) ??
    categories[0] ??
    null;

  const allItems = useMemo(() => categories.flatMap((category) => category.items), [categories]);
  const known = useMemo(() => knownValues(allItems), [allItems]);
  const totalIncomplete = useMemo(
    () => categories.reduce((sum, category) => sum + incompleteCount(category), 0),
    [categories],
  );

  const needle = search.trim().toLocaleLowerCase();
  const searching = needle.length > 0;
  const visibleItems = useMemo(() => {
    // A search looks through every category: the dish somebody remembers the
    // name of is rarely in the one that is open.
    const pool = searching ? allItems : (selected?.items ?? []);
    return pool.filter((item) => {
      if (onlyIncomplete && isComplete(item)) return false;
      if (!searching) return true;
      return `${item.name} ${item.ingredients}`.toLocaleLowerCase().includes(needle);
    });
  }, [allItems, selected, onlyIncomplete, searching, needle]);
  const canOrder = !searching && !onlyIncomplete;

  // --- Acting -----------------------------------------------------------------

  function failed(message: string): void {
    toast.say(message, { tone: 'error' });
  }

  async function saveDraft(): Promise<void> {
    if (!editing || !branchId) return;
    const { draft } = editing;
    const fields = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      priceDram: draft.priceDram ?? 0,
      ingredients: draft.ingredients.join(', '),
      allergens: allergenText(draft),
      portionSize: draft.portionSize.trim(),
      spiceLevel: draft.spiceLevel,
    };
    try {
      // Created with no order: the server puts it last, under the branch lock.
      const saved =
        editing.mode === 'create'
          ? await createItem.mutateAsync({
              ...fields,
              categoryId: editing.categoryId,
              prepMinutes: draft.prepMinutes && draft.prepMinutes > 0 ? draft.prepMinutes : null,
              photoId: draft.photoId,
            })
          : await updateItem.mutateAsync({
              itemId: editing.item.id,
              patch: {
                ...fields,
                // Not sent rather than sent empty: the server keeps what it had.
                ...(draft.prepMinutes && draft.prepMinutes > 0
                  ? { prepMinutes: draft.prepMinutes }
                  : {}),
                ...(draft.photoId ? { photoId: draft.photoId } : {}),
              },
            });
      // What the server says is still missing, not what this form thought.
      const missing = storedGaps(saved).length;
      setEditing(null);
      toast.say(
        missing > 0
          ? t('menu.dish.savedHidden', { name: fields.name, count: missing })
          : t('menu.dish.savedShown', { name: fields.name }),
      );
    } catch {
      failed(t('menu.dish.saveFailed'));
    }
  }

  /**
   * A row moved — a step, by its arrows, or anywhere, by dragging.
   *
   * The whole list in its new order, in one call (VC3 wire §2): the server
   * rewrites the orders 0..n-1 under the branch lock, so two consoles at once
   * get one whole order, never a mix, and the ties every old menu has (all at
   * 0) are gone after the first move. The next move waits for the answer.
   */
  async function move(list: 'category' | 'item', from: number, to: number): Promise<void> {
    if (moving || from === to) return;
    const ids =
      list === 'category'
        ? categories.map((category) => category.id)
        : (selected?.items ?? []).map((item) => item.id);
    if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    setMoving(true);
    try {
      if (list === 'category') {
        await reorderCategories.mutateAsync(next);
        toast.say(t('menu.category.orderSaved'));
      } else if (selected) {
        await reorderItems.mutateAsync({ categoryId: selected.id, itemIds: next });
      }
    } catch {
      // A refusal is a stale menu; it is read again, and the order is as it was.
      failed(t('menu.orderFailed'));
    } finally {
      setMoving(false);
    }
  }

  function toggleAvailable(item: AdminMenuItem): void {
    // One change at a time: a second press before the answer would be sent
    // from the row as it was, and undo the first.
    if (availabilityFor !== null) return;
    const isAvailable = !item.isAvailable;
    setAvailabilityFor(item.id);
    setAvailability.mutate(
      { itemId: item.id, isAvailable },
      {
        onSuccess: () =>
          toast.say(
            isAvailable
              ? t('menu.dish.backIn', { name: item.name })
              : t('menu.dish.soldOutNow', { name: item.name }),
          ),
        onError: () => failed(t('menu.dish.availabilityFailed')),
        onSettled: () => setAvailabilityFor(null),
      },
    );
  }

  /**
   * In or out of pre-orders. The server keeps one list for the branch, so the
   * whole list goes — read fresh just before (review S6), with this dish
   * changed to what the switch was tapped to, and the rest as the server has
   * it. Pre-orders that already have the dish keep it (the waiter sees it
   * flagged).
   */
  function togglePreOrder(item: AdminMenuItem): void {
    if (!preOrders || preOrderFor !== null) return;
    // What the switch showed: the tap asks for the other.
    const offered = !preOrders.excludedMenuItemIds.includes(item.id);
    setPreOrderFor(item.id);
    savePreOrders.mutate(
      (fresh) => {
        const others = fresh.excludedMenuItemIds.filter((id) => id !== item.id);
        return { ...fresh, excludedMenuItemIds: offered ? [...others, item.id] : others };
      },
      {
        onSuccess: () =>
          toast.say(
            offered
              ? t('menu.dish.preOrderOff', { name: item.name })
              : t('menu.dish.preOrderOn', { name: item.name }),
          ),
        onError: () => failed(t('menu.dish.preOrderFailed')),
        onSettled: () => setPreOrderFor(null),
      },
    );
  }

  /**
   * For takeaway, or "only in the hall" (2026-10-22): the dish's own field,
   * patched on its own. A dish taken out stays on orders already sent.
   */
  function toggleTakeaway(item: AdminMenuItem): void {
    if (takeawayFor !== null) return;
    const offered = item.availableForTakeaway !== false;
    setTakeawayFor(item.id);
    updateItem.mutate(
      { itemId: item.id, patch: { availableForTakeaway: !offered } },
      {
        onSuccess: () =>
          toast.say(
            offered
              ? t('menu.dish.takeawayOff', { name: item.name })
              : t('menu.dish.takeawayOn', { name: item.name }),
          ),
        onError: () => failed(t('menu.dish.takeawayFailed')),
        onSettled: () => setTakeawayFor(null),
      },
    );
  }

  /**
   * A saved dish's photo, taken off at once (`DELETE …/photo`): the PATCH
   * cannot clear one. The dish leaves the guests' menu until it has a photo
   * again; the picture is kept a while, so Undo sets it back.
   */
  async function removeSavedPhoto(item: AdminMenuItem): Promise<void> {
    const photo = item.photo;
    try {
      const updated = await removePhoto.mutateAsync({ itemId: item.id });
      setEditing((current) =>
        current?.mode === 'edit' && current.item.id === item.id
          ? {
              ...current,
              item: updated,
              photo: null,
              draft: { ...current.draft, photoId: null },
            }
          : current,
      );
      toast.say(t('menu.dish.photoRemoved', { name: item.name }), {
        undo: () =>
          updateItem.mutate(
            { itemId: item.id, patch: { photoId: photo.photoId } },
            {
              onSuccess: (back) =>
                setEditing((current) =>
                  current?.mode === 'edit' && current.item.id === item.id
                    ? {
                        ...current,
                        item: back,
                        photo: back.photo,
                        draft: { ...current.draft, photoId: back.photo.photoId },
                      }
                    : current,
                ),
              onError: () => failed(t('menu.undoFailed')),
            },
          ),
      });
    } catch {
      failed(t('menu.dish.photoRemoveFailed'));
    }
  }

  /** The same dish again, named as a copy; the photo is not shared. */
  async function duplicate(item: AdminMenuItem): Promise<void> {
    const copy = duplicateDraft(item);
    const name = t('menu.dish.copyName', { name: item.name });
    try {
      await createItem.mutateAsync({
        categoryId: item.categoryId,
        name,
        description: copy.description,
        priceDram: copy.priceDram ?? item.priceDram,
        ingredients: copy.ingredients.join(', '),
        allergens: allergenText(copy),
        portionSize: copy.portionSize,
        spiceLevel: copy.spiceLevel,
        prepMinutes: copy.prepMinutes && copy.prepMinutes > 0 ? copy.prepMinutes : null,
        photoId: null,
      });
      setEditing(null);
      toast.say(t('menu.dish.duplicated', { name }));
    } catch {
      failed(t('menu.dish.saveFailed'));
    }
  }

  /** A deleted dish back, as it was: its fields, its photo, its place and its switch. */
  async function recreate(
    item: AdminMenuItem,
    categoryId: string = item.categoryId,
  ): Promise<void> {
    const created = await createItem.mutateAsync({
      categoryId,
      name: item.name,
      description: item.description,
      priceDram: item.priceDram,
      ingredients: item.ingredients,
      allergens: item.allergens,
      portionSize: item.portionSize,
      spiceLevel: item.spiceLevel,
      prepMinutes: item.prepMinutes > 0 ? item.prepMinutes : null,
      photoId: item.photo.photoId || null,
      displayOrder: item.displayOrder,
    });
    if (!item.isAvailable) {
      await setAvailability.mutateAsync({ itemId: created.id, isAvailable: false });
    }
  }

  async function confirmDelete(target: Deleting): Promise<void> {
    setDeleteRefusal(null);
    if (target.kind === 'category') {
      const { category } = target;
      try {
        await deleteCategory.mutateAsync({ categoryId: category.id });
      } catch (error) {
        setDeleteRefusal(
          error instanceof CategoryInUseError
            ? t('menu.category.inUse')
            : t('menu.category.deleteFailed'),
        );
        return;
      }
      setDeleting(null);
      setSelectedId(null);
      toast.say(t('menu.category.deleted', { name: category.name }), {
        focusUndo: true,
        undo: () =>
          void (async () => {
            try {
              const back = await createCategory.mutateAsync({
                name: category.name,
                displayOrder: category.displayOrder,
              });
              for (const item of category.items) await recreate(item, back.id);
              setSelectedId(back.id);
              toast.say(t('menu.category.restored', { name: category.name }));
            } catch {
              failed(t('menu.undoFailed'));
            }
          })(),
      });
      return;
    }

    const { item } = target;
    try {
      const result = await deleteItem.mutateAsync({ itemId: item.id });
      setDeleting(null);
      if (!result.deleted) {
        // On an order already: kept, and marked sold out instead. Undo puts
        // it back in stock only when it was in stock: a dish already sold out
        // has nothing to undo.
        toast.say(
          t('menu.dish.deactivatedInstead', { name: item.name }),
          item.isAvailable
            ? {
                undo: () =>
                  setAvailability.mutate(
                    { itemId: item.id, isAvailable: true },
                    { onError: () => failed(t('menu.undoFailed')) },
                  ),
              }
            : {},
        );
        return;
      }
      toast.say(t('menu.dish.deleted', { name: item.name }), {
        focusUndo: true,
        undo: () =>
          void recreate(item).then(
            () => toast.say(t('menu.dish.restored', { name: item.name })),
            () => failed(t('menu.undoFailed')),
          ),
      });
    } catch {
      setDeleteRefusal(t('menu.dish.deleteFailed'));
    }
  }

  // --- Render -----------------------------------------------------------------

  if (!branchId) {
    return (
      <div className="yc-page">
        <PageHeader title={t('nav.menu')} />
        <p className="yc-card yc-empty-line">{t('menu.noBranch')}</p>
      </div>
    );
  }

  if (menuQuery.isError) {
    return (
      <div className="yc-page">
        <PageHeader title={t('nav.menu')} />
        <div className="yc-card yc-ov-pad">
          <QueryFailureNotice error={menuQuery.error} onRetry={() => void menuQuery.refetch()} />
        </div>
      </div>
    );
  }

  const fmt = (amount: number) => formatDram(amount, locale);
  const selectedCount = selected?.items.length ?? 0;

  return (
    <div className="yc-page yc-menu-page">
      <PageHeader
        title={t('nav.menu')}
        sub={
          menuQuery.data
            ? t('menu.sub', {
                branch: branchName ?? '',
                dishes: t('menu.dishCount', { count: allItems.length }),
                categories: t('menu.inCategories', { count: categories.length }),
              })
            : null
        }
        actions={
          <div className="yc-ph-acts">
            <button type="button" className="yc-btn yc-btn-sec" onClick={() => setBulkOpen(true)}>
              <ImageIcon />
              {t('menu.bulk.open')}
            </button>
            <button
              type="button"
              className="yc-btn yc-btn-pri"
              aria-disabled={!selected}
              onClick={() =>
                selected &&
                setEditing({
                  mode: 'create',
                  categoryId: selected.id,
                  draft: EMPTY_DRAFT,
                  photo: null,
                })
              }
            >
              <PlusIcon />
              {t('menu.item.add')}
            </button>
          </div>
        }
      />

      {menuQuery.data && totalIncomplete > 0 ? (
        <div className="yc-banner yc-banner-amber" role="status">
          <AlertCircleIcon />
          <span className="yc-grow">
            <b>{t('menu.incomplete.title', { count: totalIncomplete })}</b>{' '}
            {t('menu.incomplete.body')}
          </span>
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            aria-pressed={onlyIncomplete}
            onClick={() => setOnlyIncomplete((current) => !current)}
          >
            {onlyIncomplete ? t('menu.incomplete.showAll') : t('menu.incomplete.showOnly')}
          </button>
        </div>
      ) : menuQuery.data && allItems.length > 0 ? (
        <div className="yc-banner yc-banner-green" role="status">
          <CheckIcon />
          <span className="yc-grow">
            <b>{t('menu.allReady.title')}</b> {t('menu.allReady.body')}
          </span>
        </div>
      ) : null}

      <div className="yc-mn">
        <section className="yc-card" aria-labelledby="mn-cat-h">
          <div className="yc-card-h yc-card-h-tight">
            <div>
              <h2 className="yc-h2 yc-h2-sm" id="mn-cat-h">
                {t('menu.category.title')}
              </h2>
              <p className="yc-cap">{t('menu.category.cap')}</p>
            </div>
          </div>
          {menuQuery.isLoading ? (
            <p className="yc-empty-p" role="status">
              {t('loading')}
            </p>
          ) : categories.length === 0 ? (
            <p className="yc-empty-p">{t('menu.category.emptyHint')}</p>
          ) : (
            <ul className="yc-cats">
              {categories.map((category, index) => {
                const missing = incompleteCount(category);
                const current = !searching && selected?.id === category.id;
                return (
                  <li
                    key={category.id}
                    draggable
                    onDragStart={() => setDragging({ list: 'category', index })}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragging?.list === 'category')
                        void move('category', dragging.index, index);
                      setDragging(null);
                    }}
                  >
                    <button
                      type="button"
                      className="yc-cat"
                      aria-current={current}
                      onClick={() => {
                        setSelectedId(category.id);
                        setSearch('');
                      }}
                    >
                      <b>{category.name}</b>
                      {missing > 0 ? (
                        <span
                          className="yc-miss"
                          aria-label={t('menu.category.missingAria', { count: missing })}
                        >
                          {missing}
                        </span>
                      ) : null}
                      <span className="yc-n">{category.items.length}</span>
                    </button>
                    <MoveButtons
                      name={category.name}
                      first={index === 0}
                      last={index === categories.length - 1}
                      busy={moving}
                      onMove={(delta) => void move('category', index, index + delta)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          <div className="yc-cat-add">
            <button
              type="button"
              className="yc-btn yc-btn-ghost yc-btn-sm"
              onClick={() => setNaming({ mode: 'add' })}
            >
              <PlusIcon />
              {t('menu.category.add')}
            </button>
          </div>
        </section>

        <section className="yc-card" aria-labelledby="mn-dish-h">
          <div className="yc-card-h">
            <div>
              <h2 className="yc-h2" id="mn-dish-h">
                {searching ? t('menu.search.title') : (selected?.name ?? t('menu.item.title'))}
              </h2>
              <p className="yc-cap">
                {searching
                  ? t('menu.search.cap', { count: visibleItems.length })
                  : onlyIncomplete
                    ? t('menu.item.capOnlyIncomplete', { count: selectedCount })
                    : t('menu.dishCount', { count: selectedCount })}
              </p>
            </div>
            <div className="yc-tools yc-tools-c">
              <div className="yc-search yc-mn-search">
                <SearchIcon />
                <label htmlFor="mn-q" className="yc-sr">
                  {t('menu.search.label')}
                </label>
                <input
                  id="mn-q"
                  className="yc-ctl"
                  type="search"
                  placeholder={t('menu.item.search')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              {selected && !searching ? (
                <>
                  <button
                    type="button"
                    className="yc-btn yc-btn-ghost yc-btn-sm"
                    onClick={() => setNaming({ mode: 'rename', category: selected })}
                  >
                    {t('menu.category.rename')}
                  </button>
                  <button
                    type="button"
                    className="yc-btn yc-btn-ghost yc-btn-sm yc-btn-ghost-red"
                    onClick={() => {
                      setDeleteRefusal(null);
                      setDeleting({ kind: 'category', category: selected });
                    }}
                  >
                    {t('menu.category.delete')}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {visibleItems.length === 0 ? (
            <div className="yc-empty">
              <h3 className="yc-h2 yc-h2-sm">
                {searching
                  ? t('menu.empty.searchTitle')
                  : onlyIncomplete
                    ? t('menu.incomplete.noneHere')
                    : !selected
                      ? t('menu.category.empty')
                      : t('menu.item.empty')}
              </h3>
              <p>
                {searching
                  ? t('menu.empty.searchBody')
                  : onlyIncomplete
                    ? t('menu.empty.incompleteBody')
                    : !selected
                      ? t('menu.empty.noCategoryBody')
                      : t('menu.empty.categoryBody')}
              </p>
            </div>
          ) : (
            <DataTable
              caption={t('nav.menu')}
              phone="cards"
              className={[
                'yc-mn-tbl',
                preOrders ? 'has-preorder' : '',
                takeaway ? 'has-takeaway' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <thead>
                <tr>
                  <th scope="col">{t('menu.column.dish')}</th>
                  <th scope="col" className="yc-num">
                    {t('menu.column.price')}
                  </th>
                  <th scope="col">{t('menu.column.available')}</th>
                  {preOrders ? (
                    <th scope="col" className="yc-mn-po">
                      {t('menu.column.preOrder')}
                    </th>
                  ) : null}
                  {takeaway ? (
                    <th scope="col" className="yc-mn-po">
                      {t('menu.column.takeaway')}
                    </th>
                  ) : null}
                  <th scope="col">{t('menu.column.status')}</th>
                  <th scope="col">
                    <span className="yc-sr">{t('menu.column.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  // The server's own list when it sends one (VC3 wire §2).
                  const gaps = storedGaps(item);
                  const siblings =
                    categories.find((category) => category.id === item.categoryId)?.items ?? [];
                  const index = siblings.indexOf(item);
                  return (
                    <tr
                      key={item.id}
                      // Addressable, so the reports screen can link straight at
                      // a dish nobody ordered.
                      id={menuItemAnchorId(item.id)}
                      draggable={canOrder}
                      onDragStart={() => setDragging({ list: 'item', index })}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (canOrder && dragging?.list === 'item') {
                          void move('item', dragging.index, index);
                        }
                        setDragging(null);
                      }}
                      className={
                        [
                          item.isAvailable ? '' : 'is-sold',
                          linkedItemId === item.id ? 'is-linked' : '',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    >
                      <td>
                        <div className="yc-dish">
                          {item.photo.thumbnailUrl ? (
                            <img className="yc-dish-ph" src={item.photo.cardUrl} alt="" />
                          ) : (
                            <span className="yc-dish-ph yc-dish-none" aria-hidden="true">
                              <ImageIcon />
                            </span>
                          )}
                          <div className="yc-dish-t">
                            <div className="yc-dn">{item.name}</div>
                            <div className="yc-dd">
                              {item.description.trim() || t('menu.dish.noDescription')}
                            </div>
                            {gaps.length > 0 ? (
                              <div className="yc-mchips">
                                {gaps.map((gap) => (
                                  <span key={gap}>{t(`menu.gap.${gap}`)}</span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="yc-num">{fmt(item.priceDram)}</td>
                      <td>
                        <span className="yc-swl">
                          <button
                            type="button"
                            className="yc-sw"
                            role="switch"
                            aria-checked={item.isAvailable}
                            aria-label={t('menu.dish.availableAria', { name: item.name })}
                            aria-disabled={availabilityFor !== null}
                            onClick={() => toggleAvailable(item)}
                          />
                          {item.isAvailable ? t('menu.available') : t('menu.soldOut')}
                        </span>
                      </td>
                      {preOrders ? (
                        <td className="yc-mn-po">
                          {/* The switch alone: the column says what it is,
                                its knob and its name say which way it is. */}
                          <button
                            type="button"
                            className="yc-sw"
                            role="switch"
                            aria-checked={!preOrders.excludedMenuItemIds.includes(item.id)}
                            aria-label={t('menu.dish.preOrderAria', { name: item.name })}
                            aria-disabled={preOrderFor !== null}
                            title={
                              preOrders.excludedMenuItemIds.includes(item.id)
                                ? t('menu.preOrderNo')
                                : t('menu.preOrderYes')
                            }
                            onClick={() => togglePreOrder(item)}
                          />
                          {/* The tooltip's words, where nothing hovers (a phone). */}
                          <span className="yc-mn-po-state" aria-hidden="true">
                            {preOrders.excludedMenuItemIds.includes(item.id)
                              ? t('menu.preOrderNo')
                              : t('menu.preOrderYes')}
                          </span>
                        </td>
                      ) : null}
                      {takeaway ? (
                        <td className="yc-mn-po">
                          <button
                            type="button"
                            className="yc-sw"
                            role="switch"
                            aria-checked={item.availableForTakeaway !== false}
                            aria-label={t('menu.dish.takeawayAria', { name: item.name })}
                            aria-disabled={takeawayFor !== null}
                            title={
                              item.availableForTakeaway === false
                                ? t('menu.takeawayNo')
                                : t('menu.takeawayYes')
                            }
                            onClick={() => toggleTakeaway(item)}
                          />
                          <span className="yc-mn-po-state" aria-hidden="true">
                            {item.availableForTakeaway === false
                              ? t('menu.takeawayNo')
                              : t('menu.takeawayYes')}
                          </span>
                        </td>
                      ) : null}
                      <td>
                        {gaps.length > 0 ? (
                          <span className="yc-pill yc-pill-amber">
                            <span className="yc-dot" aria-hidden="true" />
                            {t('menu.incomplete.badge', { count: gaps.length })}
                          </span>
                        ) : (
                          <span className="yc-pill yc-pill-green">
                            <span className="yc-dot" aria-hidden="true" />
                            {t('menu.complete')}
                          </span>
                        )}
                      </td>
                      <td className="yc-num yc-tc-act">
                        <span className="yc-row-acts">
                          {canOrder ? (
                            <MoveButtons
                              name={item.name}
                              first={index === 0}
                              last={index === siblings.length - 1}
                              busy={moving}
                              onMove={(delta) => void move('item', index, index + delta)}
                            />
                          ) : null}
                          <button
                            type="button"
                            className="yc-btn yc-btn-sec yc-btn-sm"
                            onClick={() =>
                              setEditing({
                                mode: 'edit',
                                item,
                                draft: itemToDraft(item),
                                photo: item.photo.photoId ? item.photo : null,
                              })
                            }
                          >
                            {t('common:action.edit')}
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </section>
      </div>

      {editing && !deleting ? (
        <DishDrawer
          branchId={branchId}
          mode={editing.mode}
          savedName={editing.mode === 'edit' ? editing.item.name : ''}
          draft={editing.draft}
          photo={editing.photo}
          savedPhoto={
            editing.mode === 'edit' && editing.item.photo.photoId ? editing.item.photo : null
          }
          knownIngredients={known.ingredients}
          knownPortionSizes={known.portionSizes}
          busy={createItem.isPending || updateItem.isPending}
          onChange={(draft) => setEditing((current) => (current ? { ...current, draft } : null))}
          onPhoto={(photo) => setEditing((current) => (current ? { ...current, photo } : null))}
          onRemoveSavedPhoto={() => editing.mode === 'edit' && void removeSavedPhoto(editing.item)}
          onSubmit={() => void saveDraft()}
          onCancel={() => setEditing(null)}
          onDuplicate={() => editing.mode === 'edit' && void duplicate(editing.item)}
          onDelete={() => {
            if (editing.mode !== 'edit') return;
            setDeleteRefusal(null);
            setDeleting({ kind: 'item', item: editing.item, back: editing });
          }}
        />
      ) : null}

      {deleting ? (
        <Dialog
          alert
          title={t('menu.delete.title', {
            name: deleting.kind === 'category' ? deleting.category.name : deleting.item.name,
          })}
          description={
            deleting.kind === 'category'
              ? deleting.category.items.length > 0
                ? t('menu.category.deleteBody', { count: deleting.category.items.length })
                : t('menu.category.deleteEmpty')
              : t('menu.dish.deleteBody')
          }
          onClose={() => {
            // Back to the drawer it came from, edits and all.
            if (deleting.kind === 'item') setEditing(deleting.back);
            setDeleting(null);
          }}
          dismissible={!deleteCategory.isPending && !deleteItem.isPending}
        >
          {deleteRefusal ? (
            <p className="yc-alert" role="alert">
              <AlertCircleIcon />
              {deleteRefusal}
            </p>
          ) : null}
          <div className="yc-acts">
            <button
              type="button"
              className="yc-btn yc-btn-sec"
              data-autofocus=""
              disabled={deleteCategory.isPending || deleteItem.isPending}
              onClick={() => {
                if (deleting.kind === 'item') setEditing(deleting.back);
                setDeleting(null);
              }}
            >
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              className="yc-btn yc-btn-danger"
              aria-busy={deleteCategory.isPending || deleteItem.isPending}
              onClick={() => {
                if (deleteCategory.isPending || deleteItem.isPending) return;
                if (deleting.kind === 'item') setEditing(null);
                void confirmDelete(deleting);
              }}
            >
              {t('common:action.delete')}
            </button>
          </div>
        </Dialog>
      ) : null}

      {bulkOpen ? (
        <BulkPhotoDrop branchId={branchId} items={allItems} onClose={() => setBulkOpen(false)} />
      ) : null}

      {naming ? (
        <CategoryNameDialog
          title={
            naming.mode === 'add'
              ? t('menu.category.addTitle')
              : t('menu.category.renameTitle', { name: naming.category.name })
          }
          initialName={naming.mode === 'add' ? '' : naming.category.name}
          submitLabel={
            naming.mode === 'add' ? t('menu.category.addConfirm') : t('common:action.save')
          }
          isSaving={createCategory.isPending || updateCategory.isPending}
          onCancel={() => setNaming(null)}
          onSubmit={(name) => {
            if (naming.mode === 'add') {
              createCategory.mutate(
                { name },
                {
                  onSuccess: (created) => {
                    setNaming(null);
                    setSelectedId(created.id);
                    setSearch('');
                    toast.say(t('menu.category.added', { name }));
                  },
                  onError: () => failed(t('menu.category.saveFailed')),
                },
              );
            } else {
              updateCategory.mutate(
                { categoryId: naming.category.id, name },
                {
                  onSuccess: () => {
                    setNaming(null);
                    toast.say(t('menu.category.renamed'));
                  },
                  onError: () => failed(t('menu.category.saveFailed')),
                },
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}

/** The two arrows that move a row a step; the end's arrow says it cannot. */
function MoveButtons({
  name,
  first,
  last,
  busy,
  onMove,
}: {
  readonly name: string;
  readonly first: boolean;
  readonly last: boolean;
  readonly busy: boolean;
  readonly onMove: (delta: -1 | 1) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <span className="yc-ordc">
      <button
        type="button"
        className="yc-mini"
        aria-label={t('menu.moveUp', { name })}
        aria-disabled={first || busy}
        onClick={() => !first && !busy && onMove(-1)}
      >
        <ChevronUpIcon />
      </button>
      <button
        type="button"
        className="yc-mini"
        aria-label={t('menu.moveDown', { name })}
        aria-disabled={last || busy}
        onClick={() => !last && !busy && onMove(1)}
      >
        <ChevronDownIcon />
      </button>
    </span>
  );
}

/** What keeps a stored dish from guests, in the drawer's order. */
function storedGaps(item: AdminMenuItem) {
  const gaps = storedItemGaps(item);
  return DESCRIPTIVE_FIELDS.filter((field) => gaps.includes(field));
}

/** Every distinct ingredient on this menu. Exported for the checklist's count. */
export function ingredientVocabulary(items: readonly AdminMenuItem[]): readonly string[] {
  const all = new Set<string>();
  for (const item of items) for (const part of splitList(item.ingredients)) all.add(part);
  return [...all];
}
