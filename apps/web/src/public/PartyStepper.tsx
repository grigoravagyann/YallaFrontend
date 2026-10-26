import type { PublicBranch } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { formatPhone } from './phone';

/** The party: a stepper from one guest to the branch's largest table. */
export function PartyStepper({
  branch,
  bounds,
  partySize,
  labelId,
  onChange,
}: {
  readonly branch: PublicBranch;
  readonly bounds: { readonly min: number; readonly max: number };
  readonly partySize: number;
  readonly labelId: string;
  readonly onChange: (partySize: number) => void;
}) {
  const { t } = useTranslation('public');
  const { min, max } = bounds;
  const atMin = partySize <= min;
  const atMax = partySize >= max;

  return (
    <div className="pub-book-part">
      <span className="pub-label" id={labelId}>
        {t('booking.partySize', { ns: 'diner' })}
      </span>
      <div className="pub-party" role="group" aria-labelledby={labelId}>
        {/* `aria-disabled` rather than `disabled`, so a keyboard stays on the
            button at the end of its run instead of being dropped to the page. */}
        <button
          type="button"
          className="pub-step"
          aria-label={t('booking.fewer')}
          aria-disabled={atMin || undefined}
          onClick={() => {
            if (!atMin) onChange(partySize - 1);
          }}
        >
          −
        </button>
        <output aria-live="polite">{t('booking.guests', { ns: 'diner', count: partySize })}</output>
        <button
          type="button"
          className="pub-step"
          aria-label={t('booking.more')}
          aria-disabled={atMax || undefined}
          onClick={() => {
            if (!atMax) onChange(partySize + 1);
          }}
        >
          +
        </button>
      </div>
      {atMax ? (
        <p className="pub-hint">
          {branch.phoneE164 ? (
            <>
              {t('booking.bigParty', { count: max })}{' '}
              <a href={`tel:${branch.phoneE164}`}>{formatPhone(branch.phoneE164)}</a>
            </>
          ) : (
            t('booking.bigPartyAsk', { count: max })
          )}
        </p>
      ) : null}
    </div>
  );
}
