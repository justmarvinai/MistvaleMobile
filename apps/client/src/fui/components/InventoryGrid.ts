// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';
import { Slot, type SlotItem, type SlotSize } from './Slot.ts';

export interface InventoryGridOptions extends BaseOptions {
  /** Number of columns. */
  cols?: number;
  /** Total cells. Defaults to `cols * 4`. */
  size?: number;
  /** Starting contents; `null` or a hole leaves the cell empty. */
  items?: (SlotItem | null)[];
  slotSize?: SlotSize | number;
  gap?: number;
  /** Enable drag-and-drop reordering between cells. Default true. */
  draggable?: boolean;
  /** Cells at or past this index render locked — unpurchased bag pages. */
  lockedFrom?: number;
  /** Faint outline art shown in every empty cell. */
  placeholder?: string;
  /** Max stack size used by `add()` when merging. Default 99. */
  stackSize?: number;
}

/**
 * A grid of slots with working drag-and-drop, stacking and capacity tracking —
 * the backpack, bank, stash or chest window.
 *
 * Emits `inventory:change` on any mutation, plus `inventory:click`,
 * `inventory:contextmenu` and `inventory:hover` carrying `{ index, item }`.
 *
 *   const bag = new InventoryGrid({ cols: 6, size: 24 });
 *   bag.add({ icon: 'icon-potion', name: 'Healing Draught', qty: 5 });
 *   bag.on('inventory:change', () => save(bag.getItems()));
 */
export class InventoryGrid extends FuiComponent<InventoryGridOptions> {
  private slots: Slot[] = [];
  private items: (SlotItem | null)[];

  constructor(opts: InventoryGridOptions = {}) {
    const cols = opts.cols ?? 6;
    const size = opts.size ?? cols * 4;

    const root = h('div', {
      class: 'fui fui-inv',
      style: {
        gridTemplateColumns: `repeat(${cols}, auto)`,
        gap: `${opts.gap ?? 6}px`,
      },
      attrs: { role: 'grid' },
    });
    super(root, opts);

    this.items = Array.from({ length: size }, (_, i) => opts.items?.[i] ?? null);

    for (let i = 0; i < size; i++) {
      const slot = new Slot({
        index: i,
        item: this.items[i],
        size: opts.slotSize ?? 'md',
        draggable: opts.draggable !== false,
        locked: opts.lockedFrom != null && i >= opts.lockedFrom,
        placeholder: opts.placeholder,
      });

      slot.on<{ index: number; item: SlotItem | null }>('slot:click', (d) =>
        this.emit('inventory:click', d),
      );
      slot.on('slot:contextmenu', (d) => this.emit('inventory:contextmenu', d));
      slot.on('slot:hover', (d) => this.emit('inventory:hover', d));
      slot.on('slot:leave', (d) => this.emit('inventory:leave', d));
      slot.on<{ from: number; to: number }>('slot:drop', ({ from, to }) => this.swap(from, to));

      this.slots.push(slot);
      root.appendChild(slot.el);
    }
  }

  /** A copy of the current contents. */
  getItems(): (SlotItem | null)[] {
    return [...this.items];
  }

  getItem(index: number): SlotItem | null {
    return this.items[index] ?? null;
  }

  /** Number of empty cells. */
  get free(): number {
    return this.items.filter((i) => !i).length;
  }

  get capacity(): number {
    return this.items.length;
  }

  setItem(index: number, item: SlotItem | null): this {
    if (index < 0 || index >= this.items.length) return this;
    this.items[index] = item;
    this.slots[index].setItem(item);
    this.emit('inventory:change', { index, item });
    return this;
  }

  /** Replace the whole grid contents at once. */
  setItems(items: (SlotItem | null)[]): this {
    for (let i = 0; i < this.items.length; i++) {
      this.items[i] = items[i] ?? null;
      this.slots[i].setItem(this.items[i]);
    }
    this.emit('inventory:change', { index: -1, item: null });
    return this;
  }

  /**
   * Add an item, merging into an existing stack of the same icon+name when
   * there's room, otherwise taking the first free cell.
   * Returns the index used, or -1 when the grid is full.
   */
  add(item: SlotItem): number {
    const max = this.opts.stackSize ?? 99;
    const qty = item.qty ?? 1;

    const stackAt = this.items.findIndex(
      (i) => i && i.icon === item.icon && i.name === item.name && (i.qty ?? 1) + qty <= max,
    );
    if (stackAt >= 0) {
      const existing = this.items[stackAt]!;
      this.setItem(stackAt, { ...existing, qty: (existing.qty ?? 1) + qty });
      this.slots[stackAt].flash();
      return stackAt;
    }

    const freeAt = this.items.findIndex((i) => !i);
    if (freeAt < 0) return -1;
    this.setItem(freeAt, item);
    this.slots[freeAt].flash();
    return freeAt;
  }

  /** Remove `qty` from a cell, clearing it when the stack runs out. */
  remove(index: number, qty = Infinity): this {
    const item = this.items[index];
    if (!item) return this;
    const left = (item.qty ?? 1) - qty;
    return this.setItem(index, left > 0 ? { ...item, qty: left } : null);
  }

  swap(a: number, b: number): this {
    if (a === b || a < 0 || b < 0 || a >= this.items.length || b >= this.items.length) return this;
    const tmp = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = tmp;
    this.slots[a].setItem(this.items[a]);
    this.slots[b].setItem(this.items[b]);
    this.emit('inventory:change', { from: a, to: b });
    return this;
  }

  /** Compact and sort: filled cells first, ordered by rarity then name. */
  sort(compare?: (a: SlotItem, b: SlotItem) => number): this {
    const order = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
    const rank = (i: SlotItem) => {
      const idx = order.indexOf(i.rarity ?? 'common');
      return idx < 0 ? order.length : idx;
    };
    const filled = this.items.filter((i): i is SlotItem => !!i);
    filled.sort(compare ?? ((a, b) => rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? '')));
    return this.setItems(filled);
  }

  /** The underlying Slot for a cell, for cooldowns or manual highlighting. */
  slotAt(index: number): Slot | undefined {
    return this.slots[index];
  }
}
