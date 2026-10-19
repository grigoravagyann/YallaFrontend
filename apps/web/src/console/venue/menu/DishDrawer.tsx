import {
  ALLERGEN_PRESETS,
  SPICE_LEVELS,
  menuItemGaps,
  splitList,
  type AdminMenuItem,
  type AllergenPreset,
  type MenuItemDraft,
  type MenuItemField,
  type Photo,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../../components/useDialogFocus';
import { CrossIcon } from '../../ui/icons';
import { PhotoPicker } from './PhotoPicker';

/**
 * The fields a guest would otherwise ask a waiter, in the drawer's order: what
 * the to-do box and the table's chips name. Name and price are not here — the
 * drawer will not save without them.
 */
export const DESCRIPTIVE_FIELDS: readonly MenuItemField[] = [
  'photoId',
  'description',
  'ingredients',
  'allergens',
  'portionSize',
  'prepMinutes',
];

/** What still keeps a dish from guests, in the drawer's order. */
export function descriptiveGaps(draft: MenuItemDraft): readonly MenuItemField[] {
  const gaps = menuItemGaps(draft);
  return DESCRIPTIVE_FIELDS.filter((field) => gaps.includes(field));
}

export interface DishDrawerProps {
  readonly branchId: string;
  /** A new dish, or the one being edited. */
  readonly mode: 'create' | 'edit';
  /** The edited dish's name as saved, for the title. */
  readonly savedName: string;
  readonly draft: MenuItemDraft;
  readonly photo: Photo | null;
  /**
   * The photo the dish has on the server. "Remove" is offered only for one
   * chosen since: a saved dish's photo can be replaced, not taken away — the
   * server keeps a photo once it has one.
   */
  readonly savedPhotoId: string | null;
  /** What this branch has typed before, for the two autocompletes. */
  readonly knownIngredients: readonly string[];
  readonly knownPortionSizes: readonly string[];
  readonly busy: boolean;
  readonly onChange: (draft: MenuItemDraft) => void;
  readonly onPhoto: (photo: Photo | null) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}

/**
 * One dish, in a drawer from the right (Menu artboard).
 *
 * Only a name and a whole, positive price are insisted on: everything else is
 * what a guest would otherwise ask a waiter, and a dish missing any of it
 * saves as a draft — "Save draft" — hidden from guests until it is filled in.
 * The box at the top names every missing field at once and keeps counting as
 * they are filled, because a form that reveals one gap per attempt is a menu
 * that never gets finished.
 *
 * - **Allergens are boxes**, the nine the product ships and "No allergens",
 *   which is an answer: an empty list is a question not yet answered.
 * - **Ingredients are tags**: Enter or a comma adds one, Backspace on an empty
 *   box takes the last off, and what this branch has typed before is offered.
 * - **The photo is cropped to 4:3** before it is uploaded, the frame a guest
 *   sees it in.
 *
 * A modal: Escape closes, Tab stays inside, and the focus goes back to the
 * button that opened it.
 */
export function DishDrawer(props: DishDrawerProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { draft, onChange } = props;
  const drawerRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const id = useId();
  const [tried, setTried] = useState(false);
  const [ingredientText, setIngredientText] = useState('');

  useDialogFocus(drawerRef, { onEscape: props.onCancel, escapeEnabled: !props.busy });

  const gaps = useMemo(() => descriptiveGaps(draft), [draft]);
  const nameBad = draft.name.trim() === '';
  const priceBad = !(
    draft.priceDram !== null &&
    Number.isInteger(draft.priceDram) &&
    draft.priceDram > 0
  );
  const nameErr = tried && nameBad;
  const priceErr = tried && priceBad;

  function set<K extends keyof MenuItemDraft>(key: K, value: MenuItemDraft[K]): void {
    onChange({ ...draft, [key]: value });
  }

  function addIngredients(raw: string): void {
    const parts = splitList(raw).filter((part) => !draft.ingredients.includes(part));
    if (parts.length > 0) set('ingredients', [...draft.ingredients, ...parts]);
    setIngredientText('');
  }

  function onIngredientKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addIngredients(ingredientText);
    } else if (event.key === 'Backspace' && ingredientText === '' && draft.ingredients.length > 0) {
      set('ingredients', draft.ingredients.slice(0, -1));
    }
  }

  function toggleAllergen(preset: AllergenPreset): void {
    const on = draft.allergens.includes(preset);
    onChange({
      ...draft,
      allergens: on
        ? draft.allergens.filter((entry) => entry !== preset)
        : [...draft.allergens, preset],
      // An allergen ticked is not "no allergens".
      noAllergens: false,
    });
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (props.busy) return;
    if (nameBad || priceBad) {
      setTried(true);
      // The first field that stops the save.
      document.getElementById(nameBad ? `${id}-name` : `${id}-price`)?.focus();
      return;
    }
    props.onSubmit();
  }

  const photoChosenNow = Boolean(props.photo && props.photo.photoId !== props.savedPhotoId);

  return createPortal(
    <div
      className="yc yc-drawer-o"
      data-testid="dialog-scrim"
      onClick={(event) => {
        if (!props.busy && event.target === event.currentTarget) props.onCancel();
      }}
    >
      <form
        ref={drawerRef}
        className="yc-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        noValidate
        onSubmit={submit}
      >
        <div className="yc-dr-h">
          <h2 className="yc-h2" id={titleId}>
            {props.mode === 'edit'
              ? t('menu.dish.editTitle', { name: props.savedName })
              : t('menu.dish.newTitle')}
          </h2>
          <button
            type="button"
            className="yc-x"
            aria-label={t('common:action.close')}
            disabled={props.busy}
            onClick={props.onCancel}
          >
            <CrossIcon />
          </button>
        </div>

        <fieldset className="yc-dr-b" disabled={props.busy}>
          {gaps.length > 0 ? (
            <div className="yc-todo" role="status">
              <b>{t('menu.dish.todoTitle', { count: gaps.length })}</b>
              <span>{gaps.map((gap) => t(`menu.gap.${gap}`)).join(', ')}</span>
              <span>{t('menu.dish.todoBody')}</span>
            </div>
          ) : null}

          <div className="yc-fld">
            <span className="yc-lbl">
              {t('menu.field.photoId')}
              <span className="yc-req" aria-hidden="true">
                *
              </span>
            </span>
            <PhotoPicker
              branchId={props.branchId}
              photo={props.photo}
              onChange={(photo) => {
                props.onPhoto(photo);
                set('photoId', photo.photoId);
              }}
              {...(photoChosenNow
                ? {
                    onRemove: () => {
                      props.onPhoto(null);
                      set('photoId', props.savedPhotoId);
                    },
                  }
                : {})}
            />
          </div>

          <div className="yc-row2">
            <div className="yc-fld">
              <label htmlFor={`${id}-name`}>
                {t('menu.field.name')}
                <span className="yc-req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id={`${id}-name`}
                className="yc-ctl"
                value={draft.name}
                maxLength={120}
                data-autofocus=""
                aria-invalid={nameErr}
                aria-describedby={nameErr ? `${id}-name-err` : undefined}
                onChange={(event) => set('name', event.target.value)}
              />
              {nameErr ? (
                <span className="yc-err" id={`${id}-name-err`}>
                  {t('menu.dish.nameRequired')}
                </span>
              ) : null}
            </div>
            <div className="yc-fld">
              <label htmlFor={`${id}-price`}>
                {t('menu.field.priceDram')}
                <span className="yc-req" aria-hidden="true">
                  *
                </span>
              </label>
              <div className="yc-unit">
                <input
                  id={`${id}-price`}
                  className="yc-ctl"
                  inputMode="numeric"
                  value={draft.priceDram ?? ''}
                  aria-invalid={priceErr}
                  aria-describedby={`${id}-price-help${priceErr ? ` ${id}-price-err` : ''}`}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/gu, '');
                    set('priceDram', digits === '' ? null : Number(digits));
                  }}
                />
                <span aria-hidden="true">֏</span>
              </div>
              <span className="yc-help" id={`${id}-price-help`}>
                {t('menu.field.priceHint')}
              </span>
              {priceErr ? (
                <span className="yc-err" id={`${id}-price-err`}>
                  {t('menu.dish.priceInvalid')}
                </span>
              ) : null}
            </div>
          </div>

          <div className="yc-fld">
            <label htmlFor={`${id}-desc`}>
              {t('menu.field.description')}
              <span className="yc-req" aria-hidden="true">
                *
              </span>
            </label>
            <textarea
              id={`${id}-desc`}
              className="yc-ctl"
              maxLength={400}
              value={draft.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </div>

          <div className="yc-fld">
            <label htmlFor={`${id}-ing`}>
              {t('menu.field.ingredients')}
              <span className="yc-req" aria-hidden="true">
                *
              </span>
            </label>
            <div className="yc-tags">
              {draft.ingredients.map((ingredient) => (
                <span key={ingredient} className="yc-tag">
                  {ingredient}
                  <button
                    type="button"
                    aria-label={t('menu.dish.removeIngredient', { name: ingredient })}
                    onClick={() =>
                      set(
                        'ingredients',
                        draft.ingredients.filter((entry) => entry !== ingredient),
                      )
                    }
                  >
                    <CrossIcon />
                  </button>
                </span>
              ))}
              <input
                id={`${id}-ing`}
                value={ingredientText}
                list={`${id}-ing-list`}
                placeholder={t('menu.field.ingredientsPlaceholder')}
                aria-describedby={`${id}-ing-help`}
                onChange={(event) => {
                  const raw = event.target.value;
                  // A pasted list, or a suggestion picked: a comma commits.
                  if (raw.includes(',')) addIngredients(raw);
                  else setIngredientText(raw);
                }}
                onKeyDown={onIngredientKey}
                onBlur={() => addIngredients(ingredientText)}
              />
              <datalist id={`${id}-ing-list`}>
                {props.knownIngredients
                  .filter((known) => !draft.ingredients.includes(known))
                  .map((known) => (
                    <option key={known} value={known} />
                  ))}
              </datalist>
            </div>
            <span className="yc-help" id={`${id}-ing-help`}>
              {t('menu.dish.ingredientsHelp')}
            </span>
          </div>

          <fieldset className="yc-alg">
            <legend>
              {t('menu.field.allergens')}
              <span className="yc-req" aria-hidden="true">
                *
              </span>
            </legend>
            {ALLERGEN_PRESETS.map((preset) => {
              const on = draft.allergens.includes(preset);
              return (
                <label key={preset} className={on ? 'yc-alck is-on' : 'yc-alck'}>
                  <input type="checkbox" checked={on} onChange={() => toggleAllergen(preset)} />
                  {t(`menu.allergen.${preset}`)}
                </label>
              );
            })}
            <label
              className={draft.noAllergens ? 'yc-alck yc-alck-all is-on' : 'yc-alck yc-alck-all'}
            >
              <input
                type="checkbox"
                checked={draft.noAllergens}
                onChange={() =>
                  onChange({
                    ...draft,
                    noAllergens: !draft.noAllergens,
                    // "None" clears the boxes; the free text, typed before the
                    // presets existed, is the person's to clear.
                    allergens: draft.noAllergens ? draft.allergens : [],
                  })
                }
              />
              {t('menu.dish.noAllergens')}
            </label>
          </fieldset>
          {/* Typed before the boxes existed: kept, and editable, never dropped. */}
          {draft.allergensOther ? (
            <div className="yc-fld">
              <label htmlFor={`${id}-alg-other`}>{t('menu.field.allergensOther')}</label>
              <input
                id={`${id}-alg-other`}
                className="yc-ctl"
                value={draft.allergensOther}
                onChange={(event) => set('allergensOther', event.target.value)}
              />
            </div>
          ) : null}

          <div className="yc-row2">
            <div className="yc-fld">
              <label htmlFor={`${id}-portion`}>
                {t('menu.field.portionSize')}
                <span className="yc-req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id={`${id}-portion`}
                className="yc-ctl"
                list={`${id}-portions`}
                placeholder={t('menu.dish.portionPlaceholder')}
                value={draft.portionSize}
                onChange={(event) => set('portionSize', event.target.value)}
              />
              <datalist id={`${id}-portions`}>
                {props.knownPortionSizes.map((size) => (
                  <option key={size} value={size} />
                ))}
              </datalist>
            </div>
            <div className="yc-fld">
              <label htmlFor={`${id}-prep`}>
                {t('menu.field.prepMinutes')}
                <span className="yc-req" aria-hidden="true">
                  *
                </span>
              </label>
              <div className="yc-unit yc-unit-wide">
                <input
                  id={`${id}-prep`}
                  className="yc-ctl"
                  type="number"
                  min={1}
                  max={120}
                  inputMode="numeric"
                  value={draft.prepMinutes ?? ''}
                  aria-describedby={`${id}-prep-help`}
                  onChange={(event) =>
                    set(
                      'prepMinutes',
                      event.target.value === ''
                        ? null
                        : Math.max(0, Math.round(Number(event.target.value))),
                    )
                  }
                />
                <span aria-hidden="true">{t('menu.dish.minutes')}</span>
              </div>
              <span className="yc-help" id={`${id}-prep-help`}>
                {t('menu.field.prepHint')}
              </span>
            </div>
          </div>

          <div className="yc-fld">
            <span className="yc-lbl" id={`${id}-spice`}>
              {t('menu.field.spiceLevel')}
            </span>
            <div className="yc-seg" role="group" aria-labelledby={`${id}-spice`}>
              {SPICE_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={draft.spiceLevel === level}
                  onClick={() => set('spiceLevel', level)}
                >
                  {t(`menu.spice.${level}`)}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <div className="yc-dr-f">
          {props.mode === 'edit' ? (
            <>
              <button
                type="button"
                className="yc-btn yc-btn-ghost yc-btn-sm"
                disabled={props.busy}
                onClick={props.onDuplicate}
              >
                {t('menu.item.duplicate')}
              </button>
              <button
                type="button"
                className="yc-btn yc-btn-ghost yc-btn-sm yc-btn-ghost-red"
                disabled={props.busy}
                onClick={props.onDelete}
              >
                {t('common:action.delete')}
              </button>
            </>
          ) : null}
          <span className="yc-sp" />
          <button
            type="button"
            className="yc-btn yc-btn-sec"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            {t('common:action.cancel')}
          </button>
          <button type="submit" className="yc-btn yc-btn-pri" aria-busy={props.busy}>
            {props.busy ? <span className="yc-spin" aria-hidden="true" /> : null}
            {props.busy
              ? t('saving')
              : gaps.length > 0
                ? t('menu.dish.saveDraft')
                : t('common:action.save')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** Everything this branch has already typed, for the two autocompletes. */
export function knownValues(items: readonly AdminMenuItem[]): {
  ingredients: readonly string[];
  portionSizes: readonly string[];
} {
  const ingredients = new Set<string>();
  const portionSizes = new Set<string>();
  for (const item of items) {
    for (const part of splitList(item.ingredients)) ingredients.add(part);
    if (item.portionSize.trim()) portionSizes.add(item.portionSize.trim());
  }
  return {
    ingredients: [...ingredients].sort((a, b) => a.localeCompare(b)),
    portionSizes: [...portionSizes].sort((a, b) => a.localeCompare(b)),
  };
}
