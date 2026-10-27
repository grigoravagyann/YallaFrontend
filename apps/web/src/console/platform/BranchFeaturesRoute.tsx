import {
  BASIC_FEATURES,
  FULL_FEATURES,
  featurePreset,
  preOrdersWithoutBookings,
  sameFeatures,
  sortFeatures,
  venueFeatureSummary,
  type BranchFeature,
  type ConsoleBranch,
  type ConsoleVenueDetail,
} from '@yalla/api';
import { useApplyVenueFeatures, useSetBranchFeatures } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useId, useRef, useState } from 'react';
import { newCommandId } from '../../lib/commandId';
import { FEATURE_GROUPS, useFeatureText } from '../ui/featureText';
import { AlertCircleIcon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { ApplyToVenueDialog } from './features/ApplyToVenueDialog';
import { featuresRefusalText } from './features/featuresRefusal';
import { BranchPage } from './PlatformBranchHeader';

/**
 * What a branch may use, for the platform admin (2026-10-27, in place of the
 * Free/Paid plan): ten switches in four groups, the Basic and Full presets,
 * and "apply to all branches of this venue". Nothing is sent until Save; the
 * server's refusals — pre-orders with no booking channel, table service with
 * an unfinished menu or with tabs open — are said under the switches, in
 * plain words.
 *
 * The venue's own settings live inside this set: switching a feature off here
 * hides it from the venue's console (locked, not gone) and keeps the venue's
 * settings for when it comes back.
 */
export function BranchFeaturesRoute() {
  return (
    <BranchPage tab="features">
      {({ venue, branch }) => (
        <FeaturesEditor
          // A saved set comes back as the venue read: start again from it.
          key={`${branch.id}:${branch.features.join(',')}`}
          venue={venue}
          branch={branch}
        />
      )}
    </BranchPage>
  );
}

function FeaturesEditor({
  venue,
  branch,
}: {
  readonly venue: ConsoleVenueDetail;
  readonly branch: ConsoleBranch;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const text = useFeatureText();
  const toast = useToast();
  const save = useSetBranchFeatures();
  const apply = useApplyVenueFeatures();
  const [draft, setDraft] = useState<readonly BranchFeature[]>(branch.features);
  const [failure, setFailure] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const commandId = useRef(newCommandId());
  const titleId = useId();
  const warnId = useId();
  const applyRef = useRef<HTMLButtonElement>(null);

  const deleted = venue.status === 'deleted';
  const changed = !sameFeatures(draft, branch.features);
  const needsBooking = preOrdersWithoutBookings(draft);
  const preset = featurePreset(draft);
  const busy = save.isPending || apply.isPending;

  const set = (next: readonly BranchFeature[]) => {
    setDraft(sortFeatures(next));
    setFailure(null);
    commandId.current = newCommandId();
  };
  const toggle = (feature: BranchFeature) =>
    set(draft.includes(feature) ? draft.filter((f) => f !== feature) : [...draft, feature]);

  async function submit() {
    setFailure(null);
    try {
      await save.mutateAsync({
        branchId: branch.id,
        features: draft,
        commandId: commandId.current,
      });
      toast.say(t('features.saved', { branch: branch.name }));
    } catch (caught) {
      setFailure(
        featuresRefusalText(caught, { venue, branchIds: [branch.id], features: draft }, t),
      );
    }
  }

  return (
    <section className="yc-card yc-feat" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('features.title')}
          </h2>
          <p className="yc-cap">{t('features.cap')}</p>
        </div>
        <span className="yc-pill yc-pill-brand" aria-live="polite">
          {text.summary(venueFeatureSummary([{ features: draft }]))}
        </span>
      </div>

      {deleted ? (
        <p className="yc-alert yc-alert-warn" role="status">
          <AlertCircleIcon />
          {t('features.deleted')}
        </p>
      ) : null}

      <div className="yc-feat-pre" role="group" aria-label={t('features.presets')}>
        <span className="yc-feat-prel">{t('features.presets')}</span>
        {(['basic', 'full'] as const).map((name) => (
          <button
            key={name}
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            aria-pressed={preset === name}
            aria-describedby={`${titleId}-${name}`}
            disabled={deleted || busy}
            onClick={() => set(name === 'full' ? FULL_FEATURES : BASIC_FEATURES)}
          >
            {t(`features.preset.${name}`)}
          </button>
        ))}
        <span className="yc-feat-preh" id={`${titleId}-basic`}>
          {t('features.presetHint.basic')}
        </span>
        <span className="yc-sr" id={`${titleId}-full`}>
          {t('features.presetHint.full')}
        </span>
      </div>

      <div className="yc-feat-gs">
        {FEATURE_GROUPS.map((group) => (
          <fieldset key={group.id} className="yc-feat-g">
            <legend className="yc-feat-gl">{t(`features.group.${group.id}`)}</legend>
            {group.features.map((feature) => {
              const id = `feat-${feature}`;
              const on = draft.includes(feature);
              const warn = feature === 'preOrders' && needsBooking;
              return (
                <div key={feature} className="yc-feat-row">
                  <div className="yc-feat-t">
                    <span className="yc-feat-n" id={`${id}-l`}>
                      {text.name(feature)}
                    </span>
                    <span className="yc-feat-h" id={`${id}-h`}>
                      {text.hint(feature)}
                    </span>
                    {warn ? (
                      <span className="yc-feat-w" id={warnId}>
                        <AlertCircleIcon />
                        {t('features.refusal.preOrders')}
                      </span>
                    ) : null}
                  </div>
                  <span className="yc-swl">
                    <button
                      type="button"
                      className="yc-sw"
                      role="switch"
                      id={id}
                      aria-checked={on}
                      aria-labelledby={`${id}-l`}
                      aria-describedby={warn ? `${id}-h ${warnId}` : `${id}-h`}
                      disabled={deleted || busy}
                      onClick={() => toggle(feature)}
                    />
                    <span aria-hidden="true">{on ? t('features.on') : t('features.off')}</span>
                  </span>
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>

      {failure ? (
        <p className="yc-alert" role="alert">
          <AlertCircleIcon />
          {failure}
        </p>
      ) : null}

      {deleted ? null : (
        <div className="yc-feat-acts">
          {venue.branches.length > 1 ? (
            <button
              ref={applyRef}
              type="button"
              className="yc-btn yc-btn-sec"
              disabled={busy || needsBooking}
              onClick={() => setApplying(true)}
            >
              {t('features.applyAll', { count: venue.branches.length })}
            </button>
          ) : null}
          <span className="yc-grow" />
          {changed ? (
            <button
              type="button"
              className="yc-btn yc-btn-sec"
              disabled={busy}
              onClick={() => set(branch.features)}
            >
              {t('features.discard')}
            </button>
          ) : null}
          <button
            type="button"
            className="yc-btn yc-btn-pri"
            disabled={!changed || needsBooking}
            aria-busy={save.isPending}
            aria-describedby={needsBooking ? warnId : undefined}
            onClick={() => void submit()}
          >
            {t('features.save')}
          </button>
        </div>
      )}

      {applying ? (
        <ApplyToVenueDialog
          venue={venue}
          features={draft}
          pending={apply.isPending}
          onApply={async () => {
            await apply.mutateAsync({
              venueId: venue.id,
              features: draft,
              commandId: newCommandId(),
            });
            setApplying(false);
            toast.say(t('features.applied', { venue: venue.name }));
          }}
          onClose={() => setApplying(false)}
          returnFocusTo={() => applyRef.current}
        />
      ) : null}
    </section>
  );
}
