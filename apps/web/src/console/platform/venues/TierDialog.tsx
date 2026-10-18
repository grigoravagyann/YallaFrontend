import {
  BranchNotReadyError,
  ConcurrencyConflictError,
  venueTierSummary,
  type ConsoleVenue,
  type SubscriptionTier,
  type VenueTierRefusal,
} from '@yalla/api';
import { useSetVenueTier, useVenueTierCheck } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { newCommandId } from '../../../lib/commandId';
import { Dialog } from '../../ui/Dialog';
import { CheckIcon, CrossIcon, MinusIcon, ReceiptIcon } from '../../ui/icons';

export interface TierDialogProps {
  readonly venue: ConsoleVenue;
  readonly onClose: () => void;
  /** Said once every branch has moved. */
  readonly onDone: (message: string) => void;
  readonly returnFocusTo: () => HTMLElement | null;
}

/** What a refusal says, one line per branch that refused. */
interface Refused {
  readonly tier: SubscriptionTier;
  readonly lines: readonly string[];
  readonly hint: string;
  /** Branches that had already moved before one refused. */
  readonly changed: readonly string[];
}

/**
 * Switch every branch of a venue to one plan (Venues artboard; the tier is per
 * branch, and the list's button applies to all of them — the user's decision
 * of 2026-10-18).
 *
 * Going Paid, each branch's readiness is asked the moment the dialog opens, so
 * a branch with an unfinished menu (`branch-not-ready`) is named before
 * anything is pressed and nothing is sent, as the artboard shows for Mountain
 * View. The server is still the authority: a refusal at the switch itself —
 * going Free with tabs open, or a menu that changed in between — lands in the
 * same view, naming the branch and anything that had already moved.
 *
 * A venue with branches on both plans chooses one for all of them.
 */
export function TierDialog({ venue, onClose, onDone, returnFocusTo }: TierDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const summary = venueTierSummary(venue);
  const [target, setTarget] = useState<SubscriptionTier>(summary.kind === 'paid' ? 'free' : 'paid');
  const [refused, setRefused] = useState<Refused | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const check = useVenueTierCheck({ venueId: venue.id, tier: target });
  const apply = useSetVenueTier();
  const gotItRef = useRef<HTMLButtonElement>(null);
  const refuseId = useId();
  const commandId = useRef(newCommandId());

  const reasonFor = (refusal: VenueTierRefusal): string => {
    const error = refusal.error;
    if (error instanceof BranchNotReadyError) {
      return t('venues.tierDialog.notReady', { count: error.incompleteMenuItemCount });
    }
    if (error instanceof ConcurrencyConflictError && target === 'free') {
      return t('venues.tierDialog.openTabs');
    }
    return t('venue.failed');
  };

  const refusedFrom = (
    refusals: readonly VenueTierRefusal[],
    changed: readonly string[],
  ): Refused => ({
    tier: target,
    lines: refusals.map((refusal) =>
      t('venues.tierDialog.atBranch', { branch: refusal.branch.name, reason: reasonFor(refusal) }),
    ),
    hint:
      target === 'free'
        ? t('venues.tierDialog.openTabsHint')
        : summary.total > 1
          ? `${t('venues.tierDialog.notReadyHint')} ${t('venues.tierDialog.perBranchHint')}`
          : t('venues.tierDialog.notReadyHint'),
    changed,
  });

  // The check found an unfinished menu: refused before anything is pressed.
  const blockers = check.data?.blockers ?? [];
  const shownRefusal: Refused | null =
    refused ??
    (target === 'paid' && blockers.length > 0
      ? refusedFrom(
          blockers.map((blocker) => ({
            branch: blocker.branch,
            error: new BranchNotReadyError({
              url: '',
              branchId: blocker.branch.id,
              incompleteMenuItemCount: blocker.incompleteMenuItemCount,
            }),
          })),
          [],
        )
      : null);

  // The refusal replaces the buttons the focus was on: give it the one left.
  const refusalShown = shownRefusal !== null;
  useEffect(() => {
    if (refusalShown) gotItRef.current?.focus();
  }, [refusalShown]);

  const busy = apply.isPending;
  const checking = target === 'paid' && check.isFetching;

  async function confirm() {
    if (busy || checking) return;
    setFailure(null);
    try {
      const result = await apply.mutateAsync({
        venueId: venue.id,
        tier: target,
        commandId: commandId.current,
      });
      if (result.refused.length === 0) {
        onDone(
          t(target === 'paid' ? 'venues.toast.nowPaid' : 'venues.toast.nowFree', {
            name: venue.name,
          }),
        );
        return;
      }
      setRefused(
        refusedFrom(
          result.refused,
          result.changed.map((branch) => branch.name),
        ),
      );
    } catch {
      setFailure(t('venue.failed'));
    }
  }

  if (shownRefusal) {
    return (
      <Dialog
        alert
        title={t(
          shownRefusal.tier === 'paid'
            ? 'venues.tierDialog.titleRefusedPaid'
            : 'venues.tierDialog.titleRefusedFree',
          { name: venue.name },
        )}
        describedBy={refuseId}
        onClose={onClose}
        returnFocusTo={returnFocusTo}
      >
        <div className="yc-refuse" id={refuseId}>
          <ReceiptIcon />
          <ul>
            {shownRefusal.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        {shownRefusal.changed.length > 0 ? (
          <p>
            {t('venues.tierDialog.changedAlready', {
              branches: shownRefusal.changed.join(', '),
            })}
          </p>
        ) : null}
        <p>{shownRefusal.hint}</p>
        <div className="yc-acts">
          <button
            ref={gotItRef}
            type="button"
            className="yc-btn yc-btn-pri"
            data-autofocus=""
            onClick={onClose}
          >
            {t('venues.tierDialog.gotIt')}
          </button>
        </div>
      </Dialog>
    );
  }

  const consequences =
    target === 'paid'
      ? [
          { tone: 'on', icon: <CheckIcon />, text: t('venues.tierDialog.paid1') },
          { tone: 'on', icon: <CheckIcon />, text: t('venues.tierDialog.paid2') },
          { tone: 'same', icon: <MinusIcon />, text: t('venues.tierDialog.paid3') },
        ]
      : [
          { tone: 'off', icon: <CrossIcon />, text: t('venues.tierDialog.free1') },
          { tone: 'off', icon: <CrossIcon />, text: t('venues.tierDialog.free2') },
          { tone: 'same', icon: <MinusIcon />, text: t('venues.tierDialog.free3') },
        ];

  const title =
    summary.kind === 'mixed'
      ? t('venues.tierDialog.titleMixed', { name: venue.name })
      : t(target === 'paid' ? 'venues.tierDialog.titlePaid' : 'venues.tierDialog.titleFree', {
          name: venue.name,
        });

  return (
    <Dialog
      alert
      title={title}
      description={
        summary.kind === 'mixed'
          ? t('venues.tierDialog.mixedLead', { paid: summary.paid, total: summary.total })
          : t('venues.tierDialog.lead')
      }
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
      returnFocusTo={returnFocusTo}
    >
      {summary.kind === 'mixed' ? (
        <fieldset className="yc-choice">
          <legend>{t('venues.tierDialog.choose')}</legend>
          {(['paid', 'free'] as const).map((tier) => (
            <label key={tier} className={target === tier ? 'yc-radio is-on' : 'yc-radio'}>
              <input
                type="radio"
                name="venue-tier"
                value={tier}
                checked={target === tier}
                disabled={busy}
                onChange={() => setTarget(tier)}
              />
              {t(`tier.${tier}`)}
            </label>
          ))}
        </fieldset>
      ) : null}

      <ul className="yc-consq">
        {consequences.map((line) => (
          <li key={line.text} className={`is-${line.tone}`}>
            {line.icon}
            <span>{line.text}</span>
          </li>
        ))}
      </ul>

      {checking ? (
        <p className="yc-help" role="status">
          {t('venues.tierDialog.checking')}
        </p>
      ) : null}
      {failure ? (
        <p className="yc-alert" role="alert">
          {failure}
        </p>
      ) : null}

      <div className="yc-acts">
        <button
          type="button"
          className="yc-btn yc-btn-sec"
          data-autofocus=""
          onClick={onClose}
          disabled={busy}
        >
          {t('venues.tierDialog.cancel')}
        </button>
        <button
          type="button"
          className={target === 'paid' ? 'yc-btn yc-btn-pri' : 'yc-btn yc-btn-danger'}
          aria-disabled={checking}
          aria-busy={busy}
          onClick={() => void confirm()}
        >
          {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
          {busy
            ? t('venues.tierDialog.working')
            : t(target === 'paid' ? 'venues.tierDialog.toPaid' : 'venues.tierDialog.toFree')}
        </button>
      </div>
    </Dialog>
  );
}
