import { useEffect, useRef } from 'react';
import type { ValePassStanding, ValePassTierStanding, ValePassTrack } from '@mistvale/shared';
import { Icon } from '../../ui/Icon/Icon';
import { Rail } from '../../ui/Rail/Rail';
import { describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { rewardArt } from '../../ui/Rewards/art';
import styles from './PassLadder.module.scss';

/**
 * The season's two columns, as a rail of tiles (C43).
 *
 * The library's `RewardTrack` positions its nodes along one rail by the favour they sit at,
 * which is the right shape for six milestones and the wrong one for thirty: at 1080p the
 * shipped season put thirty 44px tiles into 1,300px, so every reward label overlapped the
 * next and the tier numbers were nine-pixel smears — the one screen in the game that was
 * simply unreadable. A season is a *ladder*, and a ladder is walked one rung at a time; so
 * each tier is a column you can read, the columns run off the side of the window, and the
 * rail is `ui/Rail` — dragged, wheeled, stepped with the arrows — with the next tier
 * brought into view when the screen opens.
 *
 * Both tracks share each column, which is what the two rails were trying to say and could
 * not: the free reward and the season's own reward at the same favour are one rung.
 *
 * Every state is the server's — `reached`, the two `claimed` flags and `premiumLocked` —
 * and the tile only decides how to draw it. A tile is a button only while it can be
 * pressed; the rest are disabled with their state in the accessible name.
 */
export function PassLadder({
  season,
  busy,
  onClaim,
}: {
  season: ValePassStanding;
  busy: boolean;
  onClaim: (track: ValePassTrack, tier: ValePassTierStanding) => void;
}): JSX.Element {
  const nameOf = useRewardName();
  const nextIndex = season.tiers.find((tier) => !tier.reached)?.index ?? null;
  const current = useRef<HTMLDivElement | null>(null);

  // The next rung is where the eye should land, and on a thirty-tier season it is usually
  // off the right-hand edge. `nearest` on the block axis so the page itself never moves.
  useEffect(() => {
    current.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [season.passKey, nextIndex]);

  return (
    <div className={styles.ladder}>
      <div className={styles.labels}>
        <span className={styles.corner}>Tier</span>
        <div className={styles.rowLabel}>
          <span className={styles.rowTitle}>Open to everybody</span>
          <span className={styles.rowSub}>
            {season.live ? `Until ${season.endsOn}` : `Closed on ${season.endsOn}`}
          </span>
        </div>
        <div className={styles.rowLabel} data-locked={!season.unlocked}>
          <span className={styles.rowTitle}>The season’s own track</span>
          <span className={styles.rowSub}>
            {season.unlocked
              ? 'Yours for this season'
              : `Not taken up — ${season.unlockCost.toLocaleString()} crystals`}
          </span>
        </div>
      </div>

      <Rail label="Season tiers" className={styles.rail}>
        {season.tiers.map((tier) => {
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
              <Tile
                track="free"
                tier={tier}
                rewards={tier.free}
                claimed={tier.freeClaimed}
                barred={false}
                busy={busy}
                nameOf={nameOf}
                onClaim={onClaim}
              />
              <Tile
                track="premium"
                tier={tier}
                rewards={tier.premium}
                claimed={tier.premiumClaimed}
                barred={tier.premiumLocked}
                busy={busy}
                nameOf={nameOf}
                onClaim={onClaim}
              />
            </div>
          );
        })}
      </Rail>
    </div>
  );
}

type TileState = 'empty' | 'locked' | 'barred' | 'ready' | 'claimed';

function stateOf(
  tier: ValePassTierStanding,
  rewards: Readonly<Record<string, number>>,
  claimed: boolean,
  barred: boolean,
): TileState {
  const paying = Object.values(rewards).some((amount) => amount > 0);
  if (!paying) return 'empty';
  if (claimed) return 'claimed';
  if (!tier.reached) return 'locked';
  if (barred) return 'barred';
  return 'ready';
}

const STATE_WORDS: Readonly<Record<TileState, string>> = Object.freeze({
  empty: 'nothing here',
  locked: 'not reached yet',
  barred: 'behind the season’s own track',
  ready: 'ready to collect',
  claimed: 'collected',
});

function Tile({
  track,
  tier,
  rewards,
  claimed,
  barred,
  busy,
  nameOf,
  onClaim,
}: {
  track: ValePassTrack;
  tier: ValePassTierStanding;
  rewards: Readonly<Record<string, number>>;
  claimed: boolean;
  barred: boolean;
  busy: boolean;
  nameOf: (key: string) => string;
  onClaim: (track: ValePassTrack, tier: ValePassTierStanding) => void;
}): JSX.Element {
  const state = stateOf(tier, rewards, claimed, barred);
  const first = Object.entries(rewards).find(([, amount]) => amount > 0);
  const words = describeRewards(rewards, nameOf);
  const label = `${track === 'free' ? 'Free' : 'Season'} tier ${tier.index + 1}: ${
    words || 'nothing'
  } — ${STATE_WORDS[state]}`;

  return (
    <button
      type="button"
      className={styles.tile}
      data-track={track}
      data-state={state}
      disabled={state !== 'ready' || busy}
      aria-label={label}
      title={words || undefined}
      onClick={() => onClaim(track, tier)}
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
