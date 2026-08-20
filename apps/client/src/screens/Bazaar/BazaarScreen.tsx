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
import { highlightable } from '../../app/highlight';
import { Slot } from '@/fui/components/Slot.ts';
import { Fui } from '@/fui/react';
import { Heading } from '@/ui/Heading/Heading';
import { ScreenInfo } from '../../ui/ScreenInfo/ScreenInfo';
import { rewardArt } from '../../ui/Rewards/art';

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
      <Heading
        tagline="What the traders brought this time, and how long they mean to stay."
        actions={
          <ScreenInfo title="The Bazaar" label="About the Bazaar">
            <p>
              Stock rotates every hour. Relics here are the exact pieces you see — main stat and
              substats already rolled — so unlike a summon there is nothing left to chance.
            </p>
            <p>
              <strong>Refresh</strong> buys a new set of stalls before the hour is up, and{' '}
              <strong>open a shelf</strong> adds a slot to every rotation from now on. Both are paid
              in crystals; everything on the shelves is paid in silver or crystals as marked.
            </p>
            <p>A stall is gone once bought, and an unbought stall is gone at the restock.</p>
          </ScreenInfo>
        }
      >
        The Bazaar
      </Heading>

      <div className={styles.body}>
        <header className={styles.head}>
          <div className={styles.headWho}>
            <h2 className={styles.title}>{stock.name}</h2>
            <p className={styles.blurb}>{stock.description}</p>
          </div>

          {/* The two crystal actions used to live in a panel down the right-hand side, in a
              column that cost the stalls a fifth of the screen to hold two buttons. They
              belong to the rotation, so they sit with the clock that runs it. */}
          <div className={styles.headActions}>
            <div className={styles.timer}>
              <span className={styles.timerValue}>{remaining}</span>
              <span className={styles.timerLabel}>until new stock</span>
            </div>
            <div className={styles.crystalActions}>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || crystals < stock.refreshCost}
                onClick={() => void act('New stock.', () => refreshStock(SHOP_KEY))}
              >
                Refresh — {stock.refreshCost} crystals
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || crystals < stock.crystalSlotCost}
                onClick={() => void act('Another shelf opened.', () => unlockSlot(SHOP_KEY))}
              >
                Open a shelf — {stock.crystalSlotCost} crystals
              </Button>
            </div>
          </div>
        </header>

        {notice && <p className={styles.notice}>{notice}</p>}
        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.slots} {...highlightable('panel:bazaar-offers')}>
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
                  // A painted socket rather than a sentence: a stall selling three tomes
                  // and a champion should look like a stall, and "Epic Tome" as body text
                  // is the thing that made this screen read as a list.
                  <div className={styles.slotBody}>
                    <Fui
                      of={Slot}
                      className={styles.slotArt}
                      options={{
                        size: 'lg',
                        item: {
                          icon: slot.kind === 'champion' ? 'hero-vanguard' : rewardArt(slot.refKey),
                          name:
                            slot.kind === 'champion'
                              ? championName(slot.refKey)
                              : itemName(slot.refKey),
                          ...(slot.quantity > 1 ? { qty: slot.quantity } : {}),
                        },
                      }}
                      attrs={{
                        role: 'presentation',
                        tabindex: undefined,
                        'aria-label': undefined,
                        title: undefined,
                      }}
                    />
                    <span className={styles.slotWhat}>
                      {slot.kind === 'item' ? itemName(slot.refKey) : slot.name}
                    </span>
                  </div>
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
    </div>
  );
}
