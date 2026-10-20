import type { BranchMenu } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';

/**
 * The menu, with photos, grouped by category.
 *
 * ## Two things this section is careful about
 *
 * **Photos are the heaviest thing on the page by an order of magnitude.** A
 * forty-dish menu with a card image each is several megabytes, and this page is
 * opened on mobile data outside. Every image is `loading="lazy"`, carries
 * explicit dimensions so the row does not collapse and then jump when it
 * arrives, and uses the `thumbnail` variant rather than the `card` one — the
 * backend serves three sizes precisely so a list can ask for the small one.
 *
 * **The menu is not translated, and this does not pretend otherwise.** The
 * schema holds one name per item, written by the venue in whatever language the
 * venue uses. Rendering it inside a page that has just offered three languages
 * implies a translation that does not exist, so there is one line saying so —
 * which is also what stops a visitor concluding the switcher is broken.
 *
 * ## One category at a time (Main artboard)
 *
 * Chips with each category's count choose which is shown, the first at the
 * start: a forty-dish menu as one list is a long scroll between the room and
 * the reviews on a phone. A sold-out dish stays, dimmed, and says so in words
 * in the needs-attention amber — sold out is not a failure, so never red
 * (HANDOFF §3; the artboard drew it red).
 */
export function MenuSection({ menu }: { readonly menu: BranchMenu | null | undefined }) {
  const { t } = useTranslation('public');
  const { locale } = useLocale();
  const headingId = useId();
  const [chosenId, setChosenId] = useState<string | null>(null);

  const categories = (menu?.categories ?? []).filter((category) => category.items.length > 0);
  const category = categories.find((each) => each.id === chosenId) ?? categories[0];

  return (
    <section className="pub-section pub-menu" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('section.menu')}</h2>

      {!category ? (
        <p className="pub-muted">{t('menu.empty')}</p>
      ) : (
        <>
          <p className="pub-muted pub-menu-note">{t('menu.ownLanguage')}</p>
          {categories.length > 1 ? (
            <div className="pub-chips" role="group" aria-label={t('menu.sections')}>
              {categories.map((each) => (
                <button
                  key={each.id}
                  type="button"
                  className="pub-chip"
                  aria-pressed={each.id === category.id}
                  onClick={() => setChosenId(each.id)}
                >
                  {each.name}
                  <small>{each.items.length}</small>
                </button>
              ))}
            </div>
          ) : (
            <h3 className="pub-menu-category">{category.name}</h3>
          )}
          <ul className="pub-menu-list">
            {category.items.map((item) => (
              <li
                key={item.id}
                className={item.isAvailable ? 'pub-menu-item' : 'pub-menu-item is-sold-out'}
              >
                <MenuPhoto url={item.photo.thumbnailUrl} name={item.name} />
                <div className="pub-menu-text">
                  <p className="pub-menu-name">{item.name}</p>
                  {item.description ? <p className="pub-menu-desc">{item.description}</p> : null}
                  {item.isAvailable ? null : (
                    <p className="pub-menu-soldout">{t('menu.soldOut')}</p>
                  )}
                </div>
                <p className="pub-menu-price num">{formatDram(item.priceDram, locale)}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * One dish photo, or the dish's initial where there is none.
 *
 * A menu photo that fails — an item photographed before the storage migration,
 * a venue running on the mock — must not leave a broken-image glyph in a list a
 * stranger is judging the place by. Missing or failed, the frame keeps its
 * size and shows the first letter of the name, as the artboard does, so the
 * row keeps its shape and the list its rhythm.
 */
function MenuPhoto({ url, name }: { readonly url: string; readonly name: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <span className="pub-menu-photo pub-dish-initial" aria-hidden="true">
        {name.charAt(0)}
      </span>
    );
  }

  return (
    <img
      className="pub-menu-photo"
      src={url}
      // Empty alt: the dish's name is the very next element, and a screen
      // reader announcing it twice is worse than not describing the photo.
      alt=""
      loading="lazy"
      decoding="async"
      width={88}
      height={66}
      onError={() => setFailed(true)}
    />
  );
}
