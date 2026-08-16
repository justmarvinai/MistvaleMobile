import { z } from 'zod';
import { SHOP_OFFER_KINDS } from './content/entities';
import { gearInstanceSchema } from './gear';

/**
 * Shop stock, as one player sees it.
 *
 * Stock is rolled per player and stored, not derived on read: a slot a player is looking
 * at must still be there when they tap it, and what they were offered has to be as
 * auditable as a drop. The restock clock is server time; the client shows a countdown
 * against `restocksAt` and re-fetches when it runs out.
 */

export const shopSlotSchema = z.object({
  index: z.number().int(),
  offerKey: z.string(),
  kind: z.enum(SHOP_OFFER_KINDS),
  name: z.string(),
  price: z.number().int(),
  currency: z.enum(['silver', 'crystals']),
  quantity: z.number().int(),
  /** `item_defs` or `champion_defs` key, for the icon and tooltip. */
  refKey: z.string(),
  /** The exact relic on offer, rolled when the slot was stocked. */
  gear: gearInstanceSchema.nullable(),
  purchased: z.boolean(),
  /** True when this is a crystal slot the player has not opened yet. */
  slotLocked: z.boolean(),
  /** Why the player cannot buy it right now, if they cannot. */
  unavailableReason: z.string().nullable(),
});
export type ShopSlot = z.infer<typeof shopSlotSchema>;

export const shopStockSchema = z.object({
  shopKey: z.string(),
  name: z.string(),
  description: z.string(),
  restocksAt: z.string(),
  refreshCost: z.number().int(),
  crystalSlotCost: z.number().int(),
  /** How many slots the player has unlocked beyond the free ones. */
  unlockedCrystalSlots: z.number().int(),
  slots: z.array(shopSlotSchema),
});
export type ShopStock = z.infer<typeof shopStockSchema>;

export const buyShopSlotRequestSchema = z.object({
  slotIndex: z.number().int().min(0).max(31),
  actionId: z.string().min(8).max(64),
});
export type BuyShopSlotRequest = z.infer<typeof buyShopSlotRequestSchema>;

export const shopActionRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});
export type ShopActionRequest = z.infer<typeof shopActionRequestSchema>;

export const shopPurchaseResultSchema = z.object({
  stock: shopStockSchema,
  silver: z.number().int(),
  crystals: z.number().int(),
  /** What landed in the player's inventory, for the acknowledgement toast. */
  granted: z.object({
    itemKey: z.string().nullable(),
    quantity: z.number().int(),
    gear: gearInstanceSchema.nullable(),
    championKey: z.string().nullable(),
  }),
});
export type ShopPurchaseResult = z.infer<typeof shopPurchaseResultSchema>;

/** A stackable the player holds. */
export const inventoryItemSchema = z.object({
  itemKey: z.string(),
  quantity: z.number().int(),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
