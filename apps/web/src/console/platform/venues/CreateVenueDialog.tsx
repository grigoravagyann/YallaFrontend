import {
  SlugTakenError,
  ValidationError,
  slugify,
  type ConsoleVenueDetail,
  type StaffMember,
  type StaffSignInLink,
  type VenueType,
} from '@yalla/api';
import { useConsoleGateway } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { issueFailureText } from '../../venue/staff/signInIssue';
import { useCreateVenue } from '../../../data/queries';
import { newCommandId } from '../../../lib/commandId';
import { Dialog } from '../../ui/Dialog';
import { SLUG_SHAPE } from './venueList';

/** Every venue in the pilot is in Yerevan; the field exists so the second city is not a migration. */
const TIME_ZONE = 'Asia/Yerevan';

/** The artboard's check: something, an @, something, a dot, something. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** The artboard's order: a restaurant is the common case. */
const TYPES: readonly VenueType[] = ['restaurant', 'cafe', 'bar'];

type Step = 1 | 2 | 3;

type Field =
  | 'name'
  | 'slug'
  | 'branch'
  | 'branchSlug'
  | 'address'
  | 'pin'
  | 'ownerName'
  | 'ownerPhone'
  | 'ownerEmail';

/** The fields each step owns, in the order the cursor visits them. */
const STEP_FIELDS: Readonly<Record<Step, readonly Field[]>> = {
  1: ['name', 'slug'],
  2: ['branch', 'branchSlug', 'address', 'pin'],
  3: ['ownerName', 'ownerPhone', 'ownerEmail'],
};

/** Which step shows each field's error. */
const FIELD_STEP: Readonly<Record<Field, Step>> = {
  name: 1,
  slug: 1,
  branch: 2,
  branchSlug: 2,
  address: 2,
  pin: 2,
  ownerName: 3,
  ownerPhone: 3,
  ownerEmail: 3,
};

/** Where the cursor goes for each field's error. The pin's error sits under both inputs. */
const FIELD_INPUT: Readonly<Record<Field, string>> = {
  name: 'name',
  slug: 'slug',
  branch: 'branch',
  branchSlug: 'branchSlug',
  address: 'address',
  pin: 'latitude',
  ownerName: 'ownerName',
  ownerPhone: 'ownerPhone',
  ownerEmail: 'ownerEmail',
};

/** What a created venue hands back to the list. */
export type CreatedVenue =
  | { readonly kind: 'plain'; readonly venue: ConsoleVenueDetail }
  | {
      readonly kind: 'withLink';
      readonly venue: ConsoleVenueDetail;
      readonly email: string;
      readonly link: StaffSignInLink;
      readonly pin: string;
    }
  | { readonly kind: 'ownerFailed'; readonly venue: ConsoleVenueDetail; readonly reason: string }
  /**
   * The owner was added — with the PIN the server took, which exists nowhere
   * else — and only their sign-in link failed: shown once all the same, with
   * a way to make the link again.
   */
  | {
      readonly kind: 'linkFailed';
      readonly venue: ConsoleVenueDetail;
      readonly member: StaffMember;
      readonly email: string;
      readonly pin: string;
      readonly reason: string;
    };

export interface CreateVenueDialogProps {
  /** Every web address already in use, deleted venues' included: the server refuses those too. */
  readonly takenSlugs: ReadonlySet<string>;
  readonly onClose: () => void;
  readonly onCreated: (created: CreatedVenue) => void;
}

/** Four digits for the owner's tablet sign-in, which the server requires of everyone. */
function tabletPin(): string {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String((value[0] ?? 0) % 10_000).padStart(4, '0');
}

/**
 * A new venue in three steps (Venues artboard): the venue, its first branch,
 * and optionally its owner.
 *
 * One flow, not two: a venue with no branch has no rooms, no menu and no
 * tables, so it cannot be onboarded or even opened.
 *
 * - Errors appear under their field once a step has been tried, the field is
 *   `aria-invalid` and described by its error, and the cursor goes to the
 *   first one (HANDOFF section 4). "Back" keeps what was typed.
 * - The web addresses follow the names until edited. A branch named only in
 *   Armenian or Russian slugifies to nothing, so its address is asked for
 *   rather than silently left blank.
 * - A blank map pin would reach the server as 0,0, a point in the Atlantic;
 *   it is refused here, and so is one off the globe.
 * - The owner is optional. Given, they are created with the venue (owner,
 *   every branch) and issued a sign-in link, shown once to copy into a chat.
 *   The server requires a phone and a tablet PIN of everyone, so the phone is
 *   asked for and a PIN is drawn and shown beside the link.
 *
 * One command id for the whole dialog, reused on every retry: a resubmit
 * after a timeout must not create a second venue.
 */
export function CreateVenueDialog({ takenSlugs, onClose, onCreated }: CreateVenueDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const gateway = useConsoleGateway();
  const createVenue = useCreateVenue();
  const commandId = useRef(newCommandId());
  const formRef = useRef<HTMLFormElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [tried, setTried] = useState<ReadonlySet<Step>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** A web address the server refused after the client had let it through. */
  const [serverTaken, setServerTaken] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [type, setType] = useState<VenueType>('restaurant');
  const [branch, setBranch] = useState('');
  const [branchSlug, setBranchSlug] = useState('');
  const [branchSlugEdited, setBranchSlugEdited] = useState(false);
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  const venueSlug = slugEdited ? slug : slugify(name);
  const firstBranchSlug = branchSlugEdited ? branchSlug : slugify(branch);
  const owner = { name: ownerName.trim(), phone: ownerPhone.trim(), email: ownerEmail.trim() };
  const wantsOwner = Boolean(owner.name || owner.phone || owner.email);

  const lat = latitude.trim();
  const lng = longitude.trim();
  const errors: Partial<Record<Field, string>> = {};
  if (!name.trim()) errors.name = t('venues.add.error.name');
  if (!venueSlug) errors.slug = t('venues.add.error.slugRequired');
  else if (!SLUG_SHAPE.test(venueSlug)) errors.slug = t('venues.add.error.slugShape');
  else if (takenSlugs.has(venueSlug) || serverTaken === venueSlug) {
    errors.slug = t('venues.add.error.slugTaken', { slug: venueSlug });
  }
  if (!branch.trim()) errors.branch = t('venues.add.error.branch');
  if (!firstBranchSlug) errors.branchSlug = t('venues.add.error.branchSlugRequired');
  else if (!SLUG_SHAPE.test(firstBranchSlug)) errors.branchSlug = t('venues.add.error.slugShape');
  if (!address.trim()) errors.address = t('venues.add.error.address');
  if (!lat || !lng) errors.pin = t('venues.add.error.pinRequired');
  else if (Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    errors.pin = t('venues.add.error.pinNumber');
  } else if (Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) {
    errors.pin = t('venues.add.error.pinRange');
  }
  if (wantsOwner) {
    if (!owner.name) errors.ownerName = t('venues.add.error.ownerName');
    if (!owner.phone) errors.ownerPhone = t('venues.add.error.ownerPhone');
    if (!owner.email) errors.ownerEmail = t('venues.add.error.ownerEmail');
    else if (!EMAIL_SHAPE.test(owner.email)) errors.ownerEmail = t('venues.add.error.email');
  }

  const shown = (field: Field): string | null =>
    tried.has(FIELD_STEP[field]) ? (errors[field] ?? null) : null;

  /** A field to focus once the render that shows it has happened. */
  const pendingFocus = useRef<string | null>('name');
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    formRef.current?.querySelector<HTMLElement>(`[data-field="${target}"]`)?.focus();
  });

  function goTo(next: Step, focus: string) {
    pendingFocus.current = focus;
    setStep(next);
  }

  async function create() {
    setBusy(true);
    setFailure(null);
    let venue: ConsoleVenueDetail;
    try {
      venue = await createVenue.mutateAsync({
        commandId: commandId.current,
        name: name.trim(),
        slug: venueSlug,
        type,
        firstBranch: {
          name: branch.trim(),
          slug: firstBranchSlug,
          timeZoneId: TIME_ZONE,
          address: address.trim(),
          latitude: Number(lat),
          longitude: Number(lng),
        },
      });
    } catch (caught) {
      setBusy(false);
      if (caught instanceof SlugTakenError) {
        setServerTaken(venueSlug);
        setTried((previous) => new Set(previous).add(1));
        goTo(1, 'slug');
        return;
      }
      setFailure(
        caught instanceof ValidationError && caught.field
          ? t('venues.add.error.field', { field: caught.field, detail: caught.message })
          : t('venues.add.error.generic'),
      );
      return;
    }

    if (!wantsOwner) {
      onCreated({ kind: 'plain', venue });
      return;
    }

    // The venue exists from here on: whatever happens to the owner, it is reported, never lost.
    const pin = tabletPin();
    const reason = (caught: unknown) =>
      issueFailureText(caught, {
        offline: t('state.offline'),
        generic: t('state.error'),
        badEmail: t('venues.add.error.email'),
        tooManyRequests: t('staff.signIn.tooManyRequests'),
      });
    let member: StaffMember;
    try {
      member = await gateway.createStaff({
        venueId: venue.id,
        staff: {
          fullName: owner.name,
          phone: owner.phone,
          role: 'owner',
          pin,
          branchId: null,
        },
      });
    } catch (caught) {
      onCreated({ kind: 'ownerFailed', venue, reason: reason(caught) });
      return;
    }
    // Apart: the owner exists now, and their PIN must not be lost with the link.
    try {
      const link = await gateway.issueStaffSignIn({
        venueId: venue.id,
        staffMemberId: member.id,
        email: owner.email,
      });
      onCreated({ kind: 'withLink', venue, email: link.email || owner.email, link, pin });
    } catch (caught) {
      onCreated({
        kind: 'linkFailed',
        venue,
        member,
        email: owner.email,
        pin,
        reason: reason(caught),
      });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried((previous) => new Set(previous).add(step));
    const firstBad = STEP_FIELDS[step].find((field) => errors[field]);
    if (firstBad) {
      pendingFocus.current = FIELD_INPUT[firstBad];
      // Re-render with the errors shown, then focus.
      setFailure(null);
      return;
    }
    if (step < 3) {
      goTo((step + 1) as Step, step === 1 ? 'branch' : 'ownerName');
      return;
    }
    void create();
  }

  function back() {
    if (busy) return;
    if (step === 1) {
      onClose();
      return;
    }
    goTo((step - 1) as Step, step === 2 ? 'name' : 'branch');
  }

  /** A labelled control with its error under it, described by both its help and its error. */
  const field = (
    id: Field,
    label: string,
    control: (aria: {
      readonly id: string;
      readonly 'data-field': string;
      readonly 'aria-invalid': boolean;
      readonly 'aria-describedby'?: string;
    }) => ReactNode,
    options: {
      readonly required?: boolean;
      readonly optional?: boolean;
      readonly help?: string;
    } = {},
  ) => {
    const error = shown(id);
    const inputId = `cv-${id}`;
    const described = [options.help ? `${inputId}-help` : null, error ? `${inputId}-err` : null]
      .filter(Boolean)
      .join(' ');
    return (
      <div className="yc-fld">
        <label htmlFor={inputId}>
          {label}
          {options.required ? <Required label={t('venues.add.requiredMark')} /> : null}
          {options.optional ? (
            <span className="yc-optional">{t('venues.add.optional')}</span>
          ) : null}
        </label>
        {control({
          id: inputId,
          'data-field': id,
          'aria-invalid': Boolean(error),
          ...(described ? { 'aria-describedby': described } : {}),
        })}
        {options.help ? (
          <span className="yc-help" id={`${inputId}-help`}>
            {options.help}
          </span>
        ) : null}
        {error ? (
          <span className="yc-err" id={`${inputId}-err`}>
            {error}
          </span>
        ) : null}
      </div>
    );
  };

  const stepClass = (n: Step) => (n === step ? 'is-on' : n < step ? 'is-done' : undefined);
  const pinError = shown('pin');
  const pinDescribed = `cv-pin-help${pinError ? ' cv-pin-err' : ''}`;

  return (
    <Dialog
      wide
      title={t('venues.add.title')}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
    >
      <form ref={formRef} className="yc-form" noValidate onSubmit={submit}>
        <span className="yc-stepn">{t('venues.add.step', { step })}</span>
        <ol className="yc-steps" aria-label={t('venues.add.steps')}>
          {([1, 2, 3] as const).map((n) => (
            <li
              key={n}
              className={stepClass(n)}
              {...(n === step ? { 'aria-current': 'step' } : {})}
            >
              {t(
                n === 1
                  ? 'venues.add.stepVenue'
                  : n === 2
                    ? 'venues.add.stepBranch'
                    : 'venues.add.stepOwner',
              )}
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <>
            <p>{t('venues.add.lead')}</p>
            {field(
              'name',
              t('venues.add.name'),
              (aria) => (
                <input
                  {...aria}
                  className="yc-ctl"
                  aria-required="true"
                  autoComplete="off"
                  value={name}
                  placeholder={t('venues.add.namePlaceholder')}
                  onChange={(event) => setName(event.target.value)}
                />
              ),
              { required: true },
            )}
            <div className="yc-row2">
              {field(
                'slug',
                t('venues.add.slug'),
                (aria) => (
                  <div className={aria['aria-invalid'] ? 'yc-pre is-bad' : 'yc-pre'}>
                    <span aria-hidden="true">yalla.am/</span>
                    <input
                      {...aria}
                      aria-required="true"
                      autoComplete="off"
                      spellCheck={false}
                      value={venueSlug}
                      placeholder="lumen-coffee"
                      onChange={(event) => {
                        setSlugEdited(true);
                        setSlug(event.target.value.toLowerCase().replace(/\s+/gu, '-'));
                      }}
                    />
                  </div>
                ),
                { required: true, help: t('venues.add.slugHelp') },
              )}
              <div className="yc-fld">
                <label htmlFor="cv-type">{t('venues.add.type')}</label>
                <select
                  id="cv-type"
                  className="yc-ctl"
                  value={type}
                  onChange={(event) => setType(event.target.value as VenueType)}
                >
                  {TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(
                        value === 'cafe'
                          ? 'create.typeCafe'
                          : value === 'restaurant'
                            ? 'create.typeRestaurant'
                            : 'create.typeBar',
                      )}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="yc-row2">
              {field(
                'branch',
                t('venues.add.branchName'),
                (aria) => (
                  <input
                    {...aria}
                    className="yc-ctl"
                    aria-required="true"
                    autoComplete="off"
                    value={branch}
                    placeholder={t('venues.add.branchNamePlaceholder')}
                    onChange={(event) => setBranch(event.target.value)}
                  />
                ),
                { required: true },
              )}
              {field(
                'branchSlug',
                t('venues.add.branchSlug'),
                (aria) => (
                  <input
                    {...aria}
                    className="yc-ctl"
                    aria-required="true"
                    autoComplete="off"
                    spellCheck={false}
                    value={firstBranchSlug}
                    placeholder="northern-avenue"
                    onChange={(event) => {
                      setBranchSlugEdited(true);
                      setBranchSlug(event.target.value.toLowerCase().replace(/\s+/gu, '-'));
                    }}
                  />
                ),
                {
                  required: true,
                  help: `yalla.am/${venueSlug || '…'}/${firstBranchSlug || '…'}`,
                },
              )}
            </div>
            {field(
              'address',
              t('venues.add.address'),
              (aria) => (
                <input
                  {...aria}
                  className="yc-ctl"
                  aria-required="true"
                  autoComplete="off"
                  value={address}
                  placeholder={t('venues.add.addressPlaceholder')}
                  onChange={(event) => setAddress(event.target.value)}
                />
              ),
              { required: true },
            )}
            <div className="yc-row2">
              <div className="yc-fld">
                <label htmlFor="cv-latitude">
                  {t('venues.add.latitude')}
                  <Required label={t('venues.add.requiredMark')} />
                </label>
                <input
                  id="cv-latitude"
                  data-field="latitude"
                  className="yc-ctl"
                  inputMode="decimal"
                  aria-required="true"
                  aria-invalid={Boolean(pinError)}
                  aria-describedby={pinDescribed}
                  value={latitude}
                  placeholder="40.1843"
                  onChange={(event) => setLatitude(event.target.value)}
                />
              </div>
              <div className="yc-fld">
                <label htmlFor="cv-longitude">
                  {t('venues.add.longitude')}
                  <Required label={t('venues.add.requiredMark')} />
                </label>
                <input
                  id="cv-longitude"
                  data-field="longitude"
                  className="yc-ctl"
                  inputMode="decimal"
                  aria-required="true"
                  aria-invalid={Boolean(pinError)}
                  aria-describedby={pinDescribed}
                  value={longitude}
                  placeholder="44.5129"
                  onChange={(event) => setLongitude(event.target.value)}
                />
              </div>
            </div>
            <span className="yc-help" id="cv-pin-help">
              {t('venues.add.pinHelp')}
            </span>
            {pinError ? (
              <span className="yc-err" id="cv-pin-err">
                {pinError}
              </span>
            ) : null}
            <div className="yc-fld">
              <label htmlFor="cv-tz">{t('venues.add.timeZone')}</label>
              <select id="cv-tz" className="yc-ctl" value={TIME_ZONE} onChange={() => undefined}>
                <option value={TIME_ZONE}>Asia/Yerevan (UTC+4)</option>
              </select>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p>{t('venues.add.ownerLead')}</p>
            {field(
              'ownerName',
              t('venues.add.ownerName'),
              (aria) => (
                <input
                  {...aria}
                  className="yc-ctl"
                  autoComplete="off"
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                />
              ),
              { optional: true },
            )}
            <div className="yc-row2">
              {field(
                'ownerPhone',
                t('venues.add.ownerPhone'),
                (aria) => (
                  <input
                    {...aria}
                    className="yc-ctl"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    value={ownerPhone}
                    placeholder="+374 91 000000"
                    onChange={(event) => setOwnerPhone(event.target.value)}
                  />
                ),
                { optional: true },
              )}
              {field(
                'ownerEmail',
                t('venues.add.ownerEmail'),
                (aria) => (
                  <input
                    {...aria}
                    className="yc-ctl"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    spellCheck={false}
                    value={ownerEmail}
                    onChange={(event) => setOwnerEmail(event.target.value)}
                  />
                ),
                { optional: true },
              )}
            </div>
            <dl className="yc-summary">
              <dt>{t('venues.add.summaryVenue')}</dt>
              <dd>
                {name.trim()} · yalla.am/{venueSlug}
              </dd>
              <dt>{t('venues.add.summaryBranch')}</dt>
              <dd>
                {branch.trim()} · {address.trim()}
              </dd>
              <dt>{t('venues.add.summaryMap')}</dt>
              <dd>
                {lat}, {lng} · {TIME_ZONE}
              </dd>
              <dt>{t('venues.add.summaryFeatures')}</dt>
              <dd>{t('venues.add.summaryFeaturesValue')}</dd>
            </dl>
          </>
        ) : null}

        {failure ? (
          <p className="yc-alert" role="alert">
            {failure}
          </p>
        ) : null}

        <div className="yc-dlg-foot">
          <p className="yc-legend">
            <span className="yc-req" aria-hidden="true">
              *
            </span>{' '}
            {t('venues.add.required')}
          </p>
          <div className="yc-acts">
            <button type="button" className="yc-btn yc-btn-sec" onClick={back} disabled={busy}>
              {step === 1 ? t('venues.add.cancel') : t('venues.add.back')}
            </button>
            <button type="submit" className="yc-btn yc-btn-pri" aria-busy={busy}>
              {busy ? <span className="yc-spin" aria-hidden="true" /> : null}
              {busy
                ? t('venues.add.creating')
                : step < 3
                  ? t('venues.add.next')
                  : owner.email
                    ? t('venues.add.createWithLink')
                    : t('venues.add.create')}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/** The red star, and the word for a screen reader. */
function Required({ label }: { readonly label: string }) {
  return (
    <>
      <span className="yc-req" aria-hidden="true">
        *
      </span>
      <span className="yc-sr">{label}</span>
    </>
  );
}
