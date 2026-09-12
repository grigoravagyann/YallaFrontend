import { ValidationError, type BranchPublicProfile, type Photo } from '@yalla/api';
import { usePublicProfile, useSavePublicProfile } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { PhotoPicker } from '../menu/PhotoPicker';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { useVenueOutlet } from '../VenueLayout';

/**
 * What this branch says to strangers on the internet: the number, whether the
 * public page takes bookings, and the venue card's picture.
 *
 * None of the three could be set from the console before this screen. The
 * backend had the route, the readiness checklist counted the switch, and the
 * public page and the diner app drew the picture — but the only way to change
 * any of it was a hand call to the API. The picker is the menu editor's, so a
 * cover photo is cropped against the same 4:3 card a dish is.
 *
 * Explicit save, like the hours and the policy: three fields that are read by
 * strangers should not change one keystroke at a time.
 */
export function PublicPageScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId } = useVenueOutlet();
  const query = usePublicProfile(branchId ?? undefined);

  if (!branchId) return <p className="muted">{t('publicPage.noBranch')}</p>;
  if (query.isLoading || !query.data) {
    if (query.isError) {
      return <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />;
    }
    return <p className="muted">{t('loading')}</p>;
  }

  // The form owns its draft from the moment the profile arrives. Keyed on the
  // branch so switching branches starts a fresh draft rather than copying the
  // new profile into the old one from an effect.
  return <PublicPageForm key={branchId} branchId={branchId} initial={query.data} />;
}

function PublicPageForm({
  branchId,
  initial,
}: {
  readonly branchId: string;
  readonly initial: BranchPublicProfile;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const save = useSavePublicProfile(branchId);

  const [saved, setSaved] = useState<BranchPublicProfile>(initial);
  const [phone, setPhone] = useState(initial.phoneE164 ?? '');
  const [acceptsWebBookings, setAcceptsWebBookings] = useState(initial.acceptsWebBookings);
  const [cover, setCover] = useState<Photo | null>(initial.coverPhoto);
  const [phoneRefusal, setPhoneRefusal] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'saved' | 'failed' | null>(null);

  const dirty =
    phone !== (saved.phoneE164 ?? '') ||
    acceptsWebBookings !== saved.acceptsWebBookings ||
    (cover?.photoId ?? null) !== (saved.coverPhoto?.photoId ?? null);
  useUnsavedChangesGuard(dirty);

  async function submit() {
    setPhoneRefusal(null);
    setOutcome(null);
    try {
      const result = await save.mutateAsync({
        phoneE164: phone.trim() === '' ? null : phone,
        acceptsWebBookings,
        coverPhotoId: cover?.photoId ?? null,
      });
      setSaved(result);
      setPhone(result.phoneE164 ?? '');
      setCover(result.coverPhoto);
      setOutcome('saved');
    } catch (error) {
      // The server names the field, so the refusal goes under that input
      // rather than at the top of a form that was otherwise fine.
      if (error instanceof ValidationError && error.problem?.context?.['field'] === 'phoneE164') {
        setPhoneRefusal(error.message);
        return;
      }
      setOutcome('failed');
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h2>{t('nav.public')}</h2>
          <p className="muted">{t('publicPage.intro')}</p>
        </div>
      </header>

      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="field-group">
          <h3>{t('publicPage.cover.title')}</h3>
          <p className="muted small">{t('publicPage.cover.help')}</p>
          <PhotoPicker branchId={branchId} photo={cover} onChange={setCover} />
        </div>

        <label className="labelled">
          <span>{t('publicPage.phone.label')}</span>
          <input
            className="field"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+374 11 22 33 44"
            autoComplete="tel"
            aria-invalid={phoneRefusal ? true : undefined}
            aria-describedby={phoneRefusal ? 'public-phone-refusal' : undefined}
          />
          <span className="muted small">{t('publicPage.phone.help')}</span>
        </label>
        {phoneRefusal ? (
          <p id="public-phone-refusal" className="error small" role="alert">
            {phoneRefusal}
          </p>
        ) : null}

        <label className="labelled inline">
          <input
            type="checkbox"
            checked={acceptsWebBookings}
            onChange={(event) => setAcceptsWebBookings(event.target.checked)}
          />
          <span>{t('publicPage.bookings.label')}</span>
        </label>
        <p className="muted small">{t('publicPage.bookings.help')}</p>

        <div className="actions">
          <button type="submit" className="button button-primary" disabled={save.isPending}>
            {save.isPending ? t('publicPage.saving') : t('publicPage.save')}
          </button>
          {outcome === 'saved' ? (
            <span className="muted" role="status">
              {t('publicPage.saved')}
            </span>
          ) : null}
          {outcome === 'failed' ? <span className="error">{t('publicPage.failed')}</span> : null}
        </div>
      </form>
    </section>
  );
}
