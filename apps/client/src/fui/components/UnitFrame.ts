// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';
import { Portrait } from './Portrait.ts';
import { StatBar } from './StatBar.ts';

export interface UnitFrameOptions extends BaseOptions {
  name?: string;
  level?: number;
  /** Image URL for the portrait. */
  portrait?: string;
  /** Or a manifest asset id, e.g. `'silhouette-warrior-m'`. */
  portraitArt?: string;
  /** Class / role icon shown on the portrait corner. */
  role?: string;
  health?: number;
  healthMax?: number;
  /** Omit both mana fields to hide the secondary bar entirely. */
  mana?: number;
  manaMax?: number;
  /** Secondary resource flavour. Default `'mana'`. */
  manaKind?: 'mana' | 'stamina' | 'rage';
  /** `player` reads left-to-right; `target` mirrors it; `boss` is wider. */
  kind?: 'player' | 'target' | 'boss';
  /** Gold trim and a rank tag — rares, elites and bosses. */
  elite?: string;
  /** Compact row layout for party and raid lists. */
  compact?: boolean;
  /** Portrait size in px. */
  portraitSize?: number;
  /** Width in pixels. */
  width?: number;
}

/**
 * The unit nameplate: portrait, name, level and resource bars. One component
 * covers the player frame, the target frame and boss frames.
 *
 *   const player = new UnitFrame({ name: 'Kaelen', level: 24, health: 780,
 *     healthMax: 900, mana: 210, manaMax: 400, portraitArt: 'silhouette-warrior-m' });
 *   player.setHealth(640);
 */
export class UnitFrame extends FuiComponent<UnitFrameOptions> {
  readonly portrait: Portrait;
  readonly health: StatBar;
  readonly mana: StatBar | null = null;
  private nameEl: HTMLElement;

  constructor(opts: UnitFrameOptions = {}) {
    const kind = opts.kind ?? 'player';
    const root = h('div', {
      class: 'fui fui-unit',
      dataset: { kind },
      style: opts.width != null ? { width: `${opts.width}px` } : undefined,
    });
    if (opts.compact) root.classList.add('fui-unit--compact');
    if (opts.elite) root.classList.add('fui-unit--elite');
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-unit__fill', attrs: { 'aria-hidden': 'true' } }));

    this.portrait = new Portrait({
      src: opts.portrait,
      art: opts.portraitArt,
      // Manifest art is full-body silhouette work; supplied images are headshots.
      fit: opts.portrait ? 'cover' : 'contain',
      size: opts.portraitSize ?? (opts.compact ? 40 : kind === 'boss' ? 84 : 66),
      level: opts.level,
      badge: opts.role,
      name: opts.name,
    });
    root.appendChild(this.portrait.el);

    const stack = h('div', { class: 'fui-unit__stack' });

    const nameRow = h('div', { class: 'fui-unit__namerow' });
    this.nameEl = h('span', { class: 'fui-unit__name fui-title', text: opts.name ?? 'Unknown' });
    nameRow.appendChild(this.nameEl);
    if (opts.elite) {
      nameRow.appendChild(h('span', { class: 'fui-unit__elite', text: opts.elite }));
    }
    stack.appendChild(nameRow);

    this.health = new StatBar({
      kind: 'health',
      value: opts.health ?? 100,
      max: opts.healthMax ?? 100,
      readout: opts.compact ? 'none' : 'ratio',
      dangerAt: 0.25,
      class: opts.compact ? 'fui-bar--compact' : '',
    });
    this.health.el.style.width = '100%';
    stack.appendChild(this.health.el);

    if (opts.mana != null || opts.manaMax != null) {
      this.mana = new StatBar({
        kind: opts.manaKind ?? 'mana',
        value: opts.mana ?? 0,
        max: opts.manaMax ?? 100,
        readout: opts.compact ? 'none' : 'ratio',
        class: opts.compact ? 'fui-bar--compact' : '',
      });
      this.mana.el.style.width = '100%';
      stack.appendChild(this.mana.el);
    }

    root.appendChild(stack);
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  setHealth(value: number, max?: number): this {
    if (max != null) this.health.setMax(max);
    this.health.set(value);
    return this;
  }

  setMana(value: number, max?: number): this {
    if (!this.mana) return this;
    if (max != null) this.mana.setMax(max);
    this.mana.set(value);
    return this;
  }

  /** Grey the frame out — dead, out of range, offline. */
  setInactive(inactive: boolean): this {
    this.el.classList.toggle('fui-unit--inactive', inactive);
    this.portrait.setInactive(inactive);
    return this;
  }

  /** Highlight as the current target or active turn. */
  setActive(active: boolean): this {
    this.el.classList.toggle('fui-unit--active', active);
    return this;
  }
}
