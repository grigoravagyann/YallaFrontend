import type { BranchMenu } from '@yalla/api';
import { formatDram } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useState } from 'react';

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
 */
export function MenuSection({ menu }: { readonly menu: BranchMenu | null | undefined }) {
  const { t } = useTranslation('public');
  const { locale } = useLocale();

  const categories = (menu?.categories ?? []).filter((category) => category.items.length > 0);

  return (
    <section className="pub-section" aria-labelledby="menu">
      <h2 id="menu">{t('section.menu')}</h2>

      {categories.length === 0 ? (
        <p className="pub-muted">{t('menu.empty')}</p>
      ) : (
        <>
          <p className="pub-muted pub-menu-note">{t('menu.ownLanguage')}</p>
          {categories.map((category) => (
            <div key={category.id} className="pub-menu-group">
              <h3>{category.name}</h3>
              <ul className="pub-menu-list">
                {category.items.map((item) => (
                  <li
                    key={item.id}
                    className={item.isAvailable ? 'pub-menu-item' : 'pub-menu-item is-sold-out'}
                  >
                    <MenuPhoto url={item.photo.thumbnailUrl} name={item.name} />
                    <div className="pub-menu-text">
                      <p className="pub-menu-name">{item.name}</p>
                      {item.description ? (
                        <p className="pub-menu-desc">{item.description}</p>
                      ) : null}
                      {item.isAvailable ? null : (
                        <p className="pub-menu-soldout">{t('menu.soldOut')}</p>
                      )}
                    </div>
                    <p className="pub-menu-price num">{formatDram(item.priceDram, locale)}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

/**
 * One dish photo, or the space where one would be.
 *
 * A menu photo that fails — an item photographed before the storage migration,
 * a venue running on the mock — must not leave a broken-image glyph in a list a
 * stranger is judging the place by. The failure collapses to a plain tinted
 * square of the same size, so the row keeps its shape and the list keeps its
 * rhythm.
 */
function MenuPhoto({ url, name }: { readonly url: string; readonly name: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) return <div className="pub-menu-photo is-missing" aria-hidden="true" />;

  return (
    <img
      className="pub-menu-photo"
      src={url}
      // Empty alt: the dish's name is the very next element, and a screen
      // reader announcing it twice is worse than not describing the photo.
      alt=""
      loading="lazy"
      decoding="async"
      width={72}
      height={72}
      onError={() => setFailed(true)}
      data-name={name}
    />
  );
}
