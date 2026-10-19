import { ValidationError, type BranchPublicProfile, type Photo } from '@yalla/api';
import { usePublicProfile, useSavePublicProfile, useVenueBranchReviews } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { CheckIcon } from '../../ui/icons';
import { PageHeader } from '../../ui/PageHeader';
import { useToast } from '../../ui/toast';
import { PhotoPicker } from '../menu/PhotoPicker';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { useVenueOutlet } from '../VenueLayout';
import { AppCardPreview, type ListingDraft, type PublicPageDraft } from './AppCardPreview';
import { ListingSection } from './ListingSection';

export type { ListingDraft, PublicPageDraft } from './AppCardPreview';

/** Who is editing: the venue's own people, or the Yalla team from the platform section. */
export type PublicPageAudience = 'venue' | 'platform';

/**
 * The venue console's Public page (Public artboard): what strangers see on the
 * branch's link and what diners read in the app, as two forms saved apart,
 * beside the app card as typed.
 */
export function PublicPageScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { branchId, branchName, venueName, publicPath, canRelocate } = useVenueOutlet();
  // The card's stars are the reviews' own average, as the app shows it.
  const reviews = useVenueBranchReviews(branchId ?? undefined, { pageSize: 1 });
  const link = publicPath ? `${window.location.host}${publicPath}` : null;

  return (
    <div className="yc-page">
      <PageHeader
        title={t('nav.public')}
        sub={t('publicPage.sub', { branch: branchName ?? '' })}
        actions={
          link ? (
            <a
              className="yc-pp-link"
              href={`${window.location.protocol}//${link}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {link}
            </a>
          ) : null
        }
      />
      {branchId ? (
        <PublicPageEditor
          branchId={branchId}
          canRelocate={canRelocate}
          venueName={venueName ?? ''}
          branchName={branchName ?? ''}
          rating={reviews.data?.summary?.rating ?? null}
          audience="venue"
        />
      ) : (
        <p className="yc-card yc-empty-line">{t('publicPage.noBranch')}</p>
      )}
    </div>
  );
}

/**
 * The two forms and the card, for one explicit branch, so the platform section
 * can render it for a branch its admin holds no scope claim for — the branch id
 * is theirs to name, and the server checks it either way.
 */
export function PublicPageEditor({
  branchId,
  canRelocate,
  venueName,
  branchName,
  rating,
  audience,
}: {
  readonly branchId: string;
  /** Owner or platform admin: may move the map pin and change the address (K5). */
  readonly canRelocate: boolean;
  readonly venueName: string;
  readonly branchName: string;
  /** The visible reviews' average, for the card's stars; null when not known. */
  readonly rating: number | null;
  readonly audience: PublicPageAudience;
}) {
  const query = usePublicProfile(branchId);
  const [page, setPage] = useState<PublicPageDraft | null>(null);
  const [listing, setListing] = useState<ListingDraft | null>(null);

  let pageForm;
  if (query.data) {
    // The form owns its draft from the moment the profile arrives. Keyed on the
    // branch so switching branches starts a fresh draft rather than copying the
    // new profile into the old one from an effect.
    pageForm = (
      <PageForm
        key={branchId}
        branchId={branchId}
        initial={query.data}
        audience={audience}
        onDraft={setPage}
      />
    );
  } else if (query.isError) {
    pageForm = (
      <div className="yc-card yc-ov-pad">
        <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  } else {
    pageForm = <LoadingCard />;
  }

  return (
    <div className="yc-pp-layout">
      <div className="yc-pp-forms">
        {pageForm}
        <ListingSection
          branchId={branchId}
          canRelocate={canRelocate}
          audience={audience}
          onDraft={setListing}
        />
      </div>
      <AppCardPreview
        venueName={venueName}
        branchName={branchName}
        rating={rating}
        page={page}
        listing={listing}
      />
    </div>
  );
}

export function LoadingCard() {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <p className="yc-card yc-empty-line" role="status">
      {t('loading')}
    </p>
  );
}

/**
 * International format, as the server's `PhoneNumber.Normalise` takes it: a
 * plus, a country code that does not start with 0, eight to fifteen digits in
 * all; spaces, brackets and dashes between them are dropped.
 */
const PHONE = /^\+[1-9]\d{7,14}$/u;

export function phoneProblem(phone: string): boolean {
  const typed = phone.trim();
  return typed !== '' && !PHONE.test(typed.replace(/[\s()-]/gu, ''));
}

/**
 * Page and booking: the cover, the number, and whether the public page takes
 * bookings. Explicit save, like the listing beside it: three things strangers
 * read should not change one keystroke at a time.
 */
function PageForm({
  branchId,
  initial,
  audience,
  onDraft,
}: {
  readonly branchId: string;
  readonly initial: BranchPublicProfile;
  readonly audience: PublicPageAudience;
  readonly onDraft: (draft: PublicPageDraft) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const save = useSavePublicProfile(branchId);
  const titleId = useId();

  const [saved, setSaved] = useState<BranchPublicProfile>(initial);
  const [phone, setPhone] = useState(initial.phoneE164 ?? '');
  const [acceptsWebBookings, setAcceptsWebBookings] = useState(initial.acceptsWebBookings);
  const [cover, setCover] = useState<Photo | null>(initial.coverPhoto);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    onDraft({ acceptsWebBookings, cover });
  }, [onDraft, acceptsWebBookings, cover]);

  const dirty =
    phone !== (saved.phoneE164 ?? '') ||
    acceptsWebBookings !== saved.acceptsWebBookings ||
    (cover?.photoId ?? null) !== (saved.coverPhoto?.photoId ?? null);
  useUnsavedChangesGuard(dirty);

  const phoneBad = (tried && phoneProblem(phone)) || refused;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    if (phoneProblem(phone)) {
      setTried(true);
      document.getElementById('pp-phone')?.focus();
      return;
    }
    setTried(false);
    setRefused(false);
    try {
      const result = await save.mutateAsync({
        phoneE164: phone.trim() === '' ? null : phone.trim(),
        acceptsWebBookings,
        coverPhotoId: cover?.photoId ?? null,
      });
      setSaved(result);
      setPhone(result.phoneE164 ?? '');
      setCover(result.coverPhoto);
      setAcceptsWebBookings(result.acceptsWebBookings);
      setJustSaved(true);
      toast.say(t('publicPage.page.savedToast'));
    } catch (error) {
      // The server names the field: the refusal goes under the number rather
      // than at the top of a form that was otherwise fine.
      if (error instanceof ValidationError && error.problem?.context?.['field'] === 'phoneE164') {
        setRefused(true);
        document.getElementById('pp-phone')?.focus();
        return;
      }
      toast.say(t('publicPage.failed'), { tone: 'error' });
    }
  }

  return (
    <form className="yc-card" aria-labelledby={titleId} noValidate onSubmit={submit}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('publicPage.page.title')}
          </h2>
          <p className="yc-cap">
            {audience === 'venue' ? t('publicPage.page.cap') : t('publicPage.page.capPlatform')}
          </p>
        </div>
      </div>
      <div className="yc-pp-b">
        <div className="yc-fld">
          <span className="yc-lbl">{t('publicPage.cover.title')}</span>
          <span className="yc-help">{t('publicPage.cover.help')}</span>
          <PhotoPicker
            branchId={branchId}
            photo={cover}
            onChange={(photo) => {
              setCover(photo);
              setJustSaved(false);
              toast.say(t('publicPage.cover.changed'));
            }}
          />
        </div>

        <div className="yc-fld">
          <label htmlFor="pp-phone">{t('publicPage.phone.label')}</label>
          <input
            id="pp-phone"
            className="yc-ctl"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            placeholder="+374 11 22 33 44"
            aria-invalid={phoneBad}
            aria-describedby={phoneBad ? 'pp-phone-help pp-phone-err' : 'pp-phone-help'}
            onChange={(event) => {
              setPhone(event.target.value);
              setRefused(false);
              setJustSaved(false);
            }}
          />
          <span className="yc-help" id="pp-phone-help">
            {t('publicPage.phone.help')}
          </span>
          {phoneBad ? (
            <span className="yc-err" id="pp-phone-err">
              {t('publicPage.phone.invalid')}
            </span>
          ) : null}
        </div>

        <div className="yc-pp-switch">
          <button
            type="button"
            className="yc-sw"
            role="switch"
            aria-checked={acceptsWebBookings}
            aria-labelledby="pp-bookings-l"
            aria-describedby="pp-bookings-d"
            onClick={() => {
              setAcceptsWebBookings((on) => !on);
              setJustSaved(false);
            }}
          />
          <span className="yc-pp-sw-t">
            <b id="pp-bookings-l">{t('publicPage.bookings.label')}</b>
            <span className="yc-help" id="pp-bookings-d">
              {t('publicPage.bookings.help')}
            </span>
          </span>
        </div>
      </div>
      <div className="yc-pp-f">
        <button type="submit" className="yc-btn yc-btn-pri" aria-busy={save.isPending}>
          {save.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
          {save.isPending ? t('publicPage.saving') : t('publicPage.save')}
        </button>
        {dirty ? <span className="yc-dirty">{t('publicPage.unsaved')}</span> : null}
        {justSaved && !dirty ? (
          <span className="yc-saved" role="status">
            <CheckIcon />
            {t('publicPage.saved')}
          </span>
        ) : null}
      </div>
    </form>
  );
}
