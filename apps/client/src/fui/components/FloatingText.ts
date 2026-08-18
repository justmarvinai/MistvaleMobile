// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, commas } from '../core/dom.ts';

export type FloatKind = 'damage' | 'crit' | 'heal' | 'mana' | 'miss' | 'xp' | 'gold' | 'info';

export interface FloatOptions {
  /** Number or text to show. Numbers are thousands-separated. */
  value: number | string;
  kind?: FloatKind;
  /** Asset id for a small leading icon, e.g. `'icon-coins'` on gold pickups. */
  icon?: string;
  /** Milliseconds before it fades out. Default 1100. */
  life?: number;
  /** Random horizontal jitter in px so simultaneous hits don't stack. Default 22. */
  spread?: number;
}

export interface FloatingTextOptions extends BaseOptions {
  /** Layer over a specific element instead of the whole viewport. */
  anchor?: HTMLElement;
}

/**
 * Damage numbers, heal ticks, XP pops and gold pickups.
 *
 * One instance manages a whole layer; call `spawn()` per hit. Nodes clean
 * themselves up when their animation ends.
 *
 *   const fx = new FloatingText({ mount: document.body });
 *   fx.spawn(x, y, { value: 248, kind: 'crit' });
 *   fx.spawnAt(enemyEl, { value: 96 });
 */
export class FloatingText extends FuiComponent<FloatingTextOptions> {
  constructor(opts: FloatingTextOptions = {}) {
    const root = h('div', { class: 'fui fui-float', attrs: { 'aria-hidden': 'true' } });
    if (opts.anchor) root.classList.add('fui-float--anchored');
    super(root, opts);
    if (opts.anchor) opts.anchor.appendChild(root);
  }

  /** Emit one number at viewport (or anchor-relative) coordinates. */
  spawn(x: number, y: number, opts: FloatOptions): this {
    const kind = opts.kind ?? 'damage';
    const spread = opts.spread ?? 22;
    // Deterministic-enough jitter; only cosmetic.
    const dx = (Math.random() - 0.5) * spread;
    const life = opts.life ?? (kind === 'crit' ? 1500 : 1100);

    const node = h('span', {
      class: 'fui-float__item',
      dataset: { kind },
      style: {
        left: `${x + dx}px`,
        top: `${y}px`,
        animationDuration: `${life}ms`,
      },
    });

    if (opts.icon) {
      node.appendChild(
        h('span', {
          class: 'fui-float__icon',
          style: { backgroundImage: `var(--fui-img-${opts.icon})` },
        }),
      );
    }
    const text =
      typeof opts.value === 'number'
        ? (kind === 'heal' || kind === 'xp' || kind === 'gold' ? '+' : '') + commas(opts.value)
        : opts.value;
    node.appendChild(h('span', { text }));

    node.addEventListener('animationend', () => node.remove());
    this.el.appendChild(node);
    return this;
  }

  /** Emit above the centre of an element — the usual case for a hit on a unit. */
  spawnAt(target: HTMLElement, opts: FloatOptions): this {
    const r = target.getBoundingClientRect();
    return this.spawn(r.left + r.width / 2, r.top + r.height * 0.25, opts);
  }
}
