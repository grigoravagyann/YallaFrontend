import {
  EMPTY_DRAFT,
  allergenText,
  duplicateDraft,
  incompleteCount,
  isComplete,
  itemToDraft,
  reorder,
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
  useSetMenuItemAvailability,
  useUpdateCategory,
  useUpdateMenuItem,
} from '@yalla/api/react';
import { CategoryInUseError } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { menuItemAnchorId, menuItemIdFromHash } from '../menuAnchors';
import { useVenueOutlet } from '../VenueLayout';
import { BulkPhotoDrop } from './BulkPhotoDrop';
import { ItemForm, knownValues } from './ItemForm';

/**
 * The menu editor: categories on the left, that category's dishes on the right.
 *
 * Two audiences pulling in opposite directions, and where they conflict the
 * first one wins:
 *
 * - **A bulk first pass.** Somebody is entering eighty dishes in an afternoon,
 *   sitting in the cafe with the owner. A slow first pass means the menu never
 *   gets finished, and an unfinished menu means ordering does not exist for
 *   that venue.
 * - **A one-off edit in March.** The same person comes back to change one
 *   price and remembers nothing.
 *
 * Hence a **table rather than cards**: somebody scanning eighty dishes for the
 * one with the wrong price needs density, and a grid of photo cards is four
 * dishes a screen. Hence **inline editing where it is safe** — price, name and
 * availability save on blur — because a three-field dialog to change one number
 * is the difference between a menu kept current and one abandoned.
 *
 * And hence the completeness banner at the top whenever anything is unfinished.
 * During onboarding that is the to-do list, and it is what answers "is this
 * venue ready to switch ordering on".
 */
export function MenuEditorScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const { branchId } = useVenueOutlet();

  const menuQuery = useAdminMenu(branchId ?? undefined);
  const categories = useMemo(() => menuQuery.data ?? [], [menuQuery.data]);

  const createCategory = useCreateCategory(branchId ?? undefined);
  const updateCategory = useUpdateCategory(branchId ?? undefined);
  const deleteCategory = useDeleteCategory(branchId ?? undefined);
  const createItem = useCreateMenuItem(branchId ?? undefined);
  const updateItem = useUpdateMenuItem(branchId ?? undefined);
  const setAvailability = useSetMenuItemAvailability(branchId ?? undefined);
  const deleteItem = useDeleteMenuItem(branchId ?? undefined);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);

  /*
   * Arriving from a report.
   *
   * The never-ordered list links here with `#menu-item-<id>`, and a hash alone
   * does nothing in a single-page app: the row does not exist when the browser
   * would have scrolled to it, because the menu is still loading and the row
   * sits inside a category that may not be the selected one.
   *
   * Both halves are **derived** rather than set from an effect. The category to
   * open is a function of the hash and the loaded menu, and the highlight is a
   * function of the hash — writing either into state from an effect would be a
   * cascading render and a frame of showing the wrong category. The highlight
   * fades through a CSS animation rather than a timer, for the same reason:
   * "which one did I click" stops being a question about two seconds after it
   * is answered, and that does not need to be state.
   *
   * The one genuine side effect left is scrolling, which is what an effect is
   * actually for.
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
    // After the category holding it has rendered its rows.
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(menuItemAnchorId(linkedItemId))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [linkedItemId, linkedCategoryId]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<
    | { mode: 'create'; categoryId: string; draft: MenuItemDraft; photo: Photo | null }
    | { mode: 'edit'; itemId: string; draft: MenuItemDraft; photo: Photo | null }
    | null
  >(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ list: 'category' | 'item'; index: number } | null>(
    null,
  );

  const selected =
    categories.find((category) => category.id === selectedId) ??
    // Nothing picked yet and we arrived from a report: open the category the
    // linked item is in, or its row would be inside a section nobody opened.
    categories.find((category) => category.id === linkedCategoryId) ??
    categories[0] ??
    null;

  const allItems = useMemo(() => categories.flatMap((category) => category.items), [categories]);
  const known = useMemo(() => knownValues(allItems), [allItems]);
  const totalIncomplete = useMemo(
    () => categories.reduce((sum, category) => sum + incompleteCount(category), 0),
    [categories],
  );

  const visibleItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (selected?.items ?? []).filter((item) => {
      if (onlyIncomplete && isComplete(item)) return false;
      if (!needle) return true;
      return (
        item.name.toLocaleLowerCase().includes(needle) ||
        item.ingredients.toLocaleLowerCase().includes(needle)
      );
    });
  }, [selected, onlyIncomplete, search]);

  // --- Acting -----------------------------------------------------------------

  function saveDraft(): void {
    if (!editing || !branchId) return;
    const { draft } = editing;
    const patch = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      priceDram: draft.priceDram ?? 0,
      ingredients: draft.ingredients.join(', '),
      allergens: allergenText(draft),
      portionSize: draft.portionSize.trim(),
      spiceLevel: draft.spiceLevel,
      prepMinutes: draft.prepMinutes ?? 0,
      photoId: draft.photoId ?? '',
    };

    if (editing.mode === 'create') {
      createItem.mutate(
        {
          ...patch,
          categoryId: editing.categoryId,
          displayOrder:
            categories.find((category) => category.id === editing.categoryId)?.items.length ?? 0,
        },
        { onSuccess: () => setEditing(null) },
      );
    } else {
      updateItem.mutate({ itemId: editing.itemId, patch }, { onSuccess: () => setEditing(null) });
    }
  }

  /**
   * A drag produces only the rows that moved.
   *
   * Sending every row after a two-row move is one PATCH per dish, which on an
   * eighty-item menu is eighty requests and eighty chances to half-apply.
   */
  function commitReorder(list: 'category' | 'item', from: number, to: number): void {
    const ids =
      list === 'category'
        ? categories.map((category) => category.id)
        : (selected?.items ?? []).map((item) => item.id);

    for (const change of reorder(ids, from, to)) {
      if (list === 'category') {
        updateCategory.mutate({ categoryId: change.id, displayOrder: change.displayOrder });
      } else {
        updateItem.mutate({
          itemId: change.id,
          patch: { displayOrder: change.displayOrder },
        });
      }
    }
  }

  function removeCategory(category: AdminMenuCategory): void {
    // Say how many go with it. "Delete category" is a very different decision
    // when it takes fourteen dishes, and there is no reassignment on offer.
    const message =
      category.items.length === 0
        ? t('menu.category.confirmEmpty', { name: category.name })
        : t('menu.category.confirmWithItems', {
            name: category.name,
            count: category.items.length,
          });
    if (!window.confirm(message)) return;

    deleteCategory.mutate(
      { categoryId: category.id },
      {
        onError: (error) =>
          setNotice(
            error instanceof CategoryInUseError
              ? t('menu.category.inUse')
              : t('menu.category.deleteFailed'),
          ),
      },
    );
  }

  function removeItem(item: AdminMenuItem): void {
    if (!window.confirm(t('menu.item.confirmDelete', { name: item.name }))) return;
    deleteItem.mutate(
      { itemId: item.id },
      {
        onSuccess: (result) => {
          // The server's own sentence when the item was only deactivated. A
          // "deleted" item still on the list is one somebody deletes twice.
          if (!result.deleted) setNotice(result.message);
        },
      },
    );
  }

  // --- Render -----------------------------------------------------------------

  if (!branchId) {
    return (
      <section className="page">
        <p className="muted">{t('menu.noBranch')}</p>
      </section>
    );
  }

  if (menuQuery.isError) {
    return (
      <section className="page">
        <QueryFailureNotice error={menuQuery.error} onRetry={() => void menuQuery.refetch()} />
      </section>
    );
  }

  return (
    <section className="page menu-editor">
      <header className="page-head">
        <h2>{t('nav.menu')}</h2>
        <div className="page-actions">
          <button type="button" className="button" onClick={() => setBulkOpen(true)}>
            {t('menu.bulk.open')}
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!selected}
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
            {t('menu.item.add')}
          </button>
        </div>
      </header>

      {/* The first thing on the screen whenever anything is unfinished. During
          onboarding this is the to-do list and the readiness answer. */}
      {totalIncomplete > 0 ? (
        <div className="todo completeness-banner">
          <span className="todo-label">{t('menu.incomplete.label')}</span>
          <p>{t('menu.incomplete.body', { count: totalIncomplete })}</p>
          <button
            type="button"
            className={`button ${onlyIncomplete ? 'button-primary' : ''}`}
            onClick={() => setOnlyIncomplete((current) => !current)}
          >
            {onlyIncomplete ? t('menu.incomplete.showAll') : t('menu.incomplete.showOnly')}
          </button>
        </div>
      ) : null}

      {notice ? (
        <p className="table-warn" role="status">
          {notice}{' '}
          <button type="button" className="link-button" onClick={() => setNotice(null)}>
            {t('common:action.close')}
          </button>
        </p>
      ) : null}

      <div className="menu-panes">
        {/* --- Categories ----------------------------------------------------- */}
        <aside className="menu-categories">
          <h3>{t('menu.category.title')}</h3>
          {menuQuery.isLoading ? (
            <p className="muted">{t('loading')}</p>
          ) : categories.length === 0 ? (
            <p className="muted small">{t('menu.category.empty')}</p>
          ) : (
            <ul className="category-list">
              {categories.map((category, index) => {
                const missing = incompleteCount(category);
                return (
                  <li
                    key={category.id}
                    draggable
                    onDragStart={() => setDragging({ list: 'category', index })}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragging?.list === 'category') {
                        commitReorder('category', dragging.index, index);
                      }
                      setDragging(null);
                    }}
                    className={`category-row ${selected?.id === category.id ? 'is-on' : ''}`}
                  >
                    <button type="button" onClick={() => setSelectedId(category.id)}>
                      <span className="category-name">{category.name}</span>
                      <span className="small muted">
                        {t('menu.category.itemCount', { count: category.items.length })}
                      </span>
                      {missing > 0 ? (
                        <span className="badge badge-warn">
                          {t('menu.incomplete.badge', { count: missing })}
                        </span>
                      ) : null}
                    </button>
                    <span className="category-tools">
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          const name = window.prompt(t('menu.category.rename'), category.name);
                          if (name && name.trim()) {
                            updateCategory.mutate({ categoryId: category.id, name: name.trim() });
                          }
                        }}
                      >
                        {t('common:action.edit')}
                      </button>
                      <button
                        type="button"
                        className="link-button danger"
                        onClick={() => removeCategory(category)}
                      >
                        {t('common:action.delete')}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            className="button full"
            onClick={() => {
              const name = window.prompt(t('menu.category.addPrompt'));
              if (name && name.trim()) {
                createCategory.mutate({ name: name.trim(), displayOrder: categories.length });
              }
            }}
          >
            {t('menu.category.add')}
          </button>
        </aside>

        {/* --- Items ------------------------------------------------------------ */}
        <div className="menu-items">
          <div className="menu-items-head">
            <h3>{selected?.name ?? t('menu.item.title')}</h3>
            <input
              className="field"
              type="search"
              value={search}
              placeholder={t('menu.item.search')}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {!selected ? (
            <p className="muted">{t('menu.category.emptyHint')}</p>
          ) : visibleItems.length === 0 ? (
            <p className="muted">
              {onlyIncomplete ? t('menu.incomplete.noneHere') : t('menu.item.empty')}
            </p>
          ) : (
            <table className="menu-table">
              <thead>
                <tr>
                  <th scope="col">{t('menu.column.photo')}</th>
                  <th scope="col">{t('menu.column.name')}</th>
                  <th scope="col">{t('menu.column.price')}</th>
                  <th scope="col">{t('menu.column.available')}</th>
                  <th scope="col">{t('menu.column.complete')}</th>
                  <th scope="col">
                    <span className="visually-hidden">{t('menu.column.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const gaps = storedItemGaps(item);
                  const index = (selected.items ?? []).indexOf(item);
                  return (
                    <tr
                      key={item.id}
                      // Addressable, so the reports screen can link straight at
                      // a dish nobody ordered. Acting on that report means
                      // editing this row, and a link that lands on the right
                      // page but the wrong part of a sixty-item menu is a link
                      // nobody follows twice.
                      id={menuItemAnchorId(item.id)}
                      draggable
                      onDragStart={() => setDragging({ list: 'item', index })}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (dragging?.list === 'item') {
                          commitReorder('item', dragging.index, index);
                        }
                        setDragging(null);
                      }}
                      className={
                        [
                          gaps.length > 0 ? 'row-incomplete' : '',
                          linkedItemId === item.id ? 'row-linked' : '',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    >
                      <td>
                        {item.photo.thumbnailUrl ? (
                          <img
                            src={item.photo.thumbnailUrl}
                            alt=""
                            width={40}
                            height={40}
                            className="menu-thumb"
                          />
                        ) : (
                          <span className="menu-thumb menu-thumb-empty" aria-hidden />
                        )}
                      </td>

                      {/* Inline, saving on blur. Changing one price is the
                          single most common edit and it should not need a
                          dialog. */}
                      <td>
                        <input
                          className="field inline-field"
                          defaultValue={item.name}
                          onBlur={(event) => {
                            const name = event.target.value.trim();
                            if (name && name !== item.name) {
                              updateItem.mutate({ itemId: item.id, patch: { name } });
                            }
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="field inline-field numeric"
                          type="number"
                          min={1}
                          defaultValue={item.priceDram}
                          onBlur={(event) => {
                            const priceDram = Number(event.target.value);
                            if (priceDram > 0 && priceDram !== item.priceDram) {
                              updateItem.mutate({ itemId: item.id, patch: { priceDram } });
                            }
                          }}
                        />
                        <span className="small muted">{formatDram(item.priceDram, locale)}</span>
                      </td>
                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={item.isAvailable}
                            onChange={(event) =>
                              setAvailability.mutate({
                                itemId: item.id,
                                isAvailable: event.target.checked,
                              })
                            }
                          />
                          <span className="small">
                            {item.isAvailable ? t('menu.available') : t('menu.soldOut')}
                          </span>
                        </label>
                      </td>
                      <td>
                        {gaps.length === 0 ? (
                          <span className="badge badge-ok">{t('menu.complete')}</span>
                        ) : (
                          <span className="badge badge-warn" title={gaps.join(', ')}>
                            {t('menu.incomplete.badge', { count: gaps.length })}
                          </span>
                        )}
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            setEditing({
                              mode: 'edit',
                              itemId: item.id,
                              draft: itemToDraft(item),
                              photo: item.photo.photoId ? item.photo : null,
                            })
                          }
                        >
                          {t('common:action.edit')}
                        </button>
                        {/* First-class, not buried: three sizes of one coffee
                            differ by a name and a price and nothing else. */}
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            setEditing({
                              mode: 'create',
                              categoryId: item.categoryId,
                              draft: duplicateDraft(item),
                              photo: null,
                            })
                          }
                        >
                          {t('menu.item.duplicate')}
                        </button>
                        <button
                          type="button"
                          className="link-button danger"
                          onClick={() => removeItem(item)}
                        >
                          {t('common:action.delete')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing ? (
        <ItemForm
          branchId={branchId}
          draft={editing.draft}
          photo={editing.photo}
          knownIngredients={known.ingredients}
          knownPortionSizes={known.portionSizes}
          title={editing.mode === 'create' ? t('menu.item.addTitle') : t('menu.item.editTitle')}
          busy={createItem.isPending || updateItem.isPending}
          onChange={(draft) => setEditing((current) => (current ? { ...current, draft } : null))}
          onPhoto={(photo) => setEditing((current) => (current ? { ...current, photo } : null))}
          onSubmit={saveDraft}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {bulkOpen ? (
        <BulkPhotoDrop branchId={branchId} items={allItems} onClose={() => setBulkOpen(false)} />
      ) : null}
    </section>
  );
}

/** Every distinct ingredient on this menu. Exported for the checklist's count. */
export function ingredientVocabulary(items: readonly AdminMenuItem[]): readonly string[] {
  const all = new Set<string>();
  for (const item of items) for (const part of splitList(item.ingredients)) all.add(part);
  return [...all];
}
