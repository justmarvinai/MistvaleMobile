import { useEffect, useState } from 'react';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { useInventoryStore } from '../../state/inventoryStore';
import { usePlayerStore } from '../../state/playerStore';
import { useRosterStore } from '../../state/rosterStore';
import { useShopStore } from '../../state/shopStore';
import { RelicCard } from '../Relics/RelicCard';
import styles from './BazaarScreen.module.scss';

/**
 * The Bazaar.
 *
 * Rotating stock on an hour's timer. The countdown is derived from the server's
 * `restocksAt` against a ticking clock rather than stored as text, so the label cannot
 * drift out of step with the window it describes — and when the window closes the screen
 * asks for the next one rather than rolling anything itself.
 */

const SHOP_KEY = 'bazaar';

export function BazaarScreen(): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const stock = useShopStore((state) => state.stock);
  const loadStock = useShopStore((state) => state.load);
  const buy = useShopStore((state) => state.buy);
  const refreshStock = useShopStore((state) => state.refreshStock);
  const unlockSlot = useShopStore((state) => state.unlockSlot);
  const loadError = useShopStore((state) => state.error);

  const refreshPlayer = usePlayerStore((state) => state.refresh);
  const refreshInventory = useInventoryStore((state) => state.refresh);
  const refreshRoster = useRosterStore((state) => state.load);
  const silver = usePlayerStore((state) => state.player?.silver ?? 0);
  const crystals = usePlayerStore((state) => state.player?.crystals ?? 0);

  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStock(SHOP_KEY);
  }, [loadStock]);

  // One tick a second, feeding the countdown below.
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(handle);
  }, []);

  const msLeft = stock ? new Date(stock.restocksAt).getTime() - now : 0;

  // When the window closes, ask the server for the next one.
  useEffect(() => {
    if (stock && msLeft <= 0) void loadStock(SHOP_KEY);
  }, [stock, msLeft, loadStock]);

  const act = async (label: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await Promise.all([refreshPlayer(), refreshInventory(), refreshRoster()]);
      setNotice(label);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  if (!stock) {
    return (
      <Panel>
        <p className={styles.empty}>{loadError ?? 'Finding the traders…'}</p>
      </Panel>
    );
  }

  const remaining =
    msLeft <= 0
      ? 'restocking…'
      : `${Math.floor(msLeft / 60_000)}:${String(Math.floor((msLeft % 60_000) / 1_000)).padStart(2, '0')}`;

  const itemName = (key: string): string =>
    bundle?.items.find((entry) => entry.key === key)?.name ?? key;
  const championName = (key: string): string =>
    bundle?.champions.find((entry) => entry.key === key)?.name ?? key;

  return (
    <div className={styles.screen}>
      <div>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>{stock.name}</h2>
            <p className={styles.blurb}>{stock.description}</p>
          </div>
          <div className={styles.timer}>
            <span className={styles.timerValue}>{remaining}</span>
            <span className={styles.timerLabel}>until new stock</span>
          </div>
        </header>

        <div className={styles.slots}>
          {stock.slots.map((slot) => {
            const wallet = slot.currency === 'silver' ? silver : crystals;
            const affordable = wallet >= slot.price;
            const disabled = busy || slot.purchased || slot.slotLocked || !affordable;

            return (
              <article key={slot.index} className={styles.slot} data-sold={slot.purchased}>
                <header className={styles.slotHead}>
                  <span className={styles.slotName}>
                    {slot.kind === 'champion' ? championName(slot.refKey) : slot.name}
                  </span>
                  {slot.quantity > 1 && <span className={styles.qty}>×{slot.quantity}</span>}
                </header>

                {slot.gear ? (
                  <RelicCard relic={slot.gear} />
                ) : (
                  <p className={styles.slotBody}>
                    {slot.kind === 'item' ? itemName(slot.refKey) : slot.name}
                  </p>
                )}

                <footer className={styles.slotFoot}>
                  <span className={affordable ? styles.price : styles.priceShort}>
                    {slot.price.toLocaleString()}{' '}
                    {slot.currency === 'silver' ? 'silver' : 'crystals'}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => void act('Bought.', () => buy(SHOP_KEY, slot.index))}
                  >
                    {slot.purchased
                      ? 'Sold'
                      : slot.slotLocked
                        ? 'Locked'
                        : affordable
                          ? 'Buy'
                          : 'Too dear'}
                  </Button>
                </footer>

                {slot.unavailableReason && !slot.purchased && (
                  <p className={styles.reason}>{slot.unavailableReason}</p>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <aside className={styles.sidebar}>
        <Panel title="The traders">
          <p className={styles.note}>
            Stock rotates every hour. Relics here are the exact pieces you see — main stat and
            substats already rolled.
          </p>
          <div className={styles.crystalActions}>
            <Button
              variant="ghost"
              disabled={busy || crystals < stock.refreshCost}
              onClick={() => void act('New stock.', () => refreshStock(SHOP_KEY))}
            >
              Refresh — {stock.refreshCost} crystals
            </Button>
            <Button
              variant="ghost"
              disabled={busy || crystals < stock.crystalSlotCost}
              onClick={() => void act('Another shelf opened.', () => unlockSlot(SHOP_KEY))}
            >
              Open a shelf — {stock.crystalSlotCost} crystals
            </Button>
          </div>
        </Panel>

        {notice && <p className={styles.notice}>{notice}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </aside>
    </div>
  );
}
