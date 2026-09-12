import { ValidationError, type BranchPublicProfile, type Photo } from '@yalla/api';
import { usePublicProfile, useSavePublicProfile } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useMemo, useState } from 'react';
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
  const save = useSavePublicProfile(branchId ?? undefined);

  const [saved, setSaved] = useState<BranchPublicProfile | null>(null);
  const [phone, setPhone] = useState('');
  const [acceptsWebBookings, setAcceptsWebBookings] = useState(false);
  const [cover, setCover] = useState<Photo | null>(null);
  const [phoneRefusal, setPhoneRefusal] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'saved' | 'failed' | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setSaved(query.data);
    setPhone(query.data.phoneE164 ?? '');
    setAcceptsWebBookings(query.data.acceptsWebBookings);
    setCover(query.data.coverPhoto);
  }, [query.data]);

  const dirty = useMemo(
    () =>
      saved !== null &&
      (phone !== (saved.phoneE164 ?? '') ||
        acceptsWebBookings !== saved.acceptsWebBookings ||
        (cover?.photoId ?? null) !== (saved.coverPhoto?.photoId ?? null)),
    [saved, phone, acceptsWebBookings, cover],
  );
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

  if (!branchId) return <p className="muted">{t('publicPage.noBranch')}</p>;
  if (query.isLoading) return <p className="muted">{t('loading')}</p>;
  if (query.isError) {
    return <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />;
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
