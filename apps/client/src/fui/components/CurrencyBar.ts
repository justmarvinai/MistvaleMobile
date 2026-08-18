// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas, abbreviate } from '../core/dom.ts';

export interface Currency {
  id: string;
  /** Asset id for the coin / gem / material art. */
  icon: string;
  amount: number;
  label?: string;
  /** Cap shown as `120 / 500`, e.g. bag weight or a soft currency cap. */
  max?: number;
}

export interface CurrencyBarOptions extends BaseOptions {
  currencies: Currency[];
  /** `full` shows thousands separators, `short` abbreviates to 12.5K. */
  format?: 'full' | 'short';
  /** Draw the surface plate behind the row. Default true. */
  plate?: boolean;
  /** Emit `currency:click` when an entry is clicked (opens a shop, say). */
  clickable?: boolean;
}

/**
 * The wallet strip: gold, gems, shards, crafting materials.
 * `set()` animates the number so pickups feel like they landed.
 *
 *   const wallet = new CurrencyBar({ currencies: [
 *     { id: 'gold', icon: 'icon-coins', amount: 12480 },
 *     { id: 'runes', icon: 'icon-rune-stone', amount: 37 },
 *   ]});
 *   wallet.add('gold', 250);
 */
export class CurrencyBar extends FuiComponent<CurrencyBarOptions> {
  private values = new Map<string, HTMLElement>();
  private amounts = new Map<string, number>();

  constructor(opts: CurrencyBarOptions) {
    const root = h('div', { class: 'fui fui-currency' });
    if (opts.plate !== false) root.classList.add('fui-currency--plate');
    super(root, opts);
    this.render();
  }

  private fmt(n: number): string {
    return (this.opts.format ?? 'full') === 'short' ? abbreviate(n) : commas(n);
  }

  private render(): void {
    clear(this.el);
    this.values.clear();
    if (this.opts.plate !== false) {
      this.el.appendChild(h('div', { class: 'fui-currency__fill', attrs: { 'aria-hidden': 'true' } }));
    }
    for (const c of this.opts.currencies) {
      this.amounts.set(c.id, c.amount);
      const value = h('span', {
        class: 'fui-currency__value fui-num',
        text: c.max != null ? `${this.fmt(c.amount)} / ${this.fmt(c.max)}` : this.fmt(c.amount),
      });
      this.values.set(c.id, value);

      const entry = h(
        'div',
        { class: 'fui-currency__item', attrs: { title: c.label ?? c.id } },
        h('span', {
          class: 'fui-currency__icon',
          style: { backgroundImage: `var(--fui-img-${c.icon})` },
        }),
        value,
      );
      if (this.opts.clickable) {
        entry.classList.add('is-clickable');
        entry.addEventListener('click', () => this.emit('currency:click', c));
      }
      this.el.appendChild(entry);
    }
  }

  /** Set an exact amount and flash the entry. */
  set(id: string, amount: number): this {
    const c = this.opts.currencies.find((x) => x.id === id);
    const el = this.values.get(id);
    if (!c || !el) return this;
    const previous = this.amounts.get(id) ?? 0;
    this.amounts.set(id, amount);
    c.amount = amount;
    el.textContent = c.max != null ? `${this.fmt(amount)} / ${this.fmt(c.max)}` : this.fmt(amount);

    const entry = el.parentElement;
    if (entry) {
      entry.classList.remove('is-gain', 'is-loss');
      void entry.offsetWidth;
      entry.classList.add(amount >= previous ? 'is-gain' : 'is-loss');
    }
    this.emit('currency:change', { id, amount, delta: amount - previous });
    return this;
  }

  /** Relative change — `wallet.add('gold', -50)` on a purchase. */
  add(id: string, delta: number): this {
    return this.set(id, (this.amounts.get(id) ?? 0) + delta);
  }

  get(id: string): number {
    return this.amounts.get(id) ?? 0;
  }

  /** True when the player can afford `cost` of `id`. */
  canAfford(id: string, cost: number): boolean {
    return this.get(id) >= cost;
  }
}
