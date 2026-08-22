import { Button } from '../../ui/Button/Button';
import { useTip } from '../../ui/Tooltip/useTooltip';
import { highlightable } from '../../app/highlight';
import { ladderRows, type LadderContext, type LadderId, type LadderRow } from './ladders';
import styles from './Ladders.module.scss';

/**
 * The four ladders a champion climbs, side by side.
 *
 * This replaced three buttons whose real content lived in a native `title`: what a rank-up
 * cost, why an ascension was greyed out and how far either could still go were all a hover
 * away on a mouse and unreachable on a phone — and awakening, the fourth ladder, had
 * nowhere to go at all.
 *
 * Every row says the same four things in the same order, because the ladders are four
 * instances of one shape rather than four features: where it stands, what the next rung
 * costs, which gate is shut if one is, and the button. A ladder this rarity never had is
 * drawn too, greyed and saying so — "Commons keep the star they were called at" is a rule
 * worth learning from the screen rather than from a refusal.
 */
export function Ladders({
  context,
  busy,
  onTake,
}: {
  context: LadderContext;
  busy: boolean;
  onTake: (id: LadderId) => void;
}): JSX.Element {
  return (
    <ul className={styles.ladders} aria-label="Progression">
      {ladderRows(context).map((row) => (
        <Rung key={row.id} row={row} busy={busy} onTake={() => onTake(row.id)} />
      ))}
    </ul>
  );
}

/** One ladder. Its own component so it can carry a tooltip, which is a hook. */
function Rung({
  row,
  busy,
  onTake,
}: {
  row: LadderRow;
  busy: boolean;
  onTake: () => void;
}): JSX.Element {
  const ref = useTip({
    title: row.label,
    subtitle: row.reading,
    ...(row.cost.length > 0
      ? { stats: row.cost.map((line) => ({ label: 'Costs', value: line, tone: 'plain' as const })) }
      : {}),
    ...(row.blockedBy ? { requires: [row.blockedBy] } : {}),
    ...(row.state === 'ready' ? { hint: row.action } : {}),
  });

  const pct = row.track.total > 0 ? Math.min(100, (row.track.filled / row.track.total) * 100) : 0;

  return (
    <li ref={ref} className={styles.rung} data-state={row.state}>
      <span className={styles.label}>{row.label}</span>

      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${pct}%` }} />
      </span>

      <span className={styles.reading}>{row.reading}</span>

      {/* The cost, and — when something is in the way — which thing. Both on the row rather
          than behind a hover: this is the sentence a player is actually looking for. */}
      <span className={styles.detail}>
        {row.state === 'ready' && row.cost.length > 0 ? (
          row.cost.map((line) => (
            <span key={line} className={styles.cost}>
              {line}
            </span>
          ))
        ) : row.blockedBy ? (
          <span className={styles.blocked}>{row.blockedBy}</span>
        ) : null}
      </span>

      <Button
        {...(row.id === 'level' ? highlightable('button:champion-level') : {})}
        variant={row.state === 'ready' ? 'primary' : 'ghost'}
        disabled={busy || row.state !== 'ready'}
        onClick={onTake}
      >
        {row.action}
      </Button>
    </li>
  );
}
