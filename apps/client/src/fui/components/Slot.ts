// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, clamp } from '../core/dom.ts';

export type SlotSize = 'sm' | 'md' | 'lg';

export interface SlotItem {
  /** Asset id for the item's art. */
  icon: string;
  name?: string;
  rarity?: Rarity;
  /** Stack size. Values above 1 render a quantity badge. */
  qty?: number;
  /** Anything your game needs to carry along — untouched by the component. */
  data?: unknown;
}

export interface SlotOptions extends BaseOptions {
  item?: SlotItem | null;
  size?: SlotSize | number;
  /** Keybind pip in the corner, e.g. `'1'` or `'Q'`. */
  keyHint?: string;
  /** Dim + padlock the slot (locked bag pages, unmet level requirements). */
  locked?: boolean;
  /** Draw the selection highlight. */
  selected?: boolean;
  /** Enable HTML5 drag-and-drop between slots. */
  draggable?: boolean;
  /** Slot index inside its grid; included in every emitted event. */
  index?: number;
  /** Faint art shown when the slot is empty, e.g. a helmet outline. */
  placeholder?: string;
}

/**
 * The universal container square: inventory cell, equipment socket, action-bar
 * button, crafting ingredient, loot entry.
 *
 * Emits `slot:click`, `slot:contextmenu`, `slot:hover`, `slot:leave` and, when
 * `draggable` is on, `slot:drop` with `{ from, to }` indices.
 *
 *   const s = new Slot({ item: { icon: 'icon-potion', qty: 5, rarity: 'uncommon' } });
 *   s.startCooldown(8);
 */
export class Slot extends FuiComponent<SlotOptions> {
  private iconEl: HTMLElement;
  private qtyEl: HTMLElement;
  private cdEl: HTMLElement;
  private cdText: HTMLElement;
  private raf = 0;
  private item: SlotItem | null;

  constructor(opts: SlotOptions = {}) {
    const size = opts.size ?? 'md';
    const root = h('div', {
      class: 'fui fui-slot',
      dataset: {
        ...(typeof size === 'string' ? { size } : {}),
        ...(opts.index != null ? { index: String(opts.index) } : {}),
      },
      style: typeof size === 'number' ? { '--fui-slot-size': `${size}px` } : undefined,
      attrs: { tabindex: '0', role: 'button' },
    });

    super(root, opts);
    this.item = opts.item ?? null;

    root.appendChild(h('div', { class: 'fui-slot__fill', attrs: { 'aria-hidden': 'true' } }));
    root.appendChild(h('div', { class: 'fui-slot__glow', attrs: { 'aria-hidden': 'true' } }));
    this.iconEl = h('div', { class: 'fui-slot__icon' });
    root.appendChild(this.iconEl);
    root.appendChild(h('div', { class: 'fui-slot__frame', attrs: { 'aria-hidden': 'true' } }));

    this.qtyEl = h('span', { class: 'fui-slot__qty fui-num' });
    root.appendChild(this.qtyEl);

    this.cdText = h('span', { class: 'fui-slot__cd-text fui-num' });
    this.cdEl = h('div', { class: 'fui-slot__cd' }, this.cdText);
    root.appendChild(this.cdEl);

    if (opts.keyHint) root.appendChild(h('kbd', { class: 'fui-slot__key', text: opts.keyHint }));
    if (opts.locked) root.classList.add('fui-slot--locked');
    if (opts.selected) root.classList.add('fui-slot--selected');
    if (opts.placeholder) {
      root.style.setProperty('--fui-slot-placeholder', `var(--fui-img-${opts.placeholder})`);
    }

    root.addEventListener('click', () => this.emit('slot:click', this.payload()));
    root.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      this.emit('slot:contextmenu', { ...this.payload(), x: ev.clientX, y: ev.clientY });
    });
    root.addEventListener('mouseenter', () => this.emit('slot:hover', this.payload()));
    root.addEventListener('mouseleave', () => this.emit('slot:leave', this.payload()));
    root.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        this.emit('slot:click', this.payload());
      }
    });

    if (opts.draggable) this.enableDrag();
    this.setItem(this.item);
  }

  private payload() {
    return { index: this.opts.index ?? -1, item: this.item, slot: this };
  }

  private enableDrag(): void {
    const el = this.el;
    el.draggable = true;
    el.addEventListener('dragstart', (ev) => {
      if (!this.item) return ev.preventDefault();
      ev.dataTransfer?.setData('text/plain', String(this.opts.index ?? -1));
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
      el.classList.add('fui-slot--dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('fui-slot--dragging'));
    el.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
      el.classList.add('fui-slot--dragover');
    });
    el.addEventListener('dragleave', () => el.classList.remove('fui-slot--dragover'));
    el.addEventListener('drop', (ev) => {
      ev.preventDefault();
      el.classList.remove('fui-slot--dragover');
      const from = Number(ev.dataTransfer?.getData('text/plain'));
      if (Number.isNaN(from)) return;
      this.emit('slot:drop', { from, to: this.opts.index ?? -1 });
    });
  }

  /** The item currently held, or null. */
  getItem(): SlotItem | null {
    return this.item;
  }

  /** Put an item in, or pass null to empty the slot. */
  setItem(item: SlotItem | null): this {
    this.item = item;
    const empty = !item;
    this.el.classList.toggle('fui-slot--empty', empty);
    this.el.dataset.rarity = item?.rarity ?? '';
    this.iconEl.style.backgroundImage = item ? `var(--fui-img-${item.icon})` : '';
    this.el.setAttribute('aria-label', item?.name ?? 'Empty slot');
    if (item?.name) this.el.title = item.name;
    else this.el.removeAttribute('title');

    const qty = item?.qty ?? 0;
    this.qtyEl.textContent = qty > 1 ? String(qty) : '';
    this.qtyEl.classList.toggle('is-visible', qty > 1);
    return this;
  }

  setSelected(selected: boolean): this {
    this.el.classList.toggle('fui-slot--selected', selected);
    return this;
  }

  setLocked(locked: boolean): this {
    this.el.classList.toggle('fui-slot--locked', locked);
    return this;
  }

  /** Play a one-shot pickup pop, for "item acquired". */
  flash(): this {
    this.el.classList.remove('fui-slot--flash');
    void this.el.offsetWidth;
    this.el.classList.add('fui-slot--flash');
    return this;
  }

  /**
   * Sweep a radial cooldown over the slot and count down in its centre.
   * Emits `slot:ready` when it finishes.
   */
  startCooldown(seconds: number): this {
    this.stopCooldown();
    if (seconds <= 0) return this;
    const started = performance.now();
    const total = seconds * 1000;
    this.el.classList.add('fui-slot--cooling');

    const step = (now: number) => {
      const elapsed = now - started;
      const remain = Math.max(0, total - elapsed);
      const pct = clamp(remain / total, 0, 1);
      this.cdEl.style.setProperty('--fui-cd', String(pct));
      const secs = remain / 1000;
      this.cdText.textContent = secs >= 1 ? String(Math.ceil(secs)) : secs.toFixed(1);
      if (remain <= 0) {
        this.stopCooldown();
        this.el.classList.add('fui-slot--ready');
        setTimeout(() => this.el.classList.remove('fui-slot--ready'), 600);
        this.emit('slot:ready', this.payload());
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
    this.onDestroy(() => this.stopCooldown());
    return this;
  }

  stopCooldown(): this {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.el.classList.remove('fui-slot--cooling');
    this.cdText.textContent = '';
    return this;
  }
}
