// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface IconOptions extends BaseOptions {
  /** Asset id, e.g. `'icon-sword'` or `'skill-firehand'`. */
  icon: string;
  /** Pixel size of the square box. Defaults to 40. */
  size?: number;
  /** Tints the drop shadow with the rarity colour. */
  rarity?: Rarity;
  /** Accessible name; also used as the `title` tooltip. */
  label?: string;
  /** Continuous glow, for "ready" or "equipped" states. */
  glow?: boolean;
  /** Desaturate, for unaffordable or unlearned entries. */
  muted?: boolean;
}

/**
 * A single piece of icon art sized to a square box.
 *
 * Icons are addressed by asset id straight from the manifest — the game decides
 * which one to show, so this is the one component that takes an id rather than
 * a theme slot.
 *
 *   new Icon({ icon: 'icon-potion', size: 48, rarity: 'rare' });
 */
export class Icon extends FuiComponent<IconOptions> {
  constructor(opts: IconOptions) {
    const size = opts.size ?? 40;
    const root = h('span', {
      class: 'fui fui-icon',
      dataset: opts.rarity ? { rarity: opts.rarity } : undefined,
      style: {
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `var(--fui-img-${opts.icon})`,
      },
      attrs: {
        role: opts.label ? 'img' : 'presentation',
        'aria-label': opts.label,
        title: opts.label,
      },
    });
    if (opts.glow) root.classList.add('fui-icon--glow');
    if (opts.muted) root.classList.add('fui-icon--muted');
    super(root, opts);
  }

  setIcon(id: string): this {
    this.el.style.backgroundImage = `var(--fui-img-${id})`;
    return this;
  }

  setRarity(rarity: Rarity | null): this {
    if (rarity) this.el.dataset.rarity = rarity;
    else delete this.el.dataset.rarity;
    return this;
  }
}
