import { useEffect, useRef } from 'react';
import { Icon } from '../Icon/Icon';
import { Rail } from '../Rail/Rail';
import { describeRewards, useRewardName } from '../Rewards/Rewards';
import { rewardArt } from '../Rewards/art';
import { useTip } from '../Tooltip/useTooltip';
import styles from './Ladder.module.scss';

/**
 * A ladder of tiers, as a rail of tiles (C43, shared since C44).
 *
 * The library's `RewardTrack` positions its nodes along one rail by the score they sit at,
 * which is the right shape for six milestones and the wrong one for thirty: the shipped
 * Vale Pass put thirty 44px tiles into 1,300px, so every reward label overlapped the next
 * and the tier numbers were nine-pixel smears. A season — and an event — is a *ladder*,
 * walked one rung at a time; so each tier is a column you can read, the columns run off the
 * side of the window on a `Rail`, and the rung the player is walking toward is brought
 * into view when the screen opens.
 *
 * One component for both because they are one shape: a rung has a number, a score, and one
 * tile per **row** — the pass has two rows (the free column and the season's own), an
 * event has one. Every state on a tile is the server's own flag; the tile decides only how
 * to draw it, and is a button only while it can be pressed.
 */
export interface LadderRow {
  key: string;
  title: string;
  subtitle?: string;
  /** Drawn dimmed — the pass's own column before it is taken up. */
  locked?: boolean;
}

export interface LadderTile {
  rewards: Readonly<Record<string, number>>;
  claimed: boolean;
  /** Reached but shut — a season reward behind a purchase. */
  barred: boolean;
}

export interface LadderTier {
  index: number;
  points: number;
  reached: boolean;
  /** One per row, in the rows' order. */
  tiles: readonly LadderTile[];
}

export function Ladder({
  rows,
  tiers,
  scrollKey,
  busy,
  label,
  onClaim,
}: {
  rows: readonly LadderRow[];
  tiers: readonly LadderTier[];
  /** Changes when the ladder is a different one, so the next rung is centred again. */
  scrollKey: string;
  busy: boolean;
  /** The rail's accessible name. */
  label: string;
  onClaim: (rowKey: string, tier: LadderTier) => void;
}): JSX.Element {
  const nameOf = useRewardName();
  const nextIndex = tiers.find((tier) => !tier.reached)?.index ?? null;
  const current = useRef<HTMLDivElement | null>(null);

  // The next rung is where the eye should land, and on a thirty-tier season it is usually
  // off the right-hand edge. The rail is scrolled sideways by hand rather than with
  // `scrollIntoView`, which would also scroll the *screen* to the ladder — and a page with
  // three events on it would open scrolled to the third one's ladder.
  useEffect(() => {
    const rung = current.current;
    if (!rung) return;
    let track: HTMLElement | null = rung.parentElement;
    while (track && !/auto|scroll/.test(getComputedStyle(track).overflowX)) {
      track = track.parentElement;
    }
    if (!track) return;
    const box = track.getBoundingClientRect();
    const own = rung.getBoundingClientRect();
    track.scrollLeft += own.left + own.width / 2 - (box.left + box.width / 2);
  }, [scrollKey, nextIndex]);

  return (
    <div
      className={styles.ladder}
      style={{ '--mv-ladder-rows': rows.length } as React.CSSProperties}
    >
      <div className={styles.labels}>
        <span className={styles.corner}>Tier</span>
        {rows.map((row) => (
          <div key={row.key} className={styles.rowLabel} data-locked={row.locked === true}>
            <span className={styles.rowTitle}>{row.title}</span>
            {row.subtitle && <span className={styles.rowSub}>{row.subtitle}</span>}
          </div>
        ))}
      </div>

      <Rail label={label} className={styles.rail}>
        {tiers.map((tier) => {
          const isNext = tier.index === nextIndex;
          return (
            <div
              key={tier.index}
              ref={isNext ? current : undefined}
              className={styles.tier}
              data-reached={tier.reached}
              data-next={isNext}
            >
              <div className={styles.rung}>
                <span className={styles.rungIndex}>{tier.index + 1}</span>
                <span className={styles.rungAt}>{tier.points.toLocaleString()}</span>
              </div>
              {rows.map((row, at) => {
                const tile = tier.tiles[at];
                if (!tile) return null;
                return (
                  <Tile
                    key={row.key}
                    row={row}
                    tier={tier}
                    tile={tile}
                    busy={busy}
                    nameOf={nameOf}
                    onClaim={onClaim}
                  />
                );
              })}
            </div>
          );
        })}
      </Rail>
    </div>
  );
}

type TileState = 'empty' | 'locked' | 'barred' | 'ready' | 'claimed';

function stateOf(tier: LadderTier, tile: LadderTile): TileState {
  const paying = Object.values(tile.rewards).some((amount) => amount > 0);
  if (!paying) return 'empty';
  if (tile.claimed) return 'claimed';
  if (!tier.reached) return 'locked';
  if (tile.barred) return 'barred';
  return 'ready';
}

const STATE_WORDS: Readonly<Record<TileState, string>> = Object.freeze({
  empty: 'Nothing here',
  locked: 'Not reached yet',
  barred: 'Shut',
  ready: 'Ready to collect',
  claimed: 'Collected',
});

/**
 * One tile. Its own component because it carries a painted tooltip, and a tooltip is a
 * hook — the tile shows the reward's art and its count, and the tooltip says what the art
 * is, which the tile has no room to.
 */
function Tile({
  row,
  tier,
  tile,
  busy,
  nameOf,
  onClaim,
}: {
  row: LadderRow;
  tier: LadderTier;
  tile: LadderTile;
  busy: boolean;
  nameOf: (key: string) => string;
  onClaim: (rowKey: string, tier: LadderTier) => void;
}): JSX.Element {
  const state = stateOf(tier, tile);
  const first = Object.entries(tile.rewards).find(([, amount]) => amount > 0);
  const words = describeRewards(tile.rewards, nameOf) || 'Nothing here';
  const ref = useTip({
    title: words,
    subtitle: `${row.title} · tier ${tier.index + 1} · ${STATE_WORDS[state]}`,
    ...(state === 'ready' ? { hint: 'Click to collect' } : {}),
  });

  return (
    <button
      ref={ref}
      type="button"
      className={styles.tile}
      data-row={row.key}
      data-state={state}
      disabled={state !== 'ready' || busy}
      aria-label={`${row.title}, tier ${tier.index + 1}: ${words} — ${STATE_WORDS[state].toLowerCase()}`}
      onClick={() => onClaim(row.key, tier)}
    >
      {first && (
        <span
          className={styles.art}
          style={
            { '--mv-tile-art': `var(--fui-img-${rewardArt(first[0])})` } as React.CSSProperties
          }
          aria-hidden="true"
        />
      )}
      {first && first[1] > 1 && (
        <span className={styles.qty} aria-hidden="true">
          ×{first[1].toLocaleString()}
        </span>
      )}
      {state === 'claimed' && (
        <span className={styles.mark} data-mark="claimed" aria-hidden="true" />
      )}
      {state === 'barred' && (
        <span className={styles.mark} data-mark="barred" aria-hidden="true">
          <Icon name="nav-locked" size={18} />
        </span>
      )}
    </button>
  );
}
