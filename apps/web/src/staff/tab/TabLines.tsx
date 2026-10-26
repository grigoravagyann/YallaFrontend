import type { StaffTab, TabAdjustment, TabLine, TabStaffParticipant } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useBranchFormat } from '../useBranchFormat';
import { ParticipantAvatar } from './ParticipantAvatar';
import { lineStage } from './tabRules';

export interface TabLinesProps {
  /** The ids under the panel's own, for the heading. */
  readonly pickId: string;
  readonly tab: StaffTab;
  readonly timeZoneId: string;
  readonly lines: readonly TabLine[];
  readonly linesKnown: boolean;
  /** How many lines are still on the bill. */
  readonly activeLineCount: number;
  readonly dishCount: number;
  /** The adjustments still standing. */
  readonly adjustments: readonly TabAdjustment[];
  readonly nameOf: (person: TabStaffParticipant | undefined) => string;
  /** A line's menu is off: offline, or the tab is closed. */
  readonly lineActions: boolean;
  readonly onLineMenu: (line: TabLine) => void;
}

/**
 * What was ordered: every line with where it is, who it is for, when its
 * order went in and its note, then the whole-tab adjustments as rows.
 */
export function TabLines({
  pickId,
  tab,
  timeZoneId,
  lines,
  linesKnown,
  activeLineCount,
  dishCount,
  adjustments,
  nameOf,
  lineActions,
  onLineMenu,
}: TabLinesProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);

  const whoFor = (line: TabLine): string | null => {
    if (line.isShared) return t('tab.whoShared');
    if (line.isTableAttributed) return t('tab.tableAttributed');
    if (line.onBehalfOfParticipantId) {
      return nameOf(tab.participants.find((person) => person.id === line.onBehalfOfParticipantId));
    }
    // Ordered from their own phone.
    if (line.participantId) {
      return (
        line.orderedByName ??
        nameOf(tab.participants.find((person) => person.id === line.participantId))
      );
    }
    return null;
  };
  /** A comp or a discount on one line, said on the line with its reason. */
  const lineAdjustments = (line: TabLine) =>
    adjustments.filter((adjustment) => adjustment.lineId === line.id);

  return (
    <section className="ft-tab-left" aria-labelledby={`${pickId}-ordered`}>
      <div className="ft-tab-head">
        <h2 id={`${pickId}-ordered`}>{t('tab.ordered')}</h2>
        {linesKnown ? (
          <span className="ft-tab-count">
            {`${t('tab.lines', { count: activeLineCount })} · ${t('order.dishes', { count: dishCount })}`}
          </span>
        ) : null}
        <span className="ft-top-gap" />
        {tab.participants.length > 0 ? (
          <ul className="ft-people" aria-label={t('tab.people')}>
            {tab.participants.map((person) => {
              const name = nameOf(person);
              return (
                <li key={person.id} className={person.isHost ? 'is-host' : undefined}>
                  <ParticipantAvatar person={person} name={name} />
                  <span>
                    {name}
                    {person.isHost ? ` · ${t('tab.host')}` : ''}
                    {person.status === 'approved'
                      ? ''
                      : ` · ${t(`tab.participant.${person.status}`)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="ft-tab-count">{t('tab.noPeople')}</span>
        )}
      </div>

      <div className="ft-tab-lines">
        {!linesKnown ? (
          // Not "nothing was ordered". The two look identical on screen and
          // are opposite things to say to somebody holding a bill.
          <p className="ft-note ft-note-waiting">{t('tab.linesUnknown')}</p>
        ) : lines.length === 0 ? (
          <p className="floor-todo">{t('tab.noItems')}</p>
        ) : (
          <ul className="tab-lines">
            {lines.map((line) => {
              const stage = lineStage(line);
              const who = whoFor(line);
              return (
                <li key={line.id} className={`tab-line status-${line.status}`}>
                  <span className="tab-line-qty">{line.quantity}×</span>
                  <span className="tab-line-main">
                    <span className="tab-line-name">{line.name}</span>
                    <span className="tab-line-meta">
                      <span className={`tab-pill stage-${stage}`}>
                        {t(`tab.lineStatus.${stage}`)}
                        {line.status === 'voided' && line.voidReason ? ` · ${line.voidReason}` : ''}
                      </span>
                      {who || line.placedAtUtc ? (
                        // "Ani · 19:08": who, then when its order went in.
                        <span>
                          {who}
                          {who && line.placedAtUtc ? ' · ' : null}
                          {line.placedAtUtc ? (
                            <time dateTime={line.placedAtUtc}>{format.time(line.placedAtUtc)}</time>
                          ) : null}
                        </span>
                      ) : null}
                      {line.note ? <span>{`“${line.note}”`}</span> : null}
                      {lineAdjustments(line).map((adjustment) => (
                        <span key={adjustment.id} className="tab-line-adjusted">
                          {`${t(`tab.adjustmentKind.${adjustment.kind}`)} · ${adjustment.reason}`}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="tab-line-price">
                    {format.dram(
                      line.status === 'active'
                        ? line.lineTotalDram
                        : line.unitPriceDram * line.quantity,
                    )}
                  </span>
                  {line.status === 'active' ? (
                    <button
                      type="button"
                      className="ft-icon-button"
                      aria-label={t('tab.lineActions', { name: line.name })}
                      disabled={lineActions}
                      onClick={() => onLineMenu(line)}
                    >
                      <svg
                        className="ft-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="5" r="1" />
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="12" cy="19" r="1" />
                      </svg>
                    </button>
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Whole-tab adjustments are their own rows with the manager's
        reason on them; a line's is said on the line. Folded into a
        total, a bill quietly shrinks and nobody can say why. */}
        {adjustments.some((adjustment) => adjustment.lineId === null) ? (
          <ul className="tab-adjustments">
            {adjustments
              .filter((adjustment) => adjustment.lineId === null)
              .map((adjustment) => (
                <li key={adjustment.id}>
                  <span>
                    {`${t(`tab.adjustmentKind.${adjustment.kind}`)} · ${adjustment.reason}`}
                  </span>
                  <span>−{format.dram(adjustment.reductionDram)}</span>
                </li>
              ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
