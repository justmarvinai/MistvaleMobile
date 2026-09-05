import type { PlayerSummary } from '@mistvale/shared';
import { StatBar } from '@/fui/components/StatBar.ts';
import { Fui } from '@/fui/react';
import { BoostBadge } from '@/ui/BoostBadge/BoostBadge';
import { LevelDisc } from '@/ui/LevelDisc/LevelDisc';
import { Portrait } from '@/ui/Portrait/Portrait';
import { championArt } from '@/ui/championArt';
import { useContentStore } from '@/state/contentStore';
import { useRosterStore } from '@/state/rosterStore';
import { useTip } from '@/ui/Tooltip/useTooltip';
import { abbreviatePower, accountPower, levelReading, POWER_TEAM } from './chip';
import styles from './ProfileChip.module.scss';

/**
 * Who the player is, at the top of every screen.
 *
 * This replaced the library's own chip, which is a 38px disc and a name — right for a bar
 * that only has to say *whose* account this is, and much too small for what the owner
 * asked for (2026-08-21): a portrait you chose, framed, with the level on it, the name at
 * a size worth reading, the experience bar and what the account is worth.
 *
 * So the library keeps the chrome it is good at — the leather ground, the currency rail,
 * the tool buttons — and the chip is Mistvale's, because every part of it is state React
 * owns. That is the same division the rest of the game runs on.
 *
 * **The face is a champion you own**, chosen on your own profile card and stored as a
 * champion *key*, so it is drawn from the content bundle already in hand rather than
 * fetched. An account that has not chosen wears the Haven's crest, which is where every
 * account starts and a perfectly good place to stay — it was the account's initial in a
 * box until C41, which is a web page's answer to a missing avatar and not a game's.
 *
 * **The shape is the owner's second reference** (2026-08-27), and it moves three things:
 * the level is a *disc on the corner of the portrait* rather than a tag tucked under it,
 * the experience readout is a **percentage inside the bar** rather than two long figures
 * beside it, and the power is a line of its own — labelled, in its own colour — rather
 * than a chip crowding the name.
 *
 * The percentage is the interesting one. C5 put the numbers *outside* the bar for a good
 * reason and wrote it down: "a readout drawn inside a 14px track is two figures nobody can
 * read". Both halves of that were true, and both change here — the track is 26px now, and
 * a percentage is one short token rather than `124,491 / 124,491`. The exact figures did
 * not disappear; they moved to the tooltip, which is where a number you only want
 * occasionally belongs.
 */
export function ProfileChip({
  player,
  onOpenProfile,
}: {
  player: PlayerSummary;
  onOpenProfile: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const champions = useRosterStore((state) => state.champions);

  const def = player.avatarChampionKey
    ? bundle?.champions.find((champion) => champion.key === player.avatarChampionKey)
    : undefined;
  const art = def ? championArt(def, bundle?.assets) : null;
  const reading = levelReading(player);
  const power = accountPower(champions);

  const ref = useTip({
    title: player.profileName,
    subtitle: `Level ${player.level}`,
    stats: [
      reading.capped
        ? { label: 'Experience', value: 'At the cap', tone: 'good' as const }
        : { label: 'Experience', value: `${reading.have} / ${reading.need}`, tone: 'plain' },
      ...(reading.remaining !== null
        ? [
            {
              label: `To level ${player.level + 1}`,
              value: reading.remaining.toLocaleString('en-US'),
              tone: 'plain' as const,
            },
          ]
        : []),
      ...(power > 0
        ? [
            {
              label: 'Power',
              value: power.toLocaleString('en-US'),
              tone: 'magic' as const,
            },
          ]
        : []),
    ],
    ...(power > 0
      ? { flavor: `Your ${POWER_TEAM} strongest champions together — the team you could field.` }
      : {}),
    hint: 'Open your card',
  });

  return (
    /*
     * The badge is a **sibling** of the chip rather than a child of it, and that is not
     * cosmetic: the chip is a `<button>` carrying its own `aria-label`, which replaces
     * everything inside it for a screen reader — a badge nested there would be silently
     * swallowed, taking the boost's whole state with it. Outside, it keeps its own name
     * and its own tooltip, and neither has to fight the other for the hover.
     */
    <span className={styles.holder}>
      <button
        ref={ref}
        type="button"
        className={styles.chip}
        onClick={onOpenProfile}
        aria-label={`Your profile card — ${player.profileName}, level ${player.level}`}
      >
        <span className={styles.face} data-rarity={def?.rarity ?? 'none'}>
          {art ? (
            <Portrait src={art.portrait ?? null} name={def?.name} size={76} />
          ) : (
            // No champion chosen: the Haven's crest, the same mark the profile card's "no
            // portrait" option wears, so the two agree about what an account without a
            // face looks like. Painted art rather than an `<img>`, which is also what lets
            // a spec ask "is there a portrait yet" by counting images.
            <span className={styles.crest} aria-hidden="true" />
          )}
          <LevelDisc level={player.level} />
        </span>

        <span className={styles.body}>
          <span className={styles.name}>{player.profileName}</span>

          <span className={styles.progress}>
            <Fui
              of={StatBar}
              className={styles.xpBar}
              options={{
                kind: 'xp',
                value: reading.capped ? 1 : player.xp,
                max: reading.capped ? 1 : player.xpToNextLevel,
                // The library's own readout is the two figures; Mistvale draws a percentage
                // over the track instead, because that is what fits in a bar at this height
                // and the figures are a hover away.
                readout: 'none',
                width: '100%',
                trail: false,
              }}
              attrs={{ 'aria-label': 'Experience toward the next level' }}
              // Kept live rather than rebuilt: a bar reconstructed when the number changes
              // restarts its fill from empty, which is the one thing a progress bar must not
              // do at the moment it advances.
              apply={(bar, next) => {
                bar.setMax(next.max ?? 1);
                bar.set(next.value ?? 0);
              }}
            />
            {/* Over the track rather than inside the library's own readout slot: the bar is
              one painted piece of art and the pack positions its figures for a phone. */}
            <span className={styles.percent} aria-hidden="true">
              {reading.capped ? 'MAX' : `${reading.percent}%`}
            </span>
          </span>

          {power > 0 && (
            <span className={styles.power}>
              Power: <strong>{abbreviatePower(power)}</strong>
            </span>
          )}
        </span>
      </button>

      <BoostBadge boost={player.xpBoost} />
    </span>
  );
}
