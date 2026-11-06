import {
  STATUS_LABELS, isCompanyList, questionUrl, sheetShortLabel,
} from '@chestha/core';
import { Badge, Panel, cx } from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';
import { DifficultyBadge } from './DifficultyBadge.jsx';
import { QuestionActions } from './QuestionActions.jsx';
import { useVirtualRows } from '../../app/useVirtualRows.js';

/**
 * The question row, and the windowed list of them.
 *
 * Extracted from the Library because the Overview shows the same questions
 * under each sheet, and a second, simpler row there meant two answers to "what
 * does a question look like": the Overview's lacked the status badge, the
 * actions and the window, so a sheet with 250 questions mounted 250 rows with
 * no way to mark one solved. One component, one answer, and the Overview gets
 * virtualisation for free.
 */

/** Uniform row height, so the virtual window is pure arithmetic. */
export const ROW_PX = 44;

/**
 * One question row at a fixed height. The height has to be uniform for the
 * virtual window to be computable, so the row does not wrap: the title truncates
 * and the badges keep their width.
 */
export function QuestionRow({ question, qs, frequency, user, sheetNames, activeSheet, onPickSheet }) {
  const sheetIds = frequency.listIds.filter((id) => !isCompanyList(id));

  return (
    <li style={{ height: ROW_PX }} className="flex items-center gap-x-3 overflow-hidden px-3.5 transition-colors duration-150 hover:bg-hover">
      {question.leetcodeId && (
        <span className="tabular w-10 shrink-0 text-right text-meta text-ink-faint" title={`LeetCode question ${question.leetcodeId}`}>
          {question.leetcodeId}
        </span>
      )}
      <a
        href={questionUrl(question)}
        target="_blank"
        rel="noreferrer noopener"
        className="min-w-0 flex-1 truncate text-sm text-ink underline-offset-2 hover:underline"
        title={`Open ${question.title} on LeetCode`}
      >
        {question.title}
      </a>

      {question.paidOnly && (
        <Badge tone="warn" title="LeetCode Premium is needed to open this question">
          <Icon name="lock" className="size-3" /> Premium
        </Badge>
      )}
      <DifficultyBadge difficulty={question.difficulty} />
      {/* Sheets only. A question can be tagged by dozens of companies, and
          those chips swamped the row — the title lost its width to a wall of
          abbreviations that no longer read as anything. Who asks a question is
          a filter (and the Companies tab), not a row badge. Every remaining
          sheet is named — no "+n" — and each badge carries its own full name
          on hover. */}
      {sheetIds.length > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          {sheetIds.map((id) => {
            const fullName = sheetNames.get(id) ?? id;
            const label = sheetShortLabel(id, fullName);
            const chip = cx(
              'rounded-chip border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-150',
              activeSheet === id
                ? 'border-line-strong bg-accent-soft text-ink'
                : 'border-line text-ink-muted',
            );
            // Inert where there is nothing to filter — the Overview lists one
            // sheet at a time, and a button that does nothing is worse than a
            // label, for a screen reader most of all.
            if (!onPickSheet) {
              return <span key={id} title={fullName} className={chip}>{label}</span>;
            }
            return (
              <button
                key={id}
                type="button"
                onClick={() => onPickSheet(id)}
                title={fullName}
                aria-label={`Filter to ${fullName}`}
                className={cx(chip, 'hover:bg-surface hover:text-ink')}
              >
                {label}
              </button>
            );
          })}
        </span>
      )}
      <Badge tone={qs.status === 'needs-revision' ? 'danger' : (qs.status === 'solved' || qs.status === 'mastered') ? 'ok' : 'neutral'}>
        {STATUS_LABELS[qs.status]}
      </Badge>
      <QuestionActions slug={question.slug} title={question.title} state={qs} user={user} />
    </li>
  );
}

/**
 * Renders only the rows near the viewport. The full index is 3,511 questions and
 * each row carries several badges and two buttons; mounting them all is thousands
 * of nodes and makes filtering feel sluggish.
 */
/**
 * @param heightClass  the scroller's height as a class — the Library's 80vh.
 * @param height       an exact pixel height, which wins over the class. The
 *   Overview sizes each expanded sheet to its own length so a twelve-question
 *   sheet is not a mostly-empty 20rem box; a class cannot carry a computed
 *   value, since Tailwind only ships classes it can see in the source.
 */
export function VirtualQuestionList({
  rows, sheetNames, activeSheet, onPickSheet, heightClass = 'h-[80vh]', height, as: As = Panel,
}) {
  const { scrollRef, start, end, padTop, padBottom } = useVirtualRows({
    count: rows.length,
    rowHeight: ROW_PX,
  });

  return (
    <As className="overflow-hidden">
      <div
        ref={scrollRef}
        style={height ? { height } : undefined}
        className={cx('overflow-y-auto scrollbar-thin', !height && heightClass)}
      >
        <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
          <ul className="divide-y divide-line">
            {rows.slice(start, end).map(({ question, state: qs, frequency, user }) => (
              <QuestionRow
                key={question.slug}
                question={question}
                qs={qs}
                frequency={frequency}
                user={user}
                sheetNames={sheetNames}
                activeSheet={activeSheet}
                onPickSheet={onPickSheet}
              />
            ))}
          </ul>
        </div>
      </div>
      <p className="border-t border-line px-4 py-2 text-meta text-ink-faint">
        Showing rows {rows.length ? start + 1 : 0}–{end} of {rows.length}.
      </p>
    </As>
  );
}
