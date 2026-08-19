import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChampionDetail, GearSetDef, GearSlot, Stat } from '@mistvale/shared';
import { GEAR_SLOTS } from '@mistvale/shared';
import { ArtifactSet } from '@/fui/components/ArtifactSet.ts';
import { SkillCard } from '@/fui/components/SkillCard.ts';
import { Slot } from '@/fui/components/Slot.ts';
import { Fui } from '@/fui/react';
import { relicArt, relicGlyph } from '../../ui/relicArt';
import { skillArt } from '../../ui/skillArt';
import { statLabel } from '../../ui/statLabels';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { gameApi, newActionId } from '../../api/game';
import { useContentStore } from '../../state/contentStore';
import { useInventoryStore, itemCount } from '../../state/inventoryStore';
import { usePlayerStore } from '../../state/playerStore';
import { useRosterStore } from '../../state/rosterStore';
import { FoodPicker } from './FoodPicker';
import { MasteryTrees } from './MasteryTrees';
import { RelicPicker } from './RelicPicker';
import { StatTable } from './StatTable';
import styles from './ChampionDetail.module.scss';
import { highlightable } from '../../app/highlight';
import { Icon } from '../../ui/Icon/Icon';

/** A set's bonus as one readable line — the same numbers the engine applies. */
function setEffect(set: GearSetDef): string {
  const { stat, pct, flat, chance, turns } = set.bonus;
  const magnitude = pct != null ? `+${pct}%` : flat != null ? `+${flat}` : '';
  const target = stat ? statLabel(stat) : '';
  const odds = chance != null ? ` (${Math.round(chance * 100)}% chance)` : '';
  const duration = turns != null ? ` for ${turns} turns` : '';
  const head = [target, magnitude].filter(Boolean).join(' ');
  return `${head || set.bonusType}${duration}${odds}`.trim();
}

/**
 * One champion, everything about it.
 *
 * Four ladders and nine relic slots on one screen, which is a lot — so the layout puts
 * the two things a player came for at the top (what it is worth now, what it is wearing)
 * and the spends below. Every cost shown here came from the server with the champion;
 * nothing on this screen is calculated locally.
 */

type Tab = 'gear' | 'skills' | 'masteries' | 'lore';

const SLOT_LABEL: Record<GearSlot, string> = {
  weapon: 'Weapon',
  helm: 'Helm',
  shield: 'Shield',
  gauntlets: 'Gauntlets',
  cuirass: 'Cuirass',
  boots: 'Boots',
  ring: 'Ring',
  amulet: 'Amulet',
  banner: 'Banner',
};

export function ChampionDetailModal({
  championId,
  onClose,
}: {
  championId: string;
  onClose: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const items = useInventoryStore((state) => state.items);
  const refreshInventory = useInventoryStore((state) => state.refresh);
  const refreshRoster = useRosterStore((state) => state.load);
  const refreshPlayer = usePlayerStore((state) => state.refresh);

  const [detail, setDetail] = useState<ChampionDetail | null>(null);
  const [tab, setTab] = useState<Tab>('gear');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState<'level' | 'rank' | null>(null);
  const [slotPicking, setSlotPicking] = useState<GearSlot | null>(null);

  // Bumped after every spend to re-read the champion. A counter rather than a callback
  // so the fetch lives in one effect with one cancellation guard — a response that lands
  // after the modal moved on must not overwrite what is on screen.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    gameApi
      .champion(championId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'That champion could not be loaded.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [championId, reloadToken]);

  const def = useMemo(
    () => bundle?.champions.find((entry) => entry.key === detail?.champion.championKey),
    [bundle, detail],
  );

  /** Runs a spend, then re-reads everything it could have moved. */
  const run = async (label: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await Promise.all([refreshInventory(), refreshRoster(), refreshPlayer()]);
      reload();
      setNotice(label);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  if (!detail || !def) {
    return (
      <Modal open title="Champion" onClose={onClose}>
        <p className={styles.note}>{error ?? 'Reading the roll…'}</p>
      </Modal>
    );
  }

  const { champion, stats, costs } = detail;
  const wornBySlot = new Map(detail.gear.map((piece) => [piece.slot, piece]));
  const ascendCost = costs.ascend?.items ?? {};
  const canAffordAscend =
    costs.ascend?.allowedByRank === true &&
    Object.entries(ascendCost).every(([key, amount]) => itemCount(items, key) >= amount);

  const skills = (bundle?.skills ?? []).filter((skill) => def.skills.includes(skill.key));

  /**
   * Which sets the worn relics are working towards.
   *
   * Only sets with a piece on this champion appear: listing all sixteen would be a
   * catalogue rather than a status, and the catalogue lives in the vault.
   */
  const setProgress = (() => {
    const counts = new Map<string, number>();
    for (const relic of detail.gear) counts.set(relic.setKey, (counts.get(relic.setKey) ?? 0) + 1);
    const active = new Map(stats.setBonuses.map((bonus) => [bonus.setKey, bonus]));
    return [...counts.entries()]
      .flatMap(([key, have]) => {
        const set = bundle?.gearSets.find((entry) => entry.key === key);
        if (!set) return [];
        // A set that is *paying* says so in the server's own words, because bonuses stack
        // in complete copies — six pieces of a two-piece set is the bonus three times, and
        // no client-side count is allowed to claim otherwise. A set that is not yet paying
        // says what it *would* pay, which is the only reason to list it at all.
        const paying = active.get(key);
        return [
          {
            name: set.name,
            need: set.pieces as number,
            have,
            effect: paying ? paying.description : setEffect(set),
          },
        ];
      })
      .sort((a, b) => b.have / b.need - a.have / a.need);
  })();
  // The heaviest active this champion actually has, so a three-skill champion's a3 gets
  // the gold and a four-skill champion's a4 does.
  const ultimateSlot = skills
    .filter((skill) => skill.slot !== 'passive')
    .map((skill) => skill.slot)
    .sort()
    .at(-1);
  const tomeKey =
    def.rarity === 'legendary'
      ? 'tome_legendary'
      : def.rarity === 'epic'
        ? 'tome_epic'
        : 'tome_rare';

  return (
    // Four ladders, nine relic slots and a stat table with four columns need the room;
    // the default 480 is for a confirmation, not for a champion sheet.
    <Modal open title={def.name} onClose={onClose} width={736}>
      <div className={styles.body}>
        <header className={styles.head}>
          <div>
            <div className={styles.title}>{def.title}</div>
            <div className={styles.tier}>
              {'★'.repeat(champion.rank)}
              {'☆'.repeat(6 - champion.rank)} · Level {champion.level}/{champion.levelCap}
              {champion.ascension > 0 && ` · Ascension ${champion.ascension}`}
            </div>
          </div>
          <div className={styles.power}>
            <span className={styles.powerValue}>{stats.power.toLocaleString()}</span>
            <span className={styles.powerLabel}>Power</span>
          </div>
        </header>

        <div className={styles.flags}>
          <button
            type="button"
            className={styles.flag}
            aria-pressed={champion.locked}
            disabled={busy}
            onClick={() =>
              void run(champion.locked ? 'Unlocked.' : 'Locked.', () =>
                gameApi.setChampionFlags(championId, { locked: !champion.locked }),
              )
            }
          >
            <Icon name="nav-locked" size={12} /> {champion.locked ? 'Locked' : 'Lock'}
          </button>
          <button
            type="button"
            className={styles.flag}
            aria-pressed={champion.favourite}
            disabled={busy}
            onClick={() =>
              void run(champion.favourite ? 'Unfavourited.' : 'Favourited.', () =>
                gameApi.setChampionFlags(championId, { favourite: !champion.favourite }),
              )
            }
          >
            ✦ {champion.favourite ? 'Favourite' : 'Mark favourite'}
          </button>
        </div>

        <StatTable stats={stats} />

        <div className={styles.tabs} role="tablist">
          {(['gear', 'skills', 'masteries', 'lore'] as Tab[]).map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={tab === entry}
              className={styles.tab}
              onClick={() => setTab(entry)}
            >
              {entry === 'gear'
                ? 'Relics'
                : entry === 'skills'
                  ? 'Skills'
                  : entry === 'masteries'
                    ? 'Masteries'
                    : 'Lore'}
            </button>
          ))}
        </div>

        {tab === 'masteries' && (
          <MasteryTrees
            detail={detail}
            busy={busy}
            onLearn={(nodeKey) =>
              void run('Mastery learned.', () =>
                gameApi.learnMastery(championId, nodeKey, newActionId()),
              )
            }
            onReset={() =>
              void run('Masteries forgotten.', () =>
                gameApi.resetMasteries(championId, newActionId()),
              )
            }
          />
        )}

        {tab === 'gear' && (
          <>
            <div className={styles.slots}>
              {GEAR_SLOTS.map((slot) => {
                const worn = wornBySlot.get(slot);
                const slotDef = bundle?.gearSlots.find((entry) => entry.key === slot);
                const locked = (slotDef?.ascensionRequired ?? 0) > champion.ascension;
                const setName = worn
                  ? (bundle?.gearSets.find((entry) => entry.key === worn.setKey)?.name ??
                    worn.setKey)
                  : null;
                return (
                  <button
                    key={slot}
                    type="button"
                    className={styles.slot}
                    disabled={locked || busy}
                    onClick={() => setSlotPicking(slot)}
                    title={
                      locked
                        ? `Needs ascension ${slotDef?.ascensionRequired}`
                        : worn
                          ? `${setName} · +${worn.level}`
                          : `Empty ${SLOT_LABEL[slot]}`
                    }
                  >
                    {/* The socket is the slot's picture, not a second control — see the
                        Haven's stations for the same reasoning. */}
                    <Fui
                      of={Slot}
                      className={styles.slotSocket}
                      options={{
                        size: 'lg',
                        locked,
                        item: worn
                          ? {
                              icon: relicArt(slot),
                              name: setName ?? slot,
                              rarity: worn.rarity,
                            }
                          : null,
                        placeholder: relicGlyph(slot),
                      }}
                      attrs={{
                        role: 'presentation',
                        tabindex: undefined,
                        'aria-label': undefined,
                        title: undefined,
                      }}
                    />
                    <span className={styles.slotName}>{SLOT_LABEL[slot]}</span>
                    {worn ? (
                      <span className={styles.slotMain}>
                        {statLabel(worn.main.stat)} +{worn.main.value}
                        {worn.main.percent ? '%' : ''} · +{worn.level}
                      </span>
                    ) : (
                      <span className={styles.slotEmpty}>{locked ? 'Locked' : 'Empty'}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* What the pieces add up to — which is the whole reason relic *sets* exist and
                the one thing this sheet never said. Counted from what is worn, with the
                incomplete ones greyed, so a player can see they are one boot from a
                bonus rather than working it out. */}
            {setProgress.length > 0 && (
              <Fui
                of={ArtifactSet}
                className={styles.setBonuses}
                options={{ title: 'Set bonuses', slots: [], bonuses: setProgress }}
              />
            )}
          </>
        )}

        {tab === 'skills' && (
          <ul className={styles.skills}>
            {skills.map((skill) => {
              const level = detail.skillUpgrades[skill.key] ?? 0;
              const maxed = level >= 5;
              const haveTome = itemCount(items, tomeKey) > 0;
              return (
                <li key={skill.key} className={styles.skill}>
                  {/* Painted by the library since the design rework: the art, the frame,
                      the cooldown ring and the level track are `SkillCard`. The upgrade
                      button stays Mistvale's — it spends a tome, which is a transaction
                      the server settles and the library has no notion of. */}
                  <Fui
                    of={SkillCard}
                    className={styles.skillCard}
                    options={{
                      name: skill.name,
                      art: skillArt(skill.key),
                      description: skill.description,
                      ...(skill.cooldown ? { cooldown: skill.cooldown } : {}),
                      level: level + 1,
                      maxLevel: 6,
                      passive: skill.slot === 'passive',
                      // The gold treatment goes to the champion's *last* active slot,
                      // which is the ultimate by construction — a1 is always the basic
                      // and a champion with four actives keeps its heaviest at a4.
                      ultimate: skill.slot === ultimateSlot,
                    }}
                  />
                  {skill.slot !== 'passive' && (
                    <Button
                      variant="ghost"
                      disabled={busy || maxed || !haveTome}
                      onClick={() =>
                        void run('Skill improved.', () =>
                          gameApi.upgradeSkill(championId, {
                            skillKey: skill.key,
                            source: { kind: 'tome' },
                            actionId: newActionId(),
                          }),
                        )
                      }
                    >
                      {maxed ? 'Maxed' : haveTome ? 'Use tome' : 'No tome'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {tab === 'lore' && <p className={styles.lore}>{def.lore || 'Nothing is written down.'}</p>}

        <div className={styles.ladders}>
          <Button
            {...highlightable('button:champion-level')}
            variant="secondary"
            disabled={busy || champion.level >= champion.levelCap}
            onClick={() => setPicking('level')}
          >
            {champion.level >= champion.levelCap ? 'At level cap' : 'Feed for experience'}
          </Button>

          <Button
            variant="secondary"
            disabled={busy || !costs.rankUp || !costs.rankUp.atLevelCap}
            onClick={() => setPicking('rank')}
            title={
              costs.rankUp
                ? `${costs.rankUp.foodCount} × ★${costs.rankUp.foodRank} champions + ${costs.rankUp.silver.toLocaleString()} silver`
                : 'Already ★6'
            }
          >
            {costs.rankUp ? `Rank up to ★${champion.rank + 1}` : 'Fully ranked'}
          </Button>

          <Button
            variant="secondary"
            disabled={busy || !canAffordAscend}
            title={
              costs.ascend?.allowedByRank === false
                ? 'Rank this champion up first'
                : Object.entries(ascendCost)
                    .map(([key, amount]) => `${amount} × ${key} (have ${itemCount(items, key)})`)
                    .join(' · ')
            }
            onClick={() => void run('Ascended.', () => gameApi.ascend(championId, newActionId()))}
          >
            {costs.ascend ? `Ascend to ${champion.ascension + 1}` : 'Fully ascended'}
          </Button>
        </div>

        {notice && <p className={styles.notice}>{notice}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>

      {picking && (
        <FoodPicker
          mode={picking}
          champion={detail}
          onClose={() => setPicking(null)}
          onConfirm={async (ids) => {
            setPicking(null);
            await run(picking === 'level' ? 'Experience granted.' : 'Rank raised.', () =>
              picking === 'level'
                ? gameApi.levelUp(championId, ids, newActionId())
                : gameApi.rankUp(championId, ids, newActionId()),
            );
          }}
        />
      )}

      {slotPicking && (
        <RelicPicker
          slot={slotPicking}
          championId={championId}
          worn={wornBySlot.get(slotPicking) ?? null}
          onClose={() => setSlotPicking(null)}
          onChanged={async () => {
            setSlotPicking(null);
            await run('Relics changed.', async () => undefined);
          }}
        />
      )}
    </Modal>
  );
}

/** Stat keys in the order the design doc lists them. */
export const STAT_ORDER: readonly Stat[] = [
  'hp',
  'atk',
  'def',
  'spd',
  'critRate',
  'critDmg',
  'res',
  'acc',
];
