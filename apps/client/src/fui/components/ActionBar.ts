// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';
import { Slot, type SlotSize } from './Slot.ts';

export interface ActionSlot {
  /** Asset id for the ability art, e.g. `'skill-firehand'`. */
  icon: string;
  name?: string;
  /** Cooldown in seconds started when the action fires. */
  cooldown?: number;
  /** Charges / potion count shown as a stack number. */
  charges?: number;
  /** Resource cost — rendered under the slot and used to grey it out. */
  cost?: number;
  disabled?: boolean;
}

export interface ActionBarOptions extends BaseOptions {
  /** Number of slots. Defaults to `actions.length` or 8. */
  size?: number;
  actions?: (ActionSlot | null)[];
  /** Keybind labels, one per slot. Defaults to 1-9, 0. */
  keys?: string[];
  /** Bind those keys on the document so pressing them fires the slot. */
  bindKeys?: boolean;
  slotSize?: SlotSize | number;
  orientation?: 'horizontal' | 'vertical';
  /** Current resource pool; actions costing more render as unaffordable. */
  resource?: number;
}

/**
 * The hotbar: numbered ability slots with keybinds, cooldown sweeps, charge
 * counts and affordability shading.
 *
 * Emits `action:trigger` with `{ index, action }` when a slot fires, and
 * `action:denied` when it can't (on cooldown, disabled, or too expensive).
 *
 *   const bar = new ActionBar({ actions: [
 *     { icon: 'skill-firehand', name: 'Firebolt', cooldown: 4, cost: 20 },
 *   ], bindKeys: true });
 *   bar.on('action:trigger', ({ index }) => cast(index));
 */
export class ActionBar extends FuiComponent<ActionBarOptions> {
  private slots: Slot[] = [];
  private actions: (ActionSlot | null)[];
  private cooling = new Set<number>();
  private resource: number;

  constructor(opts: ActionBarOptions = {}) {
    const size = opts.size ?? opts.actions?.length ?? 8;
    const keys = opts.keys ?? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

    const root = h('div', {
      class: 'fui fui-actionbar',
      dataset: { orientation: opts.orientation ?? 'horizontal' },
    });
    super(root, opts);

    this.actions = Array.from({ length: size }, (_, i) => opts.actions?.[i] ?? null);
    this.resource = opts.resource ?? Infinity;

    for (let i = 0; i < size; i++) {
      const action = this.actions[i];
      const slot = new Slot({
        index: i,
        size: opts.slotSize ?? 'md',
        keyHint: keys[i],
        item: action ? { icon: action.icon, name: action.name, qty: action.charges } : null,
      });
      slot.on('slot:click', () => this.trigger(i));
      slot.on('slot:ready', () => {
        this.cooling.delete(i);
        this.emit('action:ready', { index: i, action: this.actions[i] });
      });

      const cell = h('div', { class: 'fui-actionbar__cell' }, slot.el);
      if (action?.cost != null) {
        cell.appendChild(h('span', { class: 'fui-actionbar__cost fui-num', text: String(action.cost) }));
      }
      this.slots.push(slot);
      root.appendChild(cell);
    }

    if (opts.bindKeys) {
      const onKey = (ev: KeyboardEvent) => {
        const target = ev.target as HTMLElement | null;
        // Never steal keystrokes from a focused text field.
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        const idx = keys.indexOf(ev.key);
        if (idx >= 0 && idx < size) {
          ev.preventDefault();
          this.trigger(idx);
        }
      };
      const d = root.ownerDocument;
      d.addEventListener('keydown', onKey);
      this.onDestroy(() => d.removeEventListener('keydown', onKey));
    }

    this.paint();
  }

  /** Fire a slot, respecting cooldown, disabled state and resource cost. */
  trigger(index: number): boolean {
    const action = this.actions[index];
    if (!action || action.disabled || this.cooling.has(index)) {
      this.deny(index);
      return false;
    }
    if (action.cost != null && action.cost > this.resource) {
      this.deny(index);
      return false;
    }
    if (action.cooldown) {
      this.cooling.add(index);
      this.slots[index].startCooldown(action.cooldown);
    }
    this.emit('action:trigger', { index, action });
    return true;
  }

  private deny(index: number): void {
    const cell = this.slots[index]?.el.parentElement;
    if (cell) {
      cell.classList.remove('is-denied');
      void cell.offsetWidth;
      cell.classList.add('is-denied');
    }
    this.emit('action:denied', { index, action: this.actions[index] });
  }

  setAction(index: number, action: ActionSlot | null): this {
    this.actions[index] = action;
    this.slots[index]?.setItem(
      action ? { icon: action.icon, name: action.name, qty: action.charges } : null,
    );
    this.paint();
    return this;
  }

  /** Update the player's resource pool so unaffordable actions grey out. */
  setResource(value: number): this {
    this.resource = value;
    this.paint();
    return this;
  }

  /** Trigger every slot's cooldown at once — the classic global cooldown. */
  globalCooldown(seconds: number): this {
    this.slots.forEach((s, i) => {
      if (this.actions[i]) {
        this.cooling.add(i);
        s.startCooldown(seconds);
      }
    });
    return this;
  }

  private paint(): void {
    this.actions.forEach((action, i) => {
      const cell = this.slots[i].el.parentElement;
      if (!cell) return;
      const poor = !!action?.cost && action.cost > this.resource;
      cell.classList.toggle('is-unaffordable', poor);
      this.slots[i].setLocked(!!action?.disabled);
    });
  }
}
