// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';
import { Slot, type SlotItem } from './Slot.ts';

export interface EquipSlotDef {
  id: string;
  label: string;
  /** Faint outline art shown when the socket is empty. */
  placeholder?: string;
  /** Grid column: `left`, `right`, or `bottom` for the weapon row. */
  column?: 'left' | 'right' | 'bottom';
}

export interface PaperdollOptions extends BaseOptions {
  /** Silhouette asset id behind the sockets. */
  silhouette?: string;
  /** Character render URL, used instead of the silhouette when supplied. */
  portrait?: string;
  slots?: EquipSlotDef[];
  equipped?: Record<string, SlotItem | null>;
  /** Width in pixels. */
  width?: number;
  /** Height in pixels. */
  height?: number;
  /** Combined item level / gear score shown at the bottom. */
  gearScore?: number;
}

/** The default socket layout — the arrangement most RPGs use. */
export const DEFAULT_EQUIP_SLOTS: EquipSlotDef[] = [
  { id: 'head', label: 'Head', column: 'left' },
  { id: 'shoulders', label: 'Shoulders', column: 'left' },
  { id: 'chest', label: 'Chest', column: 'left', placeholder: 'icon-armor' },
  { id: 'gloves', label: 'Gloves', column: 'left' },
  { id: 'legs', label: 'Legs', column: 'left' },
  { id: 'amulet', label: 'Amulet', column: 'right' },
  { id: 'cloak', label: 'Cloak', column: 'right' },
  { id: 'ring1', label: 'Ring', column: 'right' },
  { id: 'ring2', label: 'Ring', column: 'right' },
  { id: 'trinket', label: 'Trinket', column: 'right', placeholder: 'icon-rune-stone' },
  { id: 'mainhand', label: 'Main Hand', column: 'bottom', placeholder: 'icon-sword' },
  { id: 'offhand', label: 'Off Hand', column: 'bottom', placeholder: 'icon-shield' },
];

/**
 * The equipment doll: a character silhouette ringed by gear sockets that accept
 * drops from an inventory grid.
 *
 * Emits `equip:click`, `equip:drop` (`{ slotId, from }`) and `equip:change`.
 *
 *   const doll = new Paperdoll({ silhouette: 'silhouette-warrior-m',
 *     equipped: { chest: { icon: 'icon-armor', name: 'Plate', rarity: 'rare' } } });
 */
export class Paperdoll extends FuiComponent<PaperdollOptions> {
  private slots = new Map<string, Slot>();

  constructor(opts: PaperdollOptions = {}) {
    const defs = opts.slots ?? DEFAULT_EQUIP_SLOTS;
    const root = h('div', {
      class: 'fui fui-doll',
      style: {
        width: `${opts.width ?? 380}px`,
        ...(opts.height ? { height: `${opts.height}px` } : {}),
      },
    });
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-doll__fill', attrs: { 'aria-hidden': 'true' } }));

    const figure = h('div', { class: 'fui-doll__figure', attrs: { 'aria-hidden': 'true' } });
    if (opts.portrait) figure.style.backgroundImage = `url("${opts.portrait}")`;
    else if (opts.silhouette) figure.style.backgroundImage = `var(--fui-img-${opts.silhouette})`;

    const cols: Record<string, HTMLElement> = {
      left: h('div', { class: 'fui-doll__col fui-doll__col--left' }),
      right: h('div', { class: 'fui-doll__col fui-doll__col--right' }),
      bottom: h('div', { class: 'fui-doll__row' }),
    };

    for (const def of defs) {
      const slot = new Slot({
        size: 'md',
        draggable: true,
        placeholder: def.placeholder,
        item: opts.equipped?.[def.id] ?? null,
      });
      slot.el.dataset.equip = def.id;
      slot.el.title = def.label;
      slot.on('slot:click', () => this.emit('equip:click', { slotId: def.id, item: this.get(def.id) }));
      slot.on<{ from: number }>('slot:drop', ({ from }) =>
        this.emit('equip:drop', { slotId: def.id, from }),
      );
      this.slots.set(def.id, slot);
      (cols[def.column ?? 'left'] ?? cols.left).appendChild(slot.el);
    }

    root.appendChild(h('div', { class: 'fui-doll__stage' }, cols.left, figure, cols.right));
    root.appendChild(cols.bottom);

    if (opts.gearScore != null) {
      root.appendChild(
        h(
          'div',
          { class: 'fui-doll__score' },
          h('span', { class: 'fui-label', text: 'Gear Score' }),
          h('span', { class: 'fui-doll__scorenum fui-num', text: String(opts.gearScore) }),
        ),
      );
    }
  }

  get(slotId: string): SlotItem | null {
    return this.slots.get(slotId)?.getItem() ?? null;
  }

  /** Put an item in a socket (or clear it with null). */
  equip(slotId: string, item: SlotItem | null): this {
    const slot = this.slots.get(slotId);
    if (!slot) return this;
    slot.setItem(item);
    if (item) slot.flash();
    this.emit('equip:change', { slotId, item });
    return this;
  }

  /** Everything currently worn, keyed by socket id. */
  all(): Record<string, SlotItem | null> {
    return Object.fromEntries([...this.slots].map(([id, s]) => [id, s.getItem()]));
  }
}
