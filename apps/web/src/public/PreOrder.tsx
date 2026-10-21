import {
  newCommandId,
  PRE_ORDER_LIMITS,
  preOrderDraftViolations,
  preOrderFailure,
  PreOrderItemsUnavailableError,
  type BranchMenu,
  type FieldViolation,
  type ManagedBooking,
  type PreOrder,
} from '@yalla/api';
import {
  useClearManagedPreOrder,
  useConfirmManagedOnMyWay,
  useManagedPreOrderMenu,
  useReplaceManagedPreOrder,
} from '@yalla/api/react';
import { formatDram, type Locale } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { dayWords } from './dayNames';
import {
  addOne,
  canAddMore,
  draftCommand,
  isDirty,
  priceDraft,
  quantityOf,
  removeLine,
  removeOne,
  setLineNote,
  setNote,
  startDraft,
  type EditorDraft,
} from './preOrderDraft';
import { preOrderView, type PreOrderViewState } from './preOrderView';
import { branchClock, branchToday } from './slots';

/**
 * Pre-orders on the public page (2026-10-21) — the done step's offer and the
 * manage link's section, with the same rules as the app.
 *
 * The guest's copy lives in the `diner` namespace (`preOrder.*`), which this
 * page loads: one set of words for the app and the link. Nothing is kept in
 * browser storage — the draft lives in this component and is gone with the tab.
 */

type Translate = ReturnType<typeof useTranslation>['t'];

/** The menu query, as the editor needs it: the done step and the link read it differently. */
export interface PreOrderMenuState {
  readonly data: BranchMenu | null | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => unknown;
}

/** "tomorrow, 17:30" — our own day words, not `Intl`'s (public page phase 3). */
export function untilWords(until: string, zone: string, now: Date, t: Translate, locale: Locale) {
  const instant = new Date(until);
  const day = dayWords(branchToday(zone, instant), branchToday(zone, now), t);
  return `${day.name ? day.name.toLocaleLowerCase(locale) : day.date}, ${branchClock(instant, zone)}`;
}

/**
 * The editor: the branch's pre-order menu with − n + on each dish, a note for
 * the kitchen per dish and one for the venue, and the total at the prices the
 * server keeps. Saves the whole list through the manage link; emptied, it
 * offers to remove the pre-order instead. A dish sold out since is marked and
 * must go before the save; every refusal is said; a save whose answer was lost
 * is resent with the same command id.
 */
export function PreOrderEditor({
  token,
  preOrder,
  timeZoneId,
  menu,
  onSaved,
  onCancel,
}: {
  readonly token: string;
  readonly preOrder: PreOrder | null;
  readonly timeZoneId: string;
  readonly menu: PreOrderMenuState;
  /** The pre-order as saved, or `null` once removed. */
  readonly onSaved: (preOrder: PreOrder | null) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const replace = useReplaceManagedPreOrder(token);
  const clear = useClearManagedPreOrder(token);
  const [draft, setDraft] = useState<EditorDraft>(() => startDraft(preOrder));
  const [refused, setRefused] = useState<readonly string[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const attempt = useRef<{ readonly key: string; readonly id: string } | null>(null);
  const resync = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const noteId = useId();

  useEffect(() => {
    heading.current?.focus();
  }, []);
  // "It changed in the meantime": the pre-order as it now reads, once it arrives.
  useEffect(() => {
    if (!resync.current) return;
    resync.current = false;
    setDraft(startDraft(preOrder));
    setRefused([]);
  }, [preOrder]);

  const priced = useMemo(
    () => priceDraft(draft, { preOrder, menu: menu.data, refused }),
    [draft, preOrder, menu.data, refused],
  );
  const categories = menu.data?.categories ?? [];
  const activeCategory = categoryId ?? categories[0]?.id ?? null;
  const items = categories.find((category) => category.id === activeCategory)?.items ?? [];

  const command = draftCommand(draft);
  const violations = draft.lines.length > 0 ? preOrderDraftViolations(command) : [];
  const empty = draft.lines.length === 0;
  const blocked = priced.unavailable.length > 0 || violations.length > 0;
  const pending = replace.isPending || clear.isPending;
  const dirty = isDirty(draft, preOrder);

  const refusedOne =
    replace.error instanceof PreOrderItemsUnavailableError && replace.error.items.length === 1
      ? replace.error.items[0]?.menuItemId
      : undefined;
  const failure = replace.isError
    ? preOrderFailure(replace.error, timeZoneId, locale, {
        dishName: priced.lines.find((line) => line.menuItemId === refusedOne)?.name,
      })
    : clear.isError
      ? preOrderFailure(clear.error, timeZoneId, locale)
      : null;
  const violationText = (field: string): string | null => {
    const found = violations.find((violation) => violation.field === field);
    return found ? limitCopy(found, t) : null;
  };

  const edit = (next: EditorDraft) => {
    setDraft(next);
    if (replace.isError && !(replace.error instanceof PreOrderItemsUnavailableError)) {
      replace.reset();
    }
  };

  const save = () => {
    if (blocked || pending || empty) return;
    const key = JSON.stringify(command);
    if (attempt.current?.key !== key) attempt.current = { key, id: newCommandId() };
    replace.mutate(
      { ...command, clientCommandId: attempt.current.id },
      {
        onSuccess: (result) => {
          attempt.current = null;
          onSaved(result.preOrder);
        },
        onError: (error) => {
          if (error instanceof PreOrderItemsUnavailableError) {
            setRefused(error.items.map((item) => item.menuItemId));
          }
          if (preOrderFailure(error, timeZoneId, locale).kind === 'conflict') {
            resync.current = true;
          }
        },
      },
    );
  };

  const doClear = () => {
    attempt.current ??= { key: 'clear', id: newCommandId() };
    clear.mutate(attempt.current.id, {
      onSuccess: () => {
        attempt.current = null;
        onSaved(null);
      },
    });
  };

  const swap = priced.lines.find((line) => line.unavailable);

  return (
    <section className="pub-card pub-po" aria-labelledby={headingId}>
      <h2 id={headingId} ref={heading} tabIndex={-1}>
        {t('preOrder.title')}
      </h2>

      <div className="pub-po-chosen">
        <h3 className="pub-field-label">
          {t('preOrder.chosen')}
          {empty ? null : (
            <span className="pub-muted">{` · ${t('preOrder.dishes', { count: quantityTotal(draft) })}`}</span>
          )}
        </h3>
        {empty ? <p className="pub-muted">{t('preOrder.empty')}</p> : null}
        <ul className="pub-po-lines">
          {priced.lines.map((line) => {
            const name = line.name || t('preOrder.title');
            const lineError =
              violationText(`lines[${line.index}].quantity`) ??
              violationText(`lines[${line.index}].note`);
            return (
              <li key={`${line.menuItemId}-${line.index}`} className="pub-po-line">
                <div className="pub-po-line-top">
                  <p className="pub-po-name">
                    <b className={line.unavailable ? 'is-out' : undefined}>{name}</b>
                    <span className="pub-muted num">{linePrice(line, locale)}</span>
                    {line.unavailable ? (
                      <span className="pub-menu-soldout">{t('preOrder.unavailableNow')}</span>
                    ) : null}
                  </p>
                  {line.unavailable ? null : (
                    <Stepper
                      name={name}
                      quantity={line.quantity}
                      canAdd={canAddMore(draft, line.menuItemId)}
                      disabled={pending}
                      onAdd={() => edit(addOne(draft, line.menuItemId))}
                      onRemove={() => edit(removeOne(draft, line.menuItemId))}
                    />
                  )}
                </div>
                {line.unavailable ? null : (
                  <input
                    className="pub-input"
                    value={line.note}
                    onChange={(event) =>
                      edit(setLineNote(draft, line.index, event.currentTarget.value))
                    }
                    placeholder={t('preOrder.lineNotePlaceholder')}
                    aria-label={t('preOrder.lineNoteLabel', { name })}
                    maxLength={PRE_ORDER_LIMITS.maxLineNote}
                    disabled={pending}
                  />
                )}
                {lineError ? <p className="pub-field-error">{lineError}</p> : null}
                <button
                  type="button"
                  className="pub-button pub-button-small pub-button-quiet pub-po-remove"
                  aria-label={t('preOrder.removeLineNamed', { name })}
                  disabled={pending}
                  onClick={() => {
                    edit(removeLine(draft, line.index));
                    setRefused(refused.filter((id) => id !== line.menuItemId));
                  }}
                >
                  {t('preOrder.removeLine')}
                </button>
              </li>
            );
          })}
        </ul>
        {swap ? (
          <p className="pub-notice pub-notice-alert">
            {t('preOrder.unavailableSwap', { name: swap.name })}
          </p>
        ) : null}
        {violationText('lines') ? (
          <p className="pub-field-error">{violationText('lines')}</p>
        ) : null}

        <label className="pub-field-label" htmlFor={noteId}>
          {t('preOrder.noteLabel')}
        </label>
        <textarea
          id={noteId}
          className="pub-input pub-po-note"
          value={draft.note}
          onChange={(event) => edit(setNote(draft, event.currentTarget.value))}
          placeholder={t('preOrder.notePlaceholder')}
          maxLength={PRE_ORDER_LIMITS.maxNote}
          rows={2}
          disabled={pending}
        />
        {violationText('note') ? <p className="pub-field-error">{violationText('note')}</p> : null}
        <p className="pub-muted">{t('preOrder.priceNote')}</p>
      </div>

      <div className="pub-po-menu">
        <h3 className="pub-field-label">{t('preOrder.menuTitle')}</h3>
        {menu.isLoading ? (
          <div className="pub-skeleton-card" aria-hidden="true" />
        ) : menu.isError ? (
          <div className="pub-section-failed">
            <p className="pub-muted">{t('preOrder.menuError')}</p>
            <button
              type="button"
              className="pub-button pub-button-small"
              onClick={() => void menu.refetch()}
            >
              {t('preOrder.retry')}
            </button>
          </div>
        ) : categories.length === 0 ? (
          <p className="pub-muted">{t('preOrder.noMenu')}</p>
        ) : (
          <>
            <div className="pub-chips">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="pub-chip"
                  aria-pressed={category.id === activeCategory}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>
            <ul className="pub-menu-list">
              {items.map((item) => {
                const quantity = quantityOf(draft, item.id);
                return (
                  <li key={item.id} className="pub-menu-item pub-po-dish">
                    <div className="pub-menu-text">
                      <p className="pub-menu-name">{item.name}</p>
                      {item.description ? (
                        <p className="pub-menu-desc">{item.description}</p>
                      ) : null}
                      <p className="pub-menu-price">{formatDram(item.priceDram, locale)}</p>
                    </div>
                    {quantity === 0 ? (
                      <button
                        type="button"
                        className="pub-step pub-po-add"
                        aria-label={t('preOrder.addDish', { name: item.name })}
                        disabled={pending || !canAddMore(draft, item.id)}
                        onClick={() => edit(addOne(draft, item.id))}
                      >
                        +
                      </button>
                    ) : (
                      <Stepper
                        name={item.name}
                        quantity={quantity}
                        canAdd={canAddMore(draft, item.id)}
                        disabled={pending}
                        onAdd={() => edit(addOne(draft, item.id))}
                        onRemove={() => edit(removeOne(draft, item.id))}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div className="pub-po-foot">
        {failure ? (
          <p className="pub-notice pub-notice-error" role="alert">
            {t(failure.line.key, failure.line.params)}
          </p>
        ) : null}
        <p className="pub-po-total">
          <span>{t('preOrder.total')}</span>
          <b className="num" aria-live="polite">
            {formatDram(priced.totalDram, locale)}
          </b>
        </p>
        {confirmingClear ? (
          <div className="pub-manage-confirm" role="group" aria-labelledby={`${headingId}-clear`}>
            <h3 id={`${headingId}-clear`}>{t('preOrder.removeTitle')}</h3>
            <p className="pub-muted">{t('preOrder.removeBody')}</p>
            <button
              type="button"
              className="pub-button pub-button-danger pub-button-wide"
              disabled={clear.isPending}
              onClick={doClear}
            >
              {clear.isPending ? t('preOrder.removing') : t('preOrder.removeConfirm')}
            </button>
            <button
              type="button"
              className="pub-button pub-button-wide"
              onClick={() => setConfirmingClear(false)}
            >
              {t('preOrder.removeKeep')}
            </button>
          </div>
        ) : empty && preOrder ? (
          <button
            type="button"
            className="pub-button pub-button-wide pub-button-redline"
            disabled={pending}
            onClick={() => {
              clear.reset();
              setConfirmingClear(true);
            }}
          >
            {t('preOrder.remove')}
          </button>
        ) : (
          <button
            type="button"
            className="pub-button pub-button-primary"
            disabled={empty || blocked || pending || (!dirty && !replace.isError)}
            onClick={save}
          >
            {replace.isPending ? t('preOrder.saving') : t('preOrder.save')}
          </button>
        )}
        <button
          type="button"
          className="pub-button pub-button-quiet pub-button-wide"
          onClick={onCancel}
        >
          {t('preOrder.back')}
        </button>
      </div>
    </section>
  );
}

/** "700 ֏", or "1,200 ֏ × 2 · 2,400 ֏" for more than one: the locked price and the line's total. */
function linePrice(
  line: {
    readonly unitPriceDram: number;
    readonly quantity: number;
    readonly lineTotalDram: number;
  },
  locale: Locale,
): string {
  return line.quantity > 1
    ? `${formatDram(line.unitPriceDram, locale)} × ${line.quantity} · ${formatDram(line.lineTotalDram, locale)}`
    : formatDram(line.lineTotalDram, locale);
}

function quantityTotal(draft: EditorDraft): number {
  return draft.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** A bound the draft is past, in the guest's words. */
function limitCopy(violation: FieldViolation, t: Translate): string {
  const max = violation.max ?? 0;
  if (violation.field === 'note') return t('preOrder.limit.note', { max });
  if (violation.field.endsWith('.note')) return t('preOrder.limit.lineNote', { max });
  if (violation.field.endsWith('.quantity')) return t('preOrder.limit.quantity', { max });
  return max === PRE_ORDER_LIMITS.maxTotalQuantity
    ? t('preOrder.limit.total', { max })
    : t('preOrder.limit.lines', { max: PRE_ORDER_LIMITS.maxLines });
}

function Stepper({
  name,
  quantity,
  canAdd,
  disabled,
  onAdd,
  onRemove,
}: {
  readonly name: string;
  readonly quantity: number;
  readonly canAdd: boolean;
  readonly disabled: boolean;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
}) {
  const { t } = useTranslation('diner');
  return (
    <div className="pub-party pub-po-stepper" role="group" aria-label={name}>
      <button
        type="button"
        className="pub-step"
        aria-label={t('preOrder.fewer', { name })}
        disabled={disabled}
        onClick={onRemove}
      >
        −
      </button>
      <output aria-live="polite">{quantity}</output>
      <button
        type="button"
        className="pub-step"
        aria-label={t('preOrder.more', { name })}
        disabled={disabled || !canAdd}
        onClick={onAdd}
      >
        +
      </button>
    </div>
  );
}

/** The dishes, read-only: "2 × Espresso", each note under its dish, the note for the venue, the total. */
export function PreOrderLines({ preOrder }: { readonly preOrder: PreOrder }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  return (
    <>
      <ul className="pub-po-lines">
        {preOrder.lines.map((line) => (
          <li key={line.id} className="pub-po-line">
            <div className="pub-po-line-top">
              <p className="pub-po-name">
                <span className={line.availableNow ? undefined : 'is-out'}>
                  {`${line.quantity} × ${line.name}`}
                </span>
                {line.note ? <span className="pub-muted">{line.note}</span> : null}
                {line.availableNow ? null : (
                  <span className="pub-menu-soldout">{t('preOrder.unavailableNow')}</span>
                )}
              </p>
              <b className="num">{formatDram(line.lineTotalDram, locale)}</b>
            </div>
          </li>
        ))}
      </ul>
      {preOrder.note ? (
        <p className="pub-po-venue-note">
          <b>{`${t('preOrder.noteLabel')}: `}</b>
          <span>{preOrder.note}</span>
        </p>
      ) : null}
      <p className="pub-po-total">
        <span>{t('preOrder.total')}</span>
        <b className="num">{formatDram(preOrder.totalDram, locale)}</b>
      </p>
    </>
  );
}

/** What became of it: green for on its way or ready, amber for waiting, grey for cancelled. */
export function PreOrderState({
  view,
  kitchen,
}: {
  readonly view: PreOrderViewState;
  readonly kitchen: PreOrder['kitchenStatus'];
}) {
  const { t } = useTranslation('diner');
  switch (view.kind) {
    case 'locked':
      return (
        <div className="pub-notice pub-notice-ok">
          <p>
            <b>{t('preOrder.state.lockedTitle')}</b>
          </p>
          <p>{t('preOrder.state.lockedBody')}</p>
        </div>
      );
    case 'sent':
      return (
        <div className="pub-notice pub-notice-ok">
          <p>
            <b>{t('preOrder.state.sentTitle')}</b>
          </p>
          <p>
            {kitchen && kitchen !== 'inKitchen' && kitchen !== 'new'
              ? t(`preOrder.kitchen.${kitchen}`)
              : t('preOrder.state.sentBody')}
          </p>
        </div>
      );
    case 'notComing':
      return (
        <div className="pub-notice pub-notice-alert">
          <p>
            <b>{t('preOrder.state.notComingTitle')}</b>
          </p>
          <p>{t('preOrder.state.notComingBody')}</p>
        </div>
      );
    case 'cancelled':
      return <p className="pub-muted">{t('preOrder.state.cancelledBody')}</p>;
    default:
      return null;
  }
}

/**
 * The manage link's pre-order: the offer, or the dishes with what became of
 * them, and the editor in place while changing. "Remove" asks first.
 */
export function ManagePreOrder({
  token,
  booking,
  now,
  editing,
  onEditing,
}: {
  readonly token: string;
  readonly booking: ManagedBooking;
  readonly now: Date;
  readonly editing: boolean;
  readonly onEditing: (editing: boolean) => void;
}) {
  const { t } = useTranslation('diner');
  const { t: tp } = useTranslation('public');
  const { locale } = useLocale();
  const view = preOrderView(booking, now);
  const { menu } = useManagedPreOrderMenu(editing ? booking : null);
  const clear = useClearManagedPreOrder(token);
  const [said, setSaid] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const commandId = useRef<string | null>(null);
  const saidRef = useRef<HTMLParagraphElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (said) saidRef.current?.focus();
  }, [said]);

  if (editing && (view.kind === 'offer' || (view.kind === 'editable' && view.canEdit))) {
    return (
      <PreOrderEditor
        token={token}
        preOrder={booking.preOrder ?? null}
        timeZoneId={booking.timeZoneId}
        menu={menu}
        onSaved={(saved) => {
          onEditing(false);
          setSaid(t(saved ? 'preOrder.saved' : 'preOrder.removed'));
        }}
        onCancel={() => onEditing(false)}
      />
    );
  }

  const notice = said ? (
    <p className="pub-notice pub-notice-ok" role="status" tabIndex={-1} ref={saidRef}>
      {said}
    </p>
  ) : null;
  if (view.kind === 'none') return notice;

  const until =
    view.kind === 'offer' || view.kind === 'editable'
      ? untilWords(view.editableUntilUtc, booking.timeZoneId, now, tp, locale)
      : null;

  if (view.kind === 'offer') {
    return (
      <section className="pub-card pub-po" aria-labelledby={headingId}>
        <h2 id={headingId}>{t('preOrder.title')}</h2>
        {notice}
        <p className="pub-card-text">{t('preOrder.offerBody')}</p>
        {until ? <p className="pub-muted">{t('preOrder.editableUntil', { when: until })}</p> : null}
        <button
          type="button"
          className="pub-button pub-button-primary"
          onClick={() => {
            setSaid(null);
            onEditing(true);
          }}
        >
          {t('preOrder.add')}
        </button>
      </section>
    );
  }

  const { preOrder } = view;
  const failure = clear.isError ? preOrderFailure(clear.error, booking.timeZoneId, locale) : null;
  const doClear = () => {
    commandId.current ??= newCommandId();
    clear.mutate(commandId.current, {
      onSuccess: () => {
        commandId.current = null;
        setConfirming(false);
        setSaid(t('preOrder.removed'));
      },
    });
  };
  const unavailable = preOrder.lines.find((line) => !line.availableNow);

  return (
    <section className="pub-card pub-po" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('preOrder.title')}</h2>
      {notice}
      <PreOrderState view={view} kitchen={preOrder.kitchenStatus} />
      <PreOrderLines preOrder={preOrder} />
      {view.kind === 'editable' && unavailable ? (
        <p className="pub-notice pub-notice-alert">
          {t('preOrder.unavailableSwap', { name: unavailable.name })}
        </p>
      ) : view.kind === 'locked' && unavailable ? (
        <p className="pub-notice pub-notice-alert">{t('preOrder.unavailableCall')}</p>
      ) : null}
      {view.kind === 'editable' ? (
        <>
          {view.canEdit && until ? (
            <p className="pub-muted">{t('preOrder.editableUntil', { when: until })}</p>
          ) : (
            <p className="pub-muted">{t('preOrder.state.notAcceptedBody')}</p>
          )}
          {confirming ? (
            <div className="pub-manage-confirm" role="group" aria-labelledby={`${headingId}-clear`}>
              <h3 id={`${headingId}-clear`}>{t('preOrder.removeTitle')}</h3>
              <p className="pub-muted">{t('preOrder.removeBody')}</p>
              {failure ? (
                <p className="pub-error" role="alert">
                  {t(failure.line.key, failure.line.params)}
                </p>
              ) : null}
              <button
                type="button"
                className="pub-button pub-button-danger pub-button-wide"
                disabled={clear.isPending}
                onClick={doClear}
              >
                {clear.isPending ? t('preOrder.removing') : t('preOrder.removeConfirm')}
              </button>
              <button
                type="button"
                className="pub-button pub-button-wide"
                onClick={() => setConfirming(false)}
              >
                {t('preOrder.removeKeep')}
              </button>
            </div>
          ) : (
            <div className="pub-manage-actions">
              {view.canEdit ? (
                <button
                  type="button"
                  className="pub-button pub-button-wide"
                  onClick={() => {
                    setSaid(null);
                    onEditing(true);
                  }}
                >
                  {t('preOrder.edit')}
                </button>
              ) : null}
              {view.canClear ? (
                <button
                  type="button"
                  className="pub-button pub-button-wide pub-button-redline"
                  onClick={() => {
                    clear.reset();
                    setSaid(null);
                    setConfirming(true);
                  }}
                >
                  {t('preOrder.remove')}
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

/**
 * "Are you on your way?" on the manage link — only when the server asks
 * (`onYourWayAsked`). "Yes" tells the waiter; the page then says the waiter
 * knows. "I can't come" is the page's own cancel, which asks first.
 */
export function OnYourWayQuestion({
  token,
  booking,
  onCantCome,
}: {
  readonly token: string;
  readonly booking: ManagedBooking;
  readonly onCantCome: () => void;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const confirm = useConfirmManagedOnMyWay(token);
  const headingId = useId();

  const answered =
    Boolean(booking.guestConfirmedOnWayAtUtc) &&
    booking.status === 'confirmed' &&
    booking.preOrder != null &&
    booking.preOrder.state !== 'cancelled';
  if (answered) {
    return (
      <div className="pub-notice pub-notice-ok" role="status">
        <p>
          <b>{t('preOrder.onYourWay.confirmedTitle')}</b>
        </p>
        <p>{t('preOrder.onYourWay.confirmedBody')}</p>
      </div>
    );
  }
  if (!booking.onYourWayAsked) return null;

  const failure = confirm.isError
    ? preOrderFailure(confirm.error, booking.timeZoneId, locale)
    : null;
  return (
    <section className="pub-card pub-po-way" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('preOrder.onYourWay.title')}</h2>
      <p className="pub-card-text">
        {t('preOrder.onYourWay.body', {
          place: booking.venueName,
          time: branchClock(new Date(booking.slotUtc), booking.timeZoneId),
        })}
      </p>
      {failure ? (
        <p className="pub-notice pub-notice-alert" role="alert">
          {t(failure.line.key, failure.line.params)}
        </p>
      ) : null}
      <button
        type="button"
        className="pub-button pub-button-primary"
        disabled={confirm.isPending}
        onClick={() => confirm.mutate()}
      >
        {confirm.isPending ? t('preOrder.onYourWay.sending') : t('preOrder.onYourWay.yes')}
      </button>
      <button
        type="button"
        className="pub-button pub-button-wide"
        disabled={confirm.isPending}
        onClick={onCantCome}
      >
        {t('preOrder.onYourWay.cantCome')}
      </button>
    </section>
  );
}
