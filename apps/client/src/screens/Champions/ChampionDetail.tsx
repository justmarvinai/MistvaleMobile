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
import { ChampionIdle } from '../../ui/ChampionIdle/ChampionIdle';

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
      <Modal open title="Champion" onClose={onClose} size="info">
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

  // Where this champion's sprites live. The same lookup the battlefield does — content
  // points a champion at an `asset`, and the asset knows its folder.
  const artPath =
    (bundle?.assets ?? []).find((asset) => asset.key === def.assetKey)?.basePath ??
    'enemies/teritorial_lizard';

  return (
    // Four ladders, nine relic slots, a four-column stat table *and* the champion standing
    // beside all of it. 736 was already tight for the numbers alone — every row wrapped and
    // the sheet read as a column of squeezed fragments — and the owner asked for the room.
    // Capped against the viewport by the modal itself, so a small laptop gets what it has.
    <Modal open title={def.name} onClose={onClose} size="full">
      <div className={styles.body}>
        {/* Two columns: who they are on the left, everything you can do to them on the
            right. The split is the genre's own — this is the shape the reference game uses
            and the reason its sheet reads at a glance — and it is what the width bought. */}
        <div className={styles.layout}>
          <aside className={styles.portrait}>
            <ChampionIdle art={artPath} className={styles.idle} alt="" />
            <div className={styles.portraitFacts}>
              <div className={styles.title}>{def.title}</div>
              <div className={styles.tier}>
                {'★'.repeat(champion.rank)}
                {'☆'.repeat(6 - champion.rank)}
              </div>
              <div className={styles.levelLine}>
                Level {champion.level}/{champion.levelCap}
                {champion.ascension > 0 && ` · Ascension ${champion.ascension}`}
              </div>
              <div className={styles.power}>
                <span className={styles.powerValue}>{stats.power.toLocaleString()}</span>
                <span className={styles.powerLabel}>Power</span>
              </div>
            </div>

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

            {/* The three ladders, beside the champion they raise rather than under a relic
                grid the player has to scroll past to reach them. They are what this sheet is
                *for* — everything in the right column is inspection, these are the actions —
                and the column is sticky, so they are in view the whole way down. */}
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
                        .map(
                          ([key, amount]) => `${amount} × ${key} (have ${itemCount(items, key)})`,
                        )
                        .join(' · ')
                }
                onClick={() =>
                  void run('Ascended.', () => gameApi.ascend(championId, newActionId()))
                }
              >
                {costs.ascend ? `Ascend to ${champion.ascension + 1}` : 'Fully ascended'}
              </Button>
            </div>

            {/* Beside the buttons that raise them. They used to sit at the very bottom of the
                right column, so "Experience granted." appeared a relic grid away from the
                press that earned it. */}
            {notice && <p className={styles.notice}>{notice}</p>}
            {error && <p className={styles.error}>{error}</p>}
          </aside>

          <div className={styles.main}>
            {/* Numbers and set bonuses in one row, above the tabs.

                The stat table alone at this width was five columns of figures spread across
                1,200px with the eye travelling a hand's breadth from "SPD" to its total —
                wider is not always more readable. And the set bonuses were inside the Relics
                tab, which made them look like a property of that tab rather than of the
                champion: what a player's relics add up to is exactly as true while they are
                reading skills. */}
            <div className={styles.summary}>
              <StatTable stats={stats} />

              {/* What the pieces add up to — the whole reason relic *sets* exist, and the one
                  thing this sheet never said. Counted from what is worn, with the incomplete
                  ones greyed, so a player can see they are one boot from a bonus rather than
                  working it out.

                  Drawn even when there is nothing to count, because a champion wearing
                  nothing is exactly who needs telling that matching relics do something. */}
              {setProgress.length > 0 ? (
                <Fui
                  // Construction-time like the artifact card, and this one moves every time a
                  // relic goes on or comes off — which is precisely when a player is looking
                  // at it. Keyed on the progress it draws.
                  key={setProgress
                    .map((bonus) => `${bonus.name}${bonus.have}/${bonus.need}`)
                    .join('|')}
                  of={ArtifactSet}
                  className={styles.setBonuses}
                  options={{ title: 'Set bonuses', slots: [], bonuses: setProgress }}
                />
              ) : (
                <div className={styles.noSets}>
                  <h3 className={styles.noSetsHeading}>Set bonuses</h3>
                  <p>
                    None yet. Relics of the same set worn together grant a bonus on top of their own
                    numbers — two pieces for most sets, four for the heavier ones.
                  </p>
                </div>
              )}
            </div>

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
                        // Options are construction-time. Without this the socket kept
                        // whatever it was built holding: equip a relic and the slot stayed
                        // empty, take one off and it stayed full, until the sheet was closed
                        // and re-opened. The numbers above it were right the whole time,
                        // which is what made it read as the game losing the change.
                        apply={(socket, next) => socket.setItem(next.item ?? null)}
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

            {tab === 'lore' && (
              <p className={styles.lore}>{def.lore || 'Nothing is written down.'}</p>
            )}
          </div>
        </div>
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
