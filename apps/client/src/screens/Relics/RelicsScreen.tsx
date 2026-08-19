import { useEffect, useMemo, useState } from 'react';
import type { GearInstance, GearSlot } from '@mistvale/shared';
import { GEAR_SLOTS } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { gameApi, newActionId } from '../../api/game';
import { useContentStore } from '../../state/contentStore';
import { useInventoryStore } from '../../state/inventoryStore';
import { usePlayerStore } from '../../state/playerStore';
import { RelicCard } from './RelicCard';
import { Forge } from './Forge';
import styles from './RelicsScreen.module.scss';
import { highlightable } from '../../app/highlight';
import { Heading } from '@/ui/Heading/Heading';

/**
 * The relic vault.
 *
 * Two jobs, and the screen is arranged around them: find the piece worth upgrading, and
 * clear out the ninety-five percent that is not. Selling is where the silver comes from,
 * so it is a first-class multi-select rather than something buried in a menu — with locks
 * as the guard rail, because one careless mass-sell is how players quit.
 */

type Filter = 'all' | 'unequipped' | GearSlot;

export function RelicsScreen(): JSX.Element {
  const gear = useInventoryStore((state) => state.gear);
  const loading = useInventoryStore((state) => state.loading);
  const load = useInventoryStore((state) => state.load);
  const refresh = useInventoryStore((state) => state.refresh);
  const setLocked = useInventoryStore((state) => state.setLocked);
  const vault = useInventoryStore((state) => state.vault);
  const buyVaultSlots = useInventoryStore((state) => state.buyVaultSlots);
  const bundle = useContentStore((state) => state.bundle);
  const refreshPlayer = usePlayerStore((state) => state.refresh);
  // The vault is always open; the forge is what account level 3 unlocks.
  const canForge = usePlayerStore((state) => state.unlocks?.relicUpgrading ?? false);

  const [filter, setFilter] = useState<Filter>('unequipped');
  const [selection, setSelection] = useState<string[]>([]);
  const [forging, setForging] = useState<GearInstance | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const list = gear.filter((piece) => {
      if (filter === 'all') return true;
      if (filter === 'unequipped') return piece.equippedChampionId === null;
      return piece.slot === filter;
    });
    return [...list].sort(
      (a, b) => b.rank - a.rank || b.level - a.level || a.slot.localeCompare(b.slot),
    );
  }, [gear, filter]);

  const selected = useMemo(
    () => gear.filter((piece) => selection.includes(piece.id)),
    [gear, selection],
  );
  const sellTotal = selected.reduce((sum, piece) => sum + piece.sellValue, 0);
  const blocked = selected.filter((piece) => piece.locked || piece.equippedChampionId !== null);

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
      <Heading tagline="What the vale gave up. Wear it, feed it to something better, or sell it on.">
        The Vault
      </Heading>

      <div>
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

      <aside className={styles.sidebar}>
        <Panel title="The vault">
          <p className={styles.note}>
            Most relics are meant to be sold — that is where silver for the forge comes from. Lock
            anything you mean to keep.
          </p>
          {!canForge && <p className={styles.warn}>The forge opens at account level 3.</p>}
          <dl className={styles.stats}>
            <div>
              {/* Loose, not held: a relic on a champion is not taking up a slot, which is
                  what makes equipping a way to clear space rather than only spending it. */}
              <dt>In the vault</dt>
              <dd className={vault && vault.used >= vault.capacity ? styles.full : undefined}>
                {vault ? `${vault.used} / ${vault.capacity}` : gear.length}
              </dd>
            </div>
            <div>
              <dt>Worn</dt>
              <dd>{gear.filter((piece) => piece.equippedChampionId).length}</dd>
            </div>
          </dl>

          {vault && vault.used >= vault.capacity && (
            <p className={styles.warn}>
              The vault is full. Relics you win are sold on the road for silver until there is room
              again.
            </p>
          )}

          {vault &&
            (vault.nextSlots > 0 ? (
              <Button
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
              <p className={styles.note}>
                The vault is as large as it goes ({vault.max.toLocaleString()} slots).
              </p>
            ))}

          <Button variant="ghost" onClick={selectFodder}>
            Select unupgraded fodder
          </Button>
        </Panel>

        {selection.length > 0 && (
          <Panel title={`${selection.length} selected`}>
            <p className={styles.sellValue}>{sellTotal.toLocaleString()} silver</p>
            {blocked.length > 0 && (
              <p className={styles.warn}>
                {blocked.length} of those are locked or worn. Selling will be refused until you
                deselect them.
              </p>
            )}
            <div className={styles.sellActions}>
              <Button variant="ghost" onClick={() => setSelection([])}>
                Clear
              </Button>
              <Button disabled={busy || blocked.length > 0} onClick={() => void sell()}>
                Sell
              </Button>
            </div>
          </Panel>
        )}

        {notice && <p className={styles.notice}>{notice}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </aside>

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
