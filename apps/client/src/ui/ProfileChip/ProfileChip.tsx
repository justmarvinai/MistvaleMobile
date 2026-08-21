import type { PlayerSummary } from '@mistvale/shared';
import { StatBar } from '@/fui/components/StatBar.ts';
import { Fui } from '@/fui/react';
import { Icon } from '@/ui/Icon/Icon';
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
 * fetched. An account that has not chosen wears the crest with its initial on it, which is
 * where every account starts and a perfectly good place to stay.
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
    <button
      ref={ref}
      type="button"
      className={styles.chip}
      onClick={onOpenProfile}
      aria-label={`Your profile card — ${player.profileName}, level ${player.level}`}
    >
      <span className={styles.face} data-rarity={def?.rarity ?? 'none'}>
        {art ? (
          <Portrait src={art.portrait ?? null} name={def?.name} size={54} />
        ) : (
          // No champion chosen: the account's own initial, which is what the top bar has
          // drawn since P0 and is still the honest answer for somebody who likes it.
          <span className={styles.initial} aria-hidden="true">
            {player.profileName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className={styles.level}>{player.level}</span>
      </span>

      <span className={styles.body}>
        <span className={styles.nameRow}>
          <span className={styles.name}>{player.profileName}</span>
          {power > 0 && (
            <span className={styles.power}>
              <Icon name="stat-atk" size={13} />
              {abbreviatePower(power)}
            </span>
          )}
        </span>

        <span className={styles.progress}>
          <Fui
            of={StatBar}
            className={styles.xpBar}
            options={{
              kind: 'xp',
              value: reading.capped ? 1 : player.xp,
              max: reading.capped ? 1 : player.xpToNextLevel,
              // Both numbers are beside the bar where they have room; a readout drawn
              // *inside* a 14px track is two figures nobody can read.
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
          <span className={styles.numbers}>
            {reading.capped ? (
              'Level cap'
            ) : (
              <>
                {reading.have} / {reading.need}
                <span className={styles.remaining}>
                  {' '}
                  · {(reading.remaining ?? 0).toLocaleString('en-US')} to Lv {player.level + 1}
                </span>
              </>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}
