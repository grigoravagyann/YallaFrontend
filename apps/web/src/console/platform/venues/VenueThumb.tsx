import type { ConsoleVenue } from '@yalla/api';
import { ImageOffIcon } from '../../ui/icons';

/**
 * A venue's picture: its cover thumbnail, a "no photo yet" tile when it has
 * none, or its initial when the source does not report a cover at all.
 * Decorative: the name beside it says whose it is.
 */
export function VenueThumb({
  venue,
  large = false,
}: {
  readonly venue: Pick<ConsoleVenue, 'name' | 'coverThumbnailUrl'>;
  /** The venue page's header size. */
  readonly large?: boolean;
}) {
  const size = large ? ' yc-thumb-lg' : '';
  if (typeof venue.coverThumbnailUrl === 'string') {
    return (
      <img className={`yc-thumb${size}`} src={venue.coverThumbnailUrl} alt="" loading="lazy" />
    );
  }
  if (venue.coverThumbnailUrl === null) {
    return (
      <span className={`yc-thumb yc-thumb-none${size}`} aria-hidden="true">
        <ImageOffIcon />
      </span>
    );
  }
  return (
    <span className={`yc-thumb yc-thumb-letter${size}`} aria-hidden="true">
      {Array.from(venue.name)[0] ?? ''}
    </span>
  );
}
