import {
  DEFAULT_MESSAGE_SETTINGS,
  MESSAGE_SETTINGS_LIMITS,
  ValidationError,
  messageSettingsViolations,
  normalizeMessageTemplates,
  type MessageSettings,
  type MessageSettingsInput,
} from '@yalla/api';
import { useMessageSettings, useSaveMessageSettings } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { InfoIcon, TrashIcon } from '../../ui/icons';
import { useToast } from '../../ui/toast';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import type { PreOrderCardDraft } from './PreOrderSettingsCard';

/** The card's anchor, for the policy's contents. */
export const MESSAGES_CARD_ID = 'pol-messages';

/** The card's draft, as the page's save bar needs it: the pre-order card's shape. */
export type MessagesCardDraft = PreOrderCardDraft;

/**
 * Messages with guests (2026-10-23, the Policy artboard), on the Reservation
 * policy screen: whether guests may write, whether waiters may write from the
 * tablet (managers and above always may), the tablet's ready replies — edit,
 * delete, add, at most eight — how long a guest's message may wait before the
 * tablet is reminded, and what the feature never allows.
 *
 * Its own card and its own save, because it is its own endpoint
 * (`PUT …/message-settings`, all four fields every time), and the page's bar
 * saves or discards it with the rest, as it does the takeaway card. A 422
 * names every bad field, and each is marked where it is.
 *
 * While the venue has no replies of its own the server keeps `null` and the
 * tablet offers the app's localized defaults; the card shows the booking set
 * and keeps `null` until one is changed.
 */
export function MessageSettingsCard({
  branchId,
  onDraft,
}: {
  readonly branchId: string;
  /** Told the card's draft as it changes, and `null` while there is no form. */
  readonly onDraft?: ((draft: MessagesCardDraft | null) => void) | undefined;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const query = useMessageSettings(branchId);
  const titleId = `${MESSAGES_CARD_ID}-h`;

  return (
    <section className="yc-card" id={MESSAGES_CARD_ID} aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('messages.title')}
          </h2>
          <p className="yc-cap">{t('messages.body')}</p>
        </div>
      </div>
      {query.isError ? (
        <div className="yc-ov-pad">
          <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : query.data ? (
        // Another branch is another form: nothing typed carries over.
        <MessagesForm key={branchId} saved={query.data} branchId={branchId} onDraft={onDraft} />
      ) : (
        <p className="yc-empty-line" role="status">
          {t('loading')}
        </p>
      )}
    </section>
  );
}

const DEFAULT_KEYS = [
  'common:messages.defaultTemplates.reservation1',
  'common:messages.defaultTemplates.reservation2',
  'common:messages.defaultTemplates.reservation3',
  'common:messages.defaultTemplates.reservation4',
] as const;

/** The booking set of the app's default replies, as the card shows them while there are none. */
function defaultReplies(t: TFunction): string[] {
  return DEFAULT_KEYS.map((key) => t(key));
}

function inputOf(settings: MessageSettings): MessageSettingsInput {
  return {
    guestsCanWrite: settings.guestsCanWrite,
    waitersCanWrite: settings.waitersCanWrite,
    templates: settings.templates,
    remindAfterMinutes: settings.remindAfterMinutes,
  };
}

function same(a: MessageSettingsInput, b: MessageSettingsInput): boolean {
  const templates =
    a.templates === b.templates ||
    (a.templates !== null &&
      b.templates !== null &&
      a.templates.length === b.templates.length &&
      a.templates.every((template, index) => template === b.templates![index]));
  return (
    a.guestsCanWrite === b.guestsCanWrite &&
    a.waitersCanWrite === b.waitersCanWrite &&
    a.remindAfterMinutes === b.remindAfterMinutes &&
    templates
  );
}

const REMIND_ID = 'msg-remind';
const templateId = (index: number) => `msg-tpl-${index}`;

function MessagesForm({
  branchId,
  saved,
  onDraft,
}: {
  readonly branchId: string;
  readonly saved: MessageSettings;
  readonly onDraft?: ((draft: MessagesCardDraft | null) => void) | undefined;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const toast = useToast();
  const save = useSaveMessageSettings(branchId);
  const limits = MESSAGE_SETTINGS_LIMITS;

  const [draft, setDraft] = useState<MessageSettingsInput>(() => inputOf(saved));
  /** The minutes as typed: null when the field shows the number itself. */
  const [typing, setTyping] = useState<string | null>(null);
  /** The fields the server refused although they looked fine here, in its names. */
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set());
  /** The saved values the draft started from: what "changed here" is measured against. */
  const [base, setBase] = useState<MessageSettingsInput>(() => inputOf(saved));

  // A read brought other values (another manager's save, or this card's own):
  // an untouched form takes them in; a touched one keeps what was typed.
  const fresh = inputOf(saved);
  if (!same(fresh, base)) {
    if (same(draft, base)) {
      setDraft(fresh);
      setTyping(null);
    }
    setBase(fresh);
  }

  const violations = messageSettingsViolations(draft);
  const invalid = new Set(violations.map((violation) => violation.field));
  const dirty = !same(draft, fresh);
  useUnsavedChangesGuard(dirty);

  // The page's bar acts through the latest of these, whichever render it holds.
  const actions = useRef({ save: (): boolean => false, discard: () => {} });
  useEffect(() => {
    actions.current = { save: onSave, discard: onDiscard };
  });
  const outOfBounds = violations.length > 0;
  useEffect(() => {
    onDraft?.({
      dirty,
      invalid: dirty && outOfBounds,
      save: () => actions.current.save(),
      discard: () => actions.current.discard(),
    });
  }, [dirty, outOfBounds, onDraft]);
  useEffect(() => () => onDraft?.(null), [onDraft]);

  function change(next: Partial<MessageSettingsInput>, fields: readonly string[]) {
    setDraft((current) => ({ ...current, ...next }));
    setRefused((current) => {
      const hit = [...current].filter((field) =>
        fields.some((name) => field === name || field.startsWith(`${name}[`)),
      );
      if (hit.length === 0) return current;
      const left = new Set(current);
      for (const field of hit) left.delete(field);
      return left;
    });
  }

  /** The replies as shown: the venue's, or the defaults while it has none. */
  const replies = draft.templates ?? defaultReplies(t);
  const setReplies = (next: string[]) => change({ templates: next }, ['templates']);

  function onDiscard() {
    setDraft(fresh);
    setTyping(null);
    setRefused(new Set());
  }

  function onSave(): boolean {
    if (save.isPending) return false;
    const first = violations[0];
    if (first) {
      toast.say(t('policy.fixFirst'), { tone: 'error' });
      focusField(first.field);
      return false;
    }
    if (!dirty) {
      toast.say(t('messages.noChanges'));
      return false;
    }
    setRefused(new Set());
    save.mutate(
      { ...draft, templates: normalizeMessageTemplates(draft.templates) },
      {
        onSuccess: () => {
          setTyping(null);
          toast.say(t('messages.saved'));
        },
        onError: (error) => {
          if (error instanceof ValidationError) {
            const fields = error.violations.map((violation) => violation.field);
            setRefused(new Set(fields.length > 0 ? fields : error.field ? [error.field] : []));
            if (fields[0]) focusField(fields[0]);
          }
          toast.say(t('messages.saveFailed'), { tone: 'error' });
        },
      },
    );
    return true;
  }

  const remind = draft.remindAfterMinutes;
  const remindBad = invalid.has('remindAfterMinutes') || refused.has('remindAfterMinutes');
  const remindError = invalid.has('remindAfterMinutes')
    ? t('policy.outOfBounds', { min: limits.remindMinutesMin, max: limits.remindMinutesMax })
    : refused.has('remindAfterMinutes')
      ? t('policy.refused')
      : null;
  const nudge = (delta: number) => {
    setTyping(null);
    const from = Number.isNaN(remind) ? limits.remindMinutesMin : remind;
    change(
      {
        remindAfterMinutes: Math.max(
          limits.remindMinutesMin,
          Math.min(limits.remindMinutesMax, from + delta),
        ),
      },
      ['remindAfterMinutes'],
    );
  };

  const listBad = invalid.has('templates') || refused.has('templates');
  const atMost = replies.length >= limits.maxTemplates;
  const remindLabel = t('messages.remind.label');

  return (
    <>
      <div className="yc-pf">
        <div className="yc-pf-t">
          <span className="yc-pf-l" id="msg-guests-l">
            {t('messages.guestsCanWrite.label')}
          </span>
          <span className="yc-pf-w" id="msg-guests-w">
            {t('messages.guestsCanWrite.why')}
          </span>
        </div>
        <div className="yc-pf-c">
          <span className="yc-swl">
            <button
              type="button"
              className="yc-sw"
              role="switch"
              id="msg-guests"
              aria-checked={draft.guestsCanWrite}
              aria-labelledby="msg-guests-l"
              aria-describedby="msg-guests-w"
              disabled={save.isPending}
              onClick={() => change({ guestsCanWrite: !draft.guestsCanWrite }, ['guestsCanWrite'])}
            />
            {draft.guestsCanWrite ? t('policy.on') : t('policy.off')}
          </span>
        </div>
      </div>

      <fieldset className="yc-msg-set" aria-describedby="msg-writers-w">
        <legend className="yc-pf-l">{t('messages.writers.legend')}</legend>
        <span className="yc-pf-w" id="msg-writers-w">
          {t('messages.writers.why')}
        </span>
        <label className="yc-check-line">
          <input
            type="checkbox"
            checked={draft.waitersCanWrite}
            disabled={save.isPending}
            onChange={(event) =>
              change({ waitersCanWrite: event.target.checked }, ['waitersCanWrite'])
            }
          />
          {t('messages.writers.waiters')}
        </label>
      </fieldset>

      <div className="yc-msg-set" role="group" aria-labelledby="msg-tpl-l">
        <span className="yc-pf-l" id="msg-tpl-l">
          {t('messages.templates.label')}
        </span>
        <span className="yc-pf-w">{t('messages.templates.why')}</span>
        {draft.templates === null ? (
          <span className="yc-pf-w">{t('messages.templates.defaults')}</span>
        ) : null}
        {replies.length === 0 ? (
          <span className="yc-pf-w">{t('messages.templates.none')}</span>
        ) : (
          <ul className="yc-msg-tpls">
            {replies.map((reply, index) => {
              const field = `templates[${index}]`;
              const bad = invalid.has(field) || refused.has(field);
              const name = t('messages.templates.item', { n: index + 1 });
              const errorId = `${templateId(index)}-e`;
              return (
                <li key={index}>
                  <div className="yc-msg-tpl">
                    <label htmlFor={templateId(index)} className="visually-hidden">
                      {name}
                    </label>
                    <input
                      id={templateId(index)}
                      className="yc-ctl"
                      type="text"
                      maxLength={limits.maxTemplateLength}
                      value={reply}
                      disabled={save.isPending}
                      aria-invalid={bad || undefined}
                      aria-describedby={bad ? errorId : undefined}
                      onChange={(event) => {
                        const next = [...replies];
                        next[index] = event.target.value;
                        change({ templates: next }, [field]);
                      }}
                    />
                    <button
                      type="button"
                      className="yc-msg-del"
                      aria-label={
                        reply.trim()
                          ? t('messages.templates.delete', { text: reply.trim() })
                          : t('messages.templates.deleteEmpty', { n: index + 1 })
                      }
                      disabled={save.isPending}
                      onClick={() => {
                        setReplies(replies.filter((_, at) => at !== index));
                        // The rows below moved up: what the server refused no longer points at them.
                        setRefused(new Set());
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  {bad ? (
                    <span className="yc-err" id={errorId}>
                      {invalid.has(field)
                        ? t('messages.templates.length', { max: limits.maxTemplateLength })
                        : t('policy.refused')}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div className="yc-msg-add">
          <button
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            disabled={save.isPending || atMost}
            aria-describedby={atMost ? 'msg-tpl-max' : undefined}
            onClick={() => {
              setReplies([...replies, '']);
              // The new row's field, once it is drawn.
              const next = replies.length;
              requestAnimationFrame(() => document.getElementById(templateId(next))?.focus());
            }}
          >
            {t('messages.templates.add')}
          </button>
          {atMost || listBad ? (
            <span className={listBad ? 'yc-err' : 'yc-pf-w'} id="msg-tpl-max">
              {t('messages.templates.max', { count: limits.maxTemplates })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="yc-pf">
        <div className="yc-pf-t">
          <span className="yc-pf-l" id={`${REMIND_ID}-l`}>
            {remindLabel}
          </span>
          <span className="yc-pf-w" id={`${REMIND_ID}-w`}>
            {t('messages.remind.why')}
          </span>
        </div>
        <div className="yc-pf-c">
          <div className={remindBad ? 'yc-step is-bad' : 'yc-step'}>
            <button
              type="button"
              aria-label={t('policy.decrease', { field: remindLabel })}
              disabled={save.isPending || remind <= limits.remindMinutesMin}
              onClick={() => nudge(-1)}
            >
              −
            </button>
            <input
              id={REMIND_ID}
              inputMode="numeric"
              value={typing ?? (Number.isNaN(remind) ? '' : String(remind))}
              aria-labelledby={`${REMIND_ID}-l`}
              aria-describedby={remindError ? `${REMIND_ID}-w ${REMIND_ID}-e` : `${REMIND_ID}-w`}
              aria-invalid={remindBad}
              disabled={save.isPending}
              onChange={(event) => {
                const text = event.target.value.replace(/\D/gu, '');
                setTyping(text);
                change({ remindAfterMinutes: text === '' ? Number.NaN : Number(text) }, [
                  'remindAfterMinutes',
                ]);
              }}
              onBlur={() => setTyping(null)}
            />
            <button
              type="button"
              aria-label={t('policy.increase', { field: remindLabel })}
              disabled={save.isPending || remind >= limits.remindMinutesMax}
              onClick={() => nudge(1)}
            >
              +
            </button>
            <span className="yc-step-u">{t('messages.remind.unit')}</span>
          </div>
          {remindError ? (
            <span
              className="yc-err"
              id={`${REMIND_ID}-e`}
              role={refused.has('remindAfterMinutes') ? 'alert' : undefined}
            >
              {remindError}
            </span>
          ) : null}
          <span className="yc-pf-d">
            {t('policy.default', {
              value: `${DEFAULT_MESSAGE_SETTINGS.remindAfterMinutes} ${t('messages.remind.unit')}`,
            })}
          </span>
        </div>
      </div>

      <div className="yc-msg-rules">
        <InfoIcon />
        <span>
          <b>{t('messages.notAllowed.title')}</b>
          <span>{t('messages.notAllowed.body')}</span>
        </span>
      </div>

      <div className="yc-po-save">
        <span className="yc-grow" aria-live="polite">
          {dirty ? t('messages.unsaved') : null}
        </span>
        <button
          type="button"
          className="yc-btn yc-btn-pri yc-btn-sm"
          aria-busy={save.isPending}
          onClick={onSave}
        >
          {save.isPending ? <span className="yc-spin" aria-hidden="true" /> : null}
          {save.isPending ? t('saving') : t('messages.save')}
        </button>
      </div>
    </>
  );
}

/** Focus the field a violation names: `templates[2]`, `templates`, `remindAfterMinutes`. */
function focusField(field: string): void {
  const index = /^templates\[(\d+)\]$/u.exec(field)?.[1];
  const id =
    index !== undefined
      ? templateId(Number(index))
      : field === 'remindAfterMinutes'
        ? REMIND_ID
        : field === 'templates'
          ? templateId(0)
          : null;
  if (id) document.getElementById(id)?.focus();
}
