import { useEffect, useState } from 'react';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { itemCount, useInventoryStore } from '../../state/inventoryStore';
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
import { useTip } from '../../ui/Tooltip/useTooltip';
import { itemTip, relicTip } from '../../ui/Tooltip/tips';
import type { ChampionDef, ItemDef, ShopSlot } from '@mistvale/shared';

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
  // C6's lesson on a second screen: the inventory store is filled by whichever screen
  // asked for it, and the Bazaar only ever *refreshed* it after a purchase — so a stall's
  // "Held" would have read zero for everything until something was bought. How many
  // emblems you already have is exactly the decision a stall asks for.
  const loadInventory = useInventoryStore((state) => state.load);
  const inventory = useInventoryStore((state) => state.items);
  const refreshRoster = useRosterStore((state) => state.load);
  const silver = usePlayerStore((state) => state.player?.silver ?? 0);
  const crystals = usePlayerStore((state) => state.player?.crystals ?? 0);

  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStock(SHOP_KEY);
    void loadInventory();
  }, [loadStock, loadInventory]);

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
      <div className={styles.screen}>
        <Heading tagline="What the traders brought this time, and how long they mean to stay.">
          The Bazaar
        </Heading>
        <Panel>
          <p className={styles.empty}>{loadError ?? 'Finding the traders…'}</p>
        </Panel>
      </div>
    );
  }

  const remaining =
    msLeft <= 0
      ? 'restocking…'
      : `${Math.floor(msLeft / 60_000)}:${String(Math.floor((msLeft % 60_000) / 1_000)).padStart(2, '0')}`;

  return (
    <div className={styles.screen}>
      {/* The shop's own name and description, rather than a second pair beside them: the
          panel below used to repeat both verbatim, so the screen said "The Bazaar" twice
          and its one sentence twice, a hundred pixels apart. Read from content for the
          reason the Spire's title is — an operator who renames the shop has renamed the
          screen, and there is one place to do it. */}
      <Heading
        tagline={stock.description}
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
        {stock.name}
      </Heading>

      <div className={styles.body}>
        <header className={styles.head}>
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
          {stock.slots.map((slot) => (
            <Stall
              key={slot.index}
              slot={slot}
              wallet={slot.currency === 'silver' ? silver : crystals}
              busy={busy}
              item={bundle?.items.find((entry) => entry.key === slot.refKey)}
              champion={bundle?.champions.find((entry) => entry.key === slot.refKey)}
              held={itemCount(inventory, slot.refKey)}
              onBuy={() => void act('Bought.', () => buy(SHOP_KEY, slot.index))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One stall.
 *
 * Its own component so it can carry a tooltip, which is a hook — the same reason
 * `ui/Rewards` has a `Reward` and the mastery board has a `MasteryNode`.
 *
 * The tooltip is the owner's report (C50): a stall drew a painted socket and a name, and
 * hovering "Mistbrew" or "Warden's Ration" said nothing at all about what either is for. A
 * shop is the one screen where that matters most — it is the only place in the game where a
 * player spends a currency on something they may never have seen.
 */
function Stall({
  slot,
  wallet,
  busy,
  item,
  champion,
  held,
  onBuy,
}: {
  slot: ShopSlot;
  wallet: number;
  busy: boolean;
  item: ItemDef | undefined;
  champion: ChampionDef | undefined;
  held: number;
  onBuy: () => void;
}): JSX.Element {
  const affordable = wallet >= slot.price;
  const disabled = busy || slot.purchased || slot.slotLocked || !affordable;
  const name = slot.kind === 'champion' ? (champion?.name ?? slot.refKey) : slot.name;

  // Three kinds of thing on one shelf, and each has a builder already: a relic says what
  // set it is and how far off a bonus, a champion its affinity and role, an item what it is
  // spent on. The stall carries whichever it is holding — and nothing when the definition
  // has not loaded, which is a quiet tooltip rather than an empty one.
  const ref = useTip(
    slot.gear
      ? relicTip(slot.gear, { hint: slot.purchased ? undefined : 'Bought as it stands.' })
      : slot.kind === 'champion' && champion
        ? {
            title: champion.name,
            rarity: champion.rarity,
            subtitle: champion.title || 'Champion',
            ...(champion.lore ? { flavor: champion.lore } : {}),
          }
        : item
          ? itemTip(item, { held })
          : null,
  );

  return (
    <article ref={ref} className={styles.slot} data-sold={slot.purchased}>
      <header className={styles.slotHead}>
        <span className={styles.slotName}>{name}</span>
        {slot.quantity > 1 && <span className={styles.qty}>×{slot.quantity}</span>}
      </header>

      {slot.gear ? (
        <RelicCard relic={slot.gear} />
      ) : (
        // A painted socket rather than a sentence: a stall selling three tomes and a
        // champion should look like a stall, and "Epic Tome" as body text is the thing that
        // made this screen read as a list.
        <div className={styles.slotBody}>
          <Fui
            of={Slot}
            className={styles.slotArt}
            options={{
              size: 'lg',
              item: {
                icon: slot.kind === 'champion' ? 'hero-vanguard' : rewardArt(slot.refKey),
                name,
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
            {slot.kind === 'item' ? (item?.name ?? slot.refKey) : name}
          </span>
        </div>
      )}

      <footer className={styles.slotFoot}>
        <span className={affordable ? styles.price : styles.priceShort}>
          {slot.price.toLocaleString()} {slot.currency === 'silver' ? 'silver' : 'crystals'}
        </span>
        <Button variant="ghost" disabled={disabled} onClick={onBuy}>
          {slot.purchased ? 'Sold' : slot.slotLocked ? 'Locked' : affordable ? 'Buy' : 'Too dear'}
        </Button>
      </footer>

      {slot.unavailableReason && !slot.purchased && (
        <p className={styles.reason}>{slot.unavailableReason}</p>
      )}
    </article>
  );
}
