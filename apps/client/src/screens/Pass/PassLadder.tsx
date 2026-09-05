import { useMemo } from 'react';
import type { ValePassStanding, ValePassTierStanding, ValePassTrack } from '@mistvale/shared';
import { Ladder, type LadderRow, type LadderTier } from '../../ui/Ladder/Ladder';

/**
 * The season on the shared `Ladder` (C43; the ladder itself moved to `ui/Ladder` in C44 so
 * the events screen draws its milestones the same way). Two rows — the free column and the
 * season's own — and one tier per rung, with every state the server's own flag.
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
  const rows = useMemo<LadderRow[]>(
    () => [
      {
        key: 'free',
        title: 'Open to everybody',
        subtitle: season.live ? `Until ${season.endsOn}` : `Closed on ${season.endsOn}`,
      },
      {
        key: 'premium',
        title: 'The season’s own track',
        subtitle: season.unlocked
          ? 'Yours for this season'
          : `Not taken up — ${season.unlockCost.toLocaleString()} crystals`,
        locked: !season.unlocked,
      },
    ],
    [season.live, season.endsOn, season.unlocked, season.unlockCost],
  );

  const tiers = useMemo<LadderTier[]>(
    () =>
      season.tiers.map((tier) => ({
        index: tier.index,
        points: tier.points,
        reached: tier.reached,
        tiles: [
          { rewards: tier.free, claimed: tier.freeClaimed, barred: false },
          { rewards: tier.premium, claimed: tier.premiumClaimed, barred: tier.premiumLocked },
        ],
      })),
    [season.tiers],
  );

  return (
    <Ladder
      rows={rows}
      tiers={tiers}
      scrollKey={season.passKey}
      busy={busy}
      label="Season tiers"
      onClaim={(rowKey, tier) => {
        const standing = season.tiers.find((entry) => entry.index === tier.index);
        if (standing) onClaim(rowKey as ValePassTrack, standing);
      }}
    />
  );
}
