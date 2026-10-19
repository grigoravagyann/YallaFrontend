import type { BranchDetail, PublicBranch } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId } from 'react';
import { Icon, type IconName } from './icons';

/** The amenities the server names (`PublicBranchDetail.amenities`), with their icons. */
const AMENITY_ICON: Readonly<Record<string, IconName>> = {
  outdoorSeating: 'outdoorSeating',
  wifi: 'wifi',
  parking: 'parking',
  cardPayment: 'cardPayment',
  vegan: 'vegan',
};

/**
 * "About" (Main artboard): the venue's own paragraph and what the place has —
 * a terrace, Wi-Fi, card payment. The paragraph falls back to the venue's one
 * line from the page itself, so the section reads the same while the listing
 * loads, when it failed, and for a venue that never wrote one. With neither a
 * paragraph nor an amenity there is no section.
 */
export function AboutSection({
  branch,
  detail,
}: {
  readonly branch: PublicBranch;
  readonly detail: BranchDetail | null | undefined;
}) {
  const { t } = useTranslation('public');
  const headingId = useId();
  const text = detail?.about ?? branch.venue.description;
  // Only the names this page knows how to say; a key from a newer server waits for its words.
  const amenities = (detail?.amenities ?? []).filter((key) => key in AMENITY_ICON);

  if (!text && amenities.length === 0) return null;

  return (
    <section className="pub-section pub-about" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('section.about')}</h2>
      {text ? <p className="pub-about-text">{text}</p> : null}
      {amenities.length > 0 ? (
        <ul className="pub-amenities">
          {amenities.map((key) => (
            <li key={key}>
              <Icon name={AMENITY_ICON[key]!} className="pub-amenity-icon" />
              {t(`place.amenity.${key}`, { ns: 'diner' })}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
