import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChampionDetail, GearInstance, GearSetDef, GearSlot, Stat } from '@mistvale/shared';
import { GEAR_SLOTS } from '@mistvale/shared';
import { ArtifactSet } from '@/fui/components/ArtifactSet.ts';
import { SkillCard } from '@/fui/components/SkillCard.ts';
import { Slot } from '@/fui/components/Slot.ts';
import { Fui } from '@/fui/react';
import { relicArt, relicGlyph } from '../../ui/relicArt';
import { skillArt } from '../../ui/skillArt';
import { statLabel } from '../../ui/statLabels';
import { setEffect } from '../../ui/setEffect';
import { Button } from '../../ui/Button/Button';
import { gameApi, newActionId } from '../../api/game';
import { useContentStore } from '../../state/contentStore';
import { useInventoryStore, itemCount } from '../../state/inventoryStore';
import { usePlayerStore } from '../../state/playerStore';
import { useRosterStore } from '../../state/rosterStore';
import { FoodPicker } from './FoodPicker';
import { Ladders } from './Ladders';
import { MasteryTrees } from './MasteryTrees';
import { RelicPicker } from './RelicPicker';
import { LoadoutBar } from './LoadoutBar';
import { StatTable } from './StatTable';
import { Imprint } from './Imprint';
import styles from './ChampionDetail.module.scss';
import { Icon } from '../../ui/Icon/Icon';
import { ChampionIdle } from '../../ui/ChampionIdle/ChampionIdle';
import { useTip } from '../../ui/Tooltip/useTooltip';
import { emptySocketTip, relicTip } from '../../ui/Tooltip/tips';

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

/**
 * One champion, everything about it — as a *pane*, not a dialog.
 *
 * It was a full-screen modal opened by clicking a card in the roster grid. Since C19 the
 * roster is the genre's own three-pane screen — the roll on the left, the champion in the
 * middle and to the right — so this is rendered beside the list rather than over it, and
 * the first champion is simply selected when the screen opens.
 *
 * That is the whole change: the content, the four ladders, the nine sockets and the tabs
 * are what they were. What went is the `Modal` wrapper and the close button, because
 * there is nothing to close any more — choosing another champion is the way out.
 */
export function ChampionSheet({ championId }: { championId: string }): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const items = useInventoryStore((state) => state.items);
  // Every relic the account owns, not just this champion's: a loadout can name a piece
  // that is currently on somebody else, and the plan a row shows has to know that.
  const allGear = useInventoryStore((state) => state.gear);
  const refreshInventory = useInventoryStore((state) => state.refresh);
  const loadInventory = useInventoryStore((state) => state.load);
  const refreshRoster = useRosterStore((state) => state.load);
  const refreshPlayer = usePlayerStore((state) => state.refresh);
  const silver = usePlayerStore((state) => state.player?.silver ?? 0);

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

  // What the ladders cost is read against what is *held*, and nothing else in the app ever
  // loaded that list: the store is filled by the relic screens, so a player who came
  // straight from the Haven saw every material cost as "short the whole amount" — brews
  // they had just won included. Loaded here for the same reason `RelicPicker` loads it,
  // because this is the screen that spends them.
  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

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
      <section className={styles.sheet} aria-label="Champion">
        <p className={styles.note}>{error ?? 'Reading the roll…'}</p>
      </section>
    );
  }

  const { champion, stats } = detail;
  const wornBySlot = new Map(detail.gear.map((piece) => [piece.slot, piece]));

  const skills = (bundle?.skills ?? []).filter((skill) => def.skills.includes(skill.key));

  /**
   * Which sets the worn relics are working towards.
   *
   * Only sets with a piece on this champion appear: listing all sixteen would be a
   * catalogue rather than a status, and the catalogue lives in the vault.
   */
  /** How many pieces of each set are on, which both the bonus panel and each socket want. */
  const setCounts = (() => {
    const counts = new Map<string, number>();
    for (const relic of detail.gear) counts.set(relic.setKey, (counts.get(relic.setKey) ?? 0) + 1);
    return counts;
  })();

  const setProgress = (() => {
    const counts = setCounts;
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
    // Named for the champion it is about, which is how a spec asks for it and how a screen
    // reader announces the region a player has just changed by pressing a card in the roll.
    <section className={styles.sheet} aria-label={def.name}>
      <h2 className={styles.sheetName}>{def.name}</h2>
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
              <Ladders
                context={{
                  detail,
                  held: new Map(items.map((entry) => [entry.itemKey, entry.quantity])),
                  silver,
                  items: bundle?.items ?? [],
                }}
                busy={busy}
                onTake={(id) => {
                  if (id === 'level' || id === 'rank') return setPicking(id);
                  if (id === 'ascension') {
                    return void run('Ascended.', () => gameApi.ascend(championId, newActionId()));
                  }
                  return void run('Awakened.', () => gameApi.awaken(championId, newActionId()));
                }}
              />
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

              {/* The imprint ladder, beside the numbers it explains.
                  Drawn whenever the account has more than one copy — a single copy is every
                  champion's starting state and says nothing, but a *second* is the moment
                  this feature exists for, and the moment a player needs telling that the
                  duplicate they just pulled was not a waste. */}
              {detail.imprint.copies > 1 && <Imprint state={detail.imprint} />}

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
              <>
                {/* Saved sets sit above the sockets, because that is where a build *is* —
                    the nine pieces you are looking at when you decide somebody else should
                    be wearing them. */}
                <LoadoutBar
                  championId={championId}
                  ascension={champion.ascension}
                  gear={allGear}
                  busy={busy}
                  onApplied={(said) => {
                    setNotice(said);
                    void refreshInventory();
                    reload();
                  }}
                />
                <div className={styles.slots}>
                  {GEAR_SLOTS.map((slot) => {
                    const worn = wornBySlot.get(slot);
                    const slotDef = bundle?.gearSlots.find((entry) => entry.key === slot);
                    const locked = (slotDef?.ascensionRequired ?? 0) > champion.ascension;
                    const set = worn
                      ? bundle?.gearSets.find((entry) => entry.key === worn.setKey)
                      : undefined;
                    return (
                      <RelicSocket
                        key={slot}
                        slot={slot}
                        worn={worn}
                        set={set}
                        wearing={worn ? (setCounts.get(worn.setKey) ?? 0) : 0}
                        locked={locked}
                        lockedAt={slotDef?.ascensionRequired ?? 0}
                        disabled={locked || busy}
                        onOpen={() => setSlotPicking(slot)}
                      />
                    );
                  })}
                </div>
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
          onConfirm={async (ids, brews) => {
            setPicking(null);
            await run(picking === 'level' ? 'Experience granted.' : 'Rank raised.', () =>
              picking === 'level'
                ? gameApi.levelUp(championId, ids, brews, newActionId())
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
    </section>
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

/**
 * One of the nine relic slots on a champion.
 *
 * Its own component for two reasons that arrived together. A tooltip is a hook, and nine
 * of them cannot be called from inside a `map`. And the socket is the place the owner
 * found the game at its least legible: a painted icon, the slot's name and "+20 · +1",
 * with **no indication of rarity at all** — so a legendary weapon and a common one were
 * the same grey row, and the one fact that decides whether a piece is worth forging was
 * the one fact the sheet did not show.
 *
 * The rarity now colours the cell itself, not only the socket's own faint inner glow, and
 * the set's name sits under the slot in that colour — because the set is what a player
 * calls the piece and it is what the colour is *about*.
 */
function RelicSocket({
  slot,
  worn,
  set,
  wearing,
  locked,
  lockedAt,
  disabled,
  onOpen,
}: {
  slot: GearSlot;
  worn: GearInstance | undefined;
  set: GearSetDef | undefined;
  /** Pieces of this set already on the champion, for the tooltip's progress line. */
  wearing: number;
  locked: boolean;
  lockedAt: number;
  disabled: boolean;
  onOpen: () => void;
}): JSX.Element {
  const tip = worn
    ? relicTip(worn, { set, wearing, hint: 'Click to change it' })
    : emptySocketTip(slot, locked ? lockedAt : undefined);
  const ref = useTip(tip);
  const setName = set?.name ?? worn?.setKey ?? null;

  return (
    <button
      ref={ref}
      type="button"
      className={styles.slot}
      // The rarity is on the cell, where it can be seen, rather than only inside the
      // library's socket where it is a four-pixel glow behind a painted icon.
      data-rarity={worn?.rarity ?? undefined}
      data-filled={Boolean(worn)}
      disabled={disabled}
      onClick={onOpen}
    >
      {/* The socket is the slot's picture, not a second control — see the Haven's
          stations for the same reasoning. */}
      <Fui
        of={Slot}
        className={styles.slotSocket}
        options={{
          size: 'lg',
          locked,
          item: worn ? { icon: relicArt(slot), name: setName ?? slot, rarity: worn.rarity } : null,
          placeholder: relicGlyph(slot),
        }}
        attrs={{
          role: 'presentation',
          tabindex: undefined,
          'aria-label': undefined,
          title: undefined,
        }}
        // Options are construction-time. Without this the socket kept whatever it was
        // built holding: equip a relic and the slot stayed empty, take one off and it
        // stayed full, until the sheet was closed and re-opened. The numbers above it
        // were right the whole time, which is what made it read as the game losing the
        // change.
        apply={(socket, next) => socket.setItem(next.item ?? null)}
      />
      <span className={styles.slotName}>{SLOT_LABEL[slot]}</span>
      {worn ? (
        <>
          <span className={styles.slotSet}>{setName}</span>
          <span className={styles.slotMain}>
            {statLabel(worn.main.stat)} +{worn.main.value}
            {worn.main.percent ? '%' : ''} · +{worn.level}
          </span>
        </>
      ) : (
        <span className={styles.slotEmpty}>{locked ? 'Locked' : 'Empty'}</span>
      )}
    </button>
  );
}
