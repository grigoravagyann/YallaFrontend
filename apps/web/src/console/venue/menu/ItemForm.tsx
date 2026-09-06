import {
  ALLERGEN_PRESETS,
  SPICE_LEVELS,
  allergenText,
  menuItemGaps,
  splitList,
  type AdminMenuItem,
  type AllergenPreset,
  type MenuItemDraft,
  type MenuItemField,
  type Photo,
  type SpiceLevel,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useMemo, useState } from 'react';
import { PhotoPicker } from './PhotoPicker';

/**
 * One dish.
 *
 * The descriptive fields are grouped and the group is **labelled with why it
 * exists**: these five are what a diner would otherwise have to ask a waiter,
 * and filling them in is the entire reason the ordering feature is worth
 * anything. Presented as a list of required inputs they read as bureaucracy;
 * presented as "what a diner asks" they read as the point.
 *
 * Everything here is arranged around the first pass — somebody entering eighty
 * dishes in one afternoon:
 *
 * - **Allergens are chips, not free text.** Free text produces fourteen
 *   spellings of "dairy" across three alphabets and a filter nobody can build.
 * - **Ingredients are chips with autocomplete** from what this branch has
 *   already used. The second khachapuri is much faster than the first.
 * - **Portion size suggests what has been typed before.** Most venues have
 *   four or five, repeated.
 * - **Every gap is named at once**, on submit and as a running count. A form
 *   that reveals one missing field per attempt is a menu that never gets
 *   finished.
 */

export interface ItemFormProps {
  readonly branchId: string;
  readonly draft: MenuItemDraft;
  readonly photo: Photo | null;
  /** What this branch has typed before, for the two autocompletes. */
  readonly knownIngredients: readonly string[];
  readonly knownPortionSizes: readonly string[];
  readonly title: string;
  readonly busy: boolean;
  readonly onChange: (draft: MenuItemDraft) => void;
  readonly onPhoto: (photo: Photo) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
}

export function ItemForm(props: ItemFormProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { draft, onChange } = props;

  /** Gaps are shown once somebody has tried, not while they are still typing. */
  const [attempted, setAttempted] = useState(false);
  const gaps = useMemo(() => menuItemGaps(draft), [draft]);
  const showGaps = attempted && gaps.length > 0;

  function set<K extends keyof MenuItemDraft>(key: K, value: MenuItemDraft[K]): void {
    onChange({ ...draft, [key]: value });
  }

  function toggleAllergen(preset: AllergenPreset): void {
    set(
      'allergens',
      draft.allergens.includes(preset)
        ? draft.allergens.filter((entry) => entry !== preset)
        : [...draft.allergens, preset],
    );
  }

  return (
    <div className="staff-dialog" role="dialog" aria-label={props.title}>
      <div className="card item-form">
        <h2>{props.title}</h2>

        {/* Every missing field, at once, at the top. Named individually so the
            list can be worked down rather than hunted for. */}
        {showGaps ? (
          <div className="error" role="alert">
            <p>{t('menu.item.missingTitle', { count: gaps.length })}</p>
            <ul className="gap-list">
              {gaps.map((gap) => (
                <li key={gap}>{t(`menu.field.${gap}`)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="form-grid">
          <label className="labelled">
            {t('menu.field.name')}
            <input
              className={`field ${markIf(showGaps, gaps, 'name')}`}
              value={draft.name}
              autoFocus
              onChange={(event) => set('name', event.target.value)}
            />
          </label>

          <label className="labelled">
            {t('menu.field.priceDram')}
            <input
              className={`field ${markIf(showGaps, gaps, 'priceDram')}`}
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.priceDram ?? ''}
              onChange={(event) =>
                set('priceDram', event.target.value === '' ? null : Number(event.target.value))
              }
            />
            <span className="small muted">{t('menu.field.priceHint')}</span>
          </label>

          <label className="labelled span-2">
            {t('menu.field.description')}
            <textarea
              className={`field ${markIf(showGaps, gaps, 'description')}`}
              rows={2}
              value={draft.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </label>
        </div>

        {/* The group, and why it exists. */}
        <section className="form-group">
          <h3>{t('menu.item.dinerAsksTitle')}</h3>
          <p className="muted small">{t('menu.item.dinerAsksBody')}</p>

          <label className="labelled">
            {t('menu.field.ingredients')}
            <ChipInput
              values={draft.ingredients}
              suggestions={props.knownIngredients}
              invalid={showGaps && gaps.includes('ingredients')}
              placeholder={t('menu.field.ingredientsPlaceholder')}
              onChange={(values) => set('ingredients', values)}
            />
          </label>

          <fieldset className="labelled">
            <legend>{t('menu.field.allergens')}</legend>
            <div className="chip-row">
              {ALLERGEN_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`chip ${draft.allergens.includes(preset) ? 'is-on' : ''}`}
                  aria-pressed={draft.allergens.includes(preset)}
                  onClick={() => toggleAllergen(preset)}
                >
                  {t(`menu.allergen.${preset}`)}
                </button>
              ))}
            </div>
            <input
              className={`field ${markIf(showGaps, gaps, 'allergens')}`}
              value={draft.allergensOther}
              placeholder={t('menu.field.allergensOther')}
              onChange={(event) => set('allergensOther', event.target.value)}
            />
            <span className="small muted">
              {allergenText(draft) || t('menu.field.allergensNone')}
            </span>
          </fieldset>

          <div className="form-grid">
            <label className="labelled">
              {t('menu.field.portionSize')}
              <input
                className={`field ${markIf(showGaps, gaps, 'portionSize')}`}
                list="portion-sizes"
                value={draft.portionSize}
                onChange={(event) => set('portionSize', event.target.value)}
              />
              <datalist id="portion-sizes">
                {props.knownPortionSizes.map((size) => (
                  <option key={size} value={size} />
                ))}
              </datalist>
            </label>

            <label className="labelled">
              {t('menu.field.prepMinutes')}
              <input
                className={`field ${markIf(showGaps, gaps, 'prepMinutes')}`}
                type="number"
                min={1}
                inputMode="numeric"
                value={draft.prepMinutes ?? ''}
                onChange={(event) =>
                  set('prepMinutes', event.target.value === '' ? null : Number(event.target.value))
                }
              />
              {/* Said here because it changes what a sensible number is: this
                  is shown to the diner at order time as an estimate, not used
                  for kitchen scheduling. */}
              <span className="small muted">{t('menu.field.prepHint')}</span>
            </label>

            <fieldset className="labelled">
              <legend>{t('menu.field.spiceLevel')}</legend>
              <div className="chip-row">
                {SPICE_LEVELS.map((level: SpiceLevel) => (
                  <button
                    key={level}
                    type="button"
                    className={`chip ${draft.spiceLevel === level ? 'is-on' : ''}`}
                    aria-pressed={draft.spiceLevel === level}
                    onClick={() => set('spiceLevel', level)}
                  >
                    {t(`menu.spice.${level}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <section className="form-group">
          <h3>{t('menu.field.photoId')}</h3>
          <PhotoPicker
            branchId={props.branchId}
            photo={props.photo}
            onChange={(photo) => {
              props.onPhoto(photo);
              set('photoId', photo.photoId);
            }}
          />
        </section>

        <div className="actions">
          <button
            type="button"
            className="button button-primary"
            disabled={props.busy}
            onClick={() => {
              setAttempted(true);
              if (menuItemGaps(draft).length === 0) props.onSubmit();
            }}
          >
            {props.busy ? t('saving') : t('common:action.save')}
          </button>
          <button type="button" className="button" disabled={props.busy} onClick={props.onCancel}>
            {t('common:action.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function markIf(show: boolean, gaps: readonly MenuItemField[], field: MenuItemField): string {
  return show && gaps.includes(field) ? 'is-invalid' : '';
}

/**
 * Comma or Enter adds a chip; Backspace on an empty box removes the last.
 *
 * A `datalist` rather than a bespoke dropdown: it is one element, it is
 * keyboard-navigable for free, and it does not need a click-outside handler —
 * all of which matter more than styling on a screen somebody is typing through
 * for an hour.
 */
function ChipInput({
  values,
  suggestions,
  invalid,
  placeholder,
  onChange,
}: {
  readonly values: readonly string[];
  readonly suggestions: readonly string[];
  readonly invalid: boolean;
  readonly placeholder: string;
  readonly onChange: (values: readonly string[]) => void;
}) {
  const [text, setText] = useState('');
  const listId = `ingredients-${suggestions.length}`;

  function commit(raw: string): void {
    const parts = splitList(raw).filter((part) => !values.includes(part));
    if (parts.length > 0) onChange([...values, ...parts]);
    setText('');
  }

  return (
    <div className={`chip-input ${invalid ? 'is-invalid' : ''}`}>
      <div className="chip-row">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className="chip is-on"
            onClick={() => onChange(values.filter((entry) => entry !== value))}
          >
            {value} ✕
          </button>
        ))}
      </div>
      <input
        className="field"
        value={text}
        list={listId}
        placeholder={placeholder}
        onChange={(event) => {
          const raw = event.target.value;
          // A comma is a commit, which is what somebody pasting a list expects
          // and what a `datalist` selection produces on some browsers.
          if (raw.includes(',')) commit(raw);
          else setText(raw);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(text);
          }
          if (event.key === 'Backspace' && text === '' && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => commit(text)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((suggestion) => !values.includes(suggestion))
          .map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
      </datalist>
    </div>
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
