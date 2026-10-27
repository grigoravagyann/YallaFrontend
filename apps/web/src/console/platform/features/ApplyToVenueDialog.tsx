import {
  sameFeatures,
  venueFeatureSummary,
  type BranchFeature,
  type ConsoleVenueDetail,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { Dialog } from '../../ui/Dialog';
import { useFeatureText } from '../../ui/featureText';
import { AlertCircleIcon } from '../../ui/icons';
import { featuresRefusalText } from './featuresRefusal';

export interface ApplyToVenueDialogProps {
  readonly venue: ConsoleVenueDetail;
  readonly features: readonly BranchFeature[];
  readonly pending: boolean;
  /** Sends the set to every branch; throws the server's refusal. */
  readonly onApply: () => Promise<void>;
  readonly onClose: () => void;
  readonly returnFocusTo: () => HTMLElement | null;
}

/**
 * "Apply to all branches of this venue": one set for every branch, all or
 * nothing — the server moves every branch or none. Says which branches
 * change before anything is sent, and the refusal, naming the branch, after.
 */
export function ApplyToVenueDialog({
  venue,
  features,
  pending,
  onApply,
  onClose,
  returnFocusTo,
}: ApplyToVenueDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const text = useFeatureText();
  const [failure, setFailure] = useState<string | null>(null);
  const changing = venue.branches.filter((branch) => !sameFeatures(branch.features, features));

  async function confirm() {
    setFailure(null);
    try {
      await onApply();
    } catch (caught) {
      setFailure(
        featuresRefusalText(
          caught,
          { venue, branchIds: venue.branches.map((branch) => branch.id), features },
          t,
        ),
      );
    }
  }

  return (
    <Dialog
      title={t('features.applyTitle', { count: venue.branches.length, venue: venue.name })}
      description={t('features.applyBody', {
        summary: text.summary(venueFeatureSummary([{ features }])),
      })}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      {changing.length === 0 ? (
        <p className="yc-empty-line">{t('features.applyNone')}</p>
      ) : (
        <>
          <p className="yc-cap">{t('features.applyChanging', { count: changing.length })}</p>
          <ul className="yc-feat-chg">
            {changing.map((branch) => (
              <li key={branch.id}>
                <b>{branch.name}</b>
                <span>
                  {text.summary(venueFeatureSummary([branch]))}
                  {' → '}
                  {text.summary(venueFeatureSummary([{ features }]))}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {failure ? (
        <p className="yc-alert" role="alert">
          <AlertCircleIcon />
          {failure}
        </p>
      ) : null}
      <div className="yc-acts">
        <button type="button" className="yc-btn yc-btn-sec" data-autofocus="" onClick={onClose}>
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          className="yc-btn yc-btn-pri"
          disabled={changing.length === 0}
          aria-busy={pending}
          onClick={() => void confirm()}
        >
          {t('features.applyConfirm')}
        </button>
      </div>
    </Dialog>
  );
}
