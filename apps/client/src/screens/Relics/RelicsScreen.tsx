import { useEffect, useMemo, useState } from 'react';
import type { GearInstance, GearSlot, Rarity } from '@mistvale/shared';
import { GEAR_MAX_LEVEL, GEAR_SLOTS, RARITIES, REFORGE_DUST_ITEM } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { gameApi, newActionId } from '../../api/game';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import { itemCount, useInventoryStore } from '../../state/inventoryStore';
import { usePlayerStore } from '../../state/playerStore';
import { RelicCard } from './RelicCard';
import { Forge } from './Forge';
import { Reforge } from './Reforge';
import styles from './RelicsScreen.module.scss';
import { highlightable } from '../../app/highlight';
import { Heading } from '@/ui/Heading/Heading';
import { ScreenInfo } from '../../ui/ScreenInfo/ScreenInfo';
import { VaultMeter } from '../../ui/VaultMeter/VaultMeter';

/**
 * The relic vault.
 *
 * Two jobs, and the screen is arranged around them: find the piece worth upgrading, and
 * clear out the ninety-five percent that is not. Selling is where the silver comes from,
 * so it is a first-class multi-select rather than something buried in a menu — with locks
 * as the guard rail, because one careless mass-sell is how players quit.
 */

type Filter = 'all' | 'unequipped' | GearSlot;

/**
 * The three axes a player actually sorts a hundred relics along.
 *
 * Slot was the only one the vault had, and it is the least useful of the three: nobody
 * looks for "a helm", they look for "the epics I have not forged" or "everything Ironroot".
 * Rarity and set are the two that turn a grid into a shortlist, and a shortlist is what the
 * bulk actions act on — which is the whole of the owner's request (2026-08-22): acting on a
 * *filter* rather than on a click per relic.
 */
interface Refine {
  rarity: Rarity | 'any';
  setKey: string | 'any';
  /** Only pieces nobody has spent silver on — the fodder-shaped question. */
  unforgedOnly: boolean;
}

const NO_REFINE: Refine = { rarity: 'any', setKey: 'any', unforgedOnly: false };

export function RelicsScreen(): JSX.Element {
  const gear = useInventoryStore((state) => state.gear);
  const loading = useInventoryStore((state) => state.loading);
  const load = useInventoryStore((state) => state.load);
  const refresh = useInventoryStore((state) => state.refresh);
  const setLocked = useInventoryStore((state) => state.setLocked);
  const items = useInventoryStore((state) => state.items);
  const vault = useInventoryStore((state) => state.vault);
  const buyVaultSlots = useInventoryStore((state) => state.buyVaultSlots);
  const bundle = useContentStore((state) => state.bundle);
  const roster = useRosterStore((state) => state.champions);

  /**
   * Who is wearing a relic, by name.
   *
   * The card used to say "Equipped by Worn" — the literal word, on every worn piece, which
   * is a sentence about nobody. The vault is the one screen where the answer is genuinely
   * useful: it is how a player finds the piece they meant to move.
   */
  const wornBy = useMemo(() => {
    const names = new Map(
      roster.map((champion) => [
        champion.id,
        bundle?.champions.find((def) => def.key === champion.championKey)?.name ??
          champion.championKey,
      ]),
    );
    return (championId: string | null): string | undefined =>
      championId ? names.get(championId) : undefined;
  }, [roster, bundle]);
  const refreshPlayer = usePlayerStore((state) => state.refresh);
  // The vault is always open; the forge is what account level 3 unlocks.
  const canForge = usePlayerStore((state) => state.unlocks?.relicUpgrading ?? false);

  const [filter, setFilter] = useState<Filter>('unequipped');
  const [refine, setRefine] = useState<Refine>(NO_REFINE);
  const [selection, setSelection] = useState<string[]>([]);
  const [forgeTo, setForgeTo] = useState(8);
  const [forging, setForging] = useState<GearInstance | null>(null);
  const [reforging, setReforging] = useState<GearInstance | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const list = gear.filter((piece) => {
      if (filter === 'unequipped' && piece.equippedChampionId !== null) return false;
      if (filter !== 'all' && filter !== 'unequipped' && piece.slot !== filter) return false;
      if (refine.rarity !== 'any' && piece.rarity !== refine.rarity) return false;
      if (refine.setKey !== 'any' && piece.setKey !== refine.setKey) return false;
      if (refine.unforgedOnly && piece.level > 0) return false;
      return true;
    });
    return [...list].sort(
      (a, b) => b.rank - a.rank || b.level - a.level || a.slot.localeCompare(b.slot),
    );
  }, [gear, filter, refine]);

  /** The sets the account actually holds, so the picker is not sixteen names of nothing. */
  const heldSets = useMemo(() => {
    const keys = new Set(gear.map((piece) => piece.setKey));
    return (bundle?.gearSets ?? [])
      .filter((set) => keys.has(set.key))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [gear, bundle]);

  const selected = useMemo(
    () => gear.filter((piece) => selection.includes(piece.id)),
    [gear, selection],
  );
  const sellTotal = selected.reduce((sum, piece) => sum + piece.sellValue, 0);
  const dustTotal = selected.reduce((sum, piece) => sum + piece.dismantleValue, 0);
  const dustHeld = itemCount(items, REFORGE_DUST_ITEM);
  const blocked = selected.filter((piece) => piece.locked || piece.equippedChampionId !== null);
  /** How many of the selection the forge would actually touch at the chosen level. */
  const forgeable = selected.filter((piece) => piece.level < forgeTo).length;

  const toggle = (id: string): void =>
    setSelection((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  /** Busy, notice and error handled once, so a second action does not grow a third copy. */
  const run = async (action: () => Promise<void>, said: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(said);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be done.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Grinds the selection down for Reliquary Dust instead of silver.
   *
   * The same selection and the same refusals as a sell, because it is the same decision
   * made differently: the vault has a ceiling, so relics *have* to go — this is the choice
   * of what they turn into. Silver buys vault slots and forge attempts; dust is the only
   * thing that fixes a line on a relic already worth keeping.
   */
  const dismantle = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await gameApi.dismantleGear(selection, newActionId());
      setSelection([]);
      await Promise.all([refresh(), refreshPlayer()]);
      setNotice(
        `Ground ${result.removed.length} down for ${result.dust.toLocaleString()} Reliquary Dust.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Those could not be dismantled.');
    } finally {
      setBusy(false);
    }
  };

  const sell = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await gameApi.sellGear(selection, newActionId());
      setSelection([]);
      await Promise.all([refresh(), refreshPlayer()]);
      setNotice(`Sold ${result.sold.length} for ${result.paid.toLocaleString()} silver.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Those could not be sold.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Everything currently on screen.
   *
   * The action the owner's list asked for: acting on a *filter* rather than on a click per
   * relic. It selects what the filters have narrowed to rather than everything owned, so
   * "select all" always means the thing the player is looking at.
   */
  const selectVisible = (): void => setSelection(visible.map((piece) => piece.id));

  /** Forges the selection toward a level. Equipped pieces are fine — this is not a sell. */
  const forgeSelection = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const ids = selected.filter((piece) => piece.level < forgeTo).map((piece) => piece.id);
      const result = await gameApi.upgradeMany(ids, forgeTo, newActionId());
      const climbed = result.entries.filter((entry) => entry.toLevel > entry.fromLevel).length;
      await Promise.all([refresh(), refreshPlayer()]);
      setNotice(
        `${climbed} of ${result.entries.length} climbed — ${result.silverSpent.toLocaleString()} silver.` +
          (result.stoppedBecause ? ` ${result.stoppedBecause}` : ''),
      );
      setSelection([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That forge run could not be made.');
    } finally {
      setBusy(false);
    }
  };

  /** Selects everything unlocked, unworn and below a rarity — the "clear the junk" action. */
  const selectFodder = (): void => {
    setSelection(
      gear
        .filter(
          (piece) =>
            !piece.locked &&
            piece.equippedChampionId === null &&
            piece.level === 0 &&
            (piece.rarity === 'common' || piece.rarity === 'uncommon'),
        )
        .map((piece) => piece.id),
    );
  };

  return (
    <div className={styles.screen}>
      <Heading
        tagline="What the vale gave up. Wear it, forge it, grind it down, or sell it on."
        actions={
          <ScreenInfo title="The Vault" label="About the vault">
            <p>
              Most relics are meant to be sold — that is where the silver for the forge comes from.
              Lock anything you mean to keep, and it cannot be sold by accident.
            </p>
            <p>
              A piece&rsquo;s slot is decided by the stage that dropped it, its main stat by the
              slot, and its substats by the roll. <strong>Forge</strong> levels a piece and rolls a
              new substat every four levels; the forge opens at account level 3.
            </p>
            <p>
              The vault holds a fixed number of pieces. When it is full, drops stop being kept — buy
              more room in silver, or sell what you were never going to wear.
            </p>
          </ScreenInfo>
        }
      >
        The Vault
      </Heading>

      <div className={styles.body}>
        {/* The vault's own numbers and the two actions that move them. This was a column
            down the right-hand side; a fifth of the screen is a lot to pay for a meter and
            two buttons, and the relics are what the screen is for.

            Labelled, because it is a real group rather than a row of unrelated controls —
            how full the vault is and the two things that change that. It also gives the
            screen a name to scope by, which the `<aside>` used to be: "In the vault" is the
            list's default *filter* as well, and an unscoped search finds both. */}
        <div className={styles.toolbar} role="group" aria-label="Vault capacity">
          {vault ? (
            <VaultMeter vault={vault} />
          ) : (
            <span className={styles.count}>{gear.length} relics</span>
          )}

          <span className={styles.count}>
            {gear.filter((piece) => piece.equippedChampionId).length} worn
          </span>

          {/* Dust has no home in the currency rail — it is a *material*, and the rail is for
              the three the whole game spends. But it is earned here and spent here, so the
              one screen that should always say how much of it you have is this one. */}
          <span className={styles.count}>{dustHeld.toLocaleString()} Reliquary Dust</span>

          <div className={styles.toolActions}>
            {vault &&
              (vault.nextSlots > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    void run(async () => {
                      await buyVaultSlots();
                      await refreshPlayer();
                    }, `Room for ${vault.nextSlots} more.`);
                  }}
                >
                  {`Buy ${vault.nextSlots} slots — ${vault.nextCost.toLocaleString()} silver`}
                </Button>
              ) : (
                <span className={styles.count}>Full size ({vault.max.toLocaleString()})</span>
              ))}

            <Button size="sm" variant="ghost" onClick={selectFodder}>
              Select unupgraded fodder
            </Button>
          </div>
        </div>

        {!canForge && <p className={styles.warn}>The forge opens at account level 3.</p>}
        {notice && <p className={styles.notice}>{notice}</p>}
        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.filters} role="group" aria-label="Filter relics">
          {(['unequipped', 'all'] as Filter[]).map((entry) => (
            <button
              key={entry}
              type="button"
              className={styles.filter}
              aria-pressed={filter === entry}
              onClick={() => setFilter(entry)}
            >
              {entry === 'unequipped' ? 'In the vault' : 'Everything'}
            </button>
          ))}
          {GEAR_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              className={styles.filter}
              aria-pressed={filter === slot}
              onClick={() => setFilter(slot)}
            >
              {bundle?.gearSlots.find((entry) => entry.key === slot)?.name ?? slot}
            </button>
          ))}
        </div>

        {/* Rarity and set, which are the two axes a hundred relics are actually sorted
            along — and the shortlist the bulk actions act on. */}
        <div className={styles.refine} role="group" aria-label="Narrow the list">
          <label className={styles.refineField}>
            <span className={styles.refineLabel}>Rarity</span>
            <select
              className={styles.select}
              value={refine.rarity}
              onChange={(event) =>
                setRefine((current) => ({
                  ...current,
                  rarity: event.target.value as Refine['rarity'],
                }))
              }
            >
              <option value="any">Any</option>
              {RARITIES.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity[0]!.toUpperCase() + rarity.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.refineField}>
            <span className={styles.refineLabel}>Set</span>
            <select
              className={styles.select}
              value={refine.setKey}
              onChange={(event) =>
                setRefine((current) => ({ ...current, setKey: event.target.value }))
              }
            >
              <option value="any">Any</option>
              {heldSets.map((set) => (
                <option key={set.key} value={set.key}>
                  {set.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.refineToggle}>
            <input
              type="checkbox"
              checked={refine.unforgedOnly}
              onChange={(event) =>
                setRefine((current) => ({ ...current, unforgedOnly: event.target.checked }))
              }
            />
            <span>Unforged only</span>
          </label>

          <span className={styles.refineCount}>
            {visible.length} of {gear.length}
          </span>

          <Button size="sm" variant="ghost" disabled={visible.length === 0} onClick={selectVisible}>
            Select these {visible.length}
          </Button>
          {(refine.rarity !== 'any' || refine.setKey !== 'any' || refine.unforgedOnly) && (
            <Button size="sm" variant="ghost" onClick={() => setRefine(NO_REFINE)}>
              Reset
            </Button>
          )}
        </div>

        {loading && gear.length === 0 ? (
          <p className={styles.empty}>Opening the vault…</p>
        ) : visible.length === 0 ? (
          <p className={styles.empty}>
            {gear.length === 0
              ? 'No relics yet. They drop from campaign stages — the stage number decides the slot.'
              : 'Nothing in that slot.'}
          </p>
        ) : (
          <div className={styles.grid} {...highlightable('panel:relic-list')}>
            {visible.map((piece) => (
              <div key={piece.id} className={styles.entry}>
                <RelicCard
                  relic={piece}
                  {...(wornBy(piece.equippedChampionId)
                    ? { wornBy: wornBy(piece.equippedChampionId)! }
                    : {})}
                  selected={selection.includes(piece.id)}
                  onSelect={() => toggle(piece.id)}
                />
                <div className={styles.entryActions}>
                  <button
                    type="button"
                    className={styles.mini}
                    onClick={() => setForging(piece)}
                    disabled={piece.level >= 16 || !canForge}
                    title={canForge ? undefined : 'The forge opens at account level 3'}
                  >
                    {piece.level >= 16 ? 'Maxed' : 'Forge'}
                  </button>
                  <button
                    type="button"
                    className={styles.mini}
                    onClick={() => setReforging(piece)}
                    disabled={piece.substats.length === 0 || !canForge}
                    title={
                      canForge
                        ? piece.substats.length === 0
                          ? 'No substats to reforge'
                          : undefined
                        : 'The forge opens at account level 3'
                    }
                  >
                    Reforge
                  </button>
                  <button
                    type="button"
                    className={styles.mini}
                    aria-pressed={piece.locked}
                    onClick={() => void setLocked(piece.id, !piece.locked)}
                  >
                    {piece.locked ? 'Unlock' : 'Lock'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selection.length > 0 && (
        // A bar across the foot of the screen, where every game in the genre puts a
        // multi-select: it appears with the selection, it says what the selection is worth,
        // and it is the same width as the grid it is talking about.
        <Panel variant="hero" className={styles.sellBar}>
          <div className={styles.sellBody}>
            <div className={styles.sellWhat}>
              <span className={styles.sellCount}>{selection.length} selected</span>
              {/* Both prices, side by side, because the decision is between them and a
                  player should never have to press one to find out what the other was. */}
              <span className={styles.sellValue}>{sellTotal.toLocaleString()} silver</span>
              <span className={styles.dustValue}>{dustTotal.toLocaleString()} dust</span>
            </div>
            {blocked.length > 0 && (
              <p className={styles.warn}>
                {blocked.length} of those are locked or worn. Selling will be refused until you
                deselect them.
              </p>
            )}
            {/* Two things to do with a selection, and they want different guards. Selling
                refuses locked and worn pieces; forging welcomes a worn piece, because a
                worn piece is exactly the one worth forging. */}
            <div className={styles.sellActions}>
              <label className={styles.forgeTo}>
                <span className={styles.refineLabel}>Forge to</span>
                <select
                  className={styles.select}
                  value={forgeTo}
                  onChange={(event) => setForgeTo(Number(event.target.value))}
                >
                  {[4, 8, 12, GEAR_MAX_LEVEL].map((level) => (
                    <option key={level} value={level}>
                      +{level}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="ghost"
                disabled={busy || !canForge || forgeable === 0}
                onClick={() => void forgeSelection()}
              >
                {forgeable === 0 ? 'All at that level' : `Forge ${forgeable}`}
              </Button>
              <Button variant="ghost" onClick={() => setSelection([])}>
                Clear
              </Button>
              <Button
                variant="ghost"
                disabled={busy || blocked.length > 0}
                onClick={() => void dismantle()}
              >
                Dismantle
              </Button>
              <Button disabled={busy || blocked.length > 0} onClick={() => void sell()}>
                Sell
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {reforging && (
        <Reforge
          relic={reforging}
          onClose={() => setReforging(null)}
          onChanged={async () => {
            await Promise.all([refresh(), refreshPlayer()]);
          }}
        />
      )}

      {forging && (
        <Forge
          relic={forging}
          onClose={() => setForging(null)}
          onChanged={async () => {
            await Promise.all([refresh(), refreshPlayer()]);
          }}
        />
      )}
    </div>
  );
}
