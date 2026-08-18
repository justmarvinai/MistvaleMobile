// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, commas, abbreviate, clamp } from '../core/dom.ts';

export interface Resource {
  id: string;
  /** Glyph asset id, or use `art` for painted currency icons. */
  glyph?: string;
  art?: string;
  value: number;
  /** Cap — renders "84/120" and hides the plus button when full. */
  max?: number;
  /** Seconds until the next regeneration tick, shown under the value. */
  refillIn?: number;
  /** Show a "+" button that emits `top:buy`. */
  buyable?: boolean;
  color?: string;
  label?: string;
}

export interface TopBarOptions extends BaseOptions {
  /** Player name shown beside the avatar. */
  name?: string;
  /** Avatar asset id. */
  avatar?: string;
  level?: number;
  /** Progress to the next level, 0–1. Drawn as a ring around the avatar. */
  levelProgress?: number;
  resources: Resource[];
  /** Right-hand icon buttons — mail, settings, events. */
  actions?: Array<{ id: string; glyph: string; badge?: number | string; label?: string }>;
  /** Compact the whole bar for a phone-width layout. */
  compact?: boolean;
}

/**
 * The persistent header a mobile RPG puts above every screen: who you are, what
 * currencies you hold, what is capped, and the buttons that never move.
 *
 *   const top = new TopBar({
 *     name: 'Marvin', avatar: 'tech-mech-suit', level: 42, levelProgress: 0.6,
 *     resources: [
 *       { id: 'energy', glyph: 'glyph-magic-flame', value: 84, max: 120, refillIn: 240, buyable: true },
 *       { id: 'gold', glyph: 'glyph-coin-stack', value: 1_284_000, color: 'var(--fui-gold)' },
 *     ],
 *     actions: [{ id: 'mail', glyph: 'glyph-burning-scroll', badge: 3 }],
 *   });
 *   top.on<string>('top:buy', (id) => openShop(id));
 *   top.setResource('gold', 1_310_000);
 *
 * `setResource` updates one value in place, which is what every reward claim,
 * purchase and energy tick needs.
 */
export class TopBar extends FuiComponent<TopBarOptions> {
  private values = new Map<string, HTMLElement>();
  private refills = new Map<string, HTMLElement>();

  constructor(opts: TopBarOptions) {
    const root = h('div', { class: 'fui fui-topbar' });
    if (opts.compact) root.classList.add('fui-topbar--compact');
    super(root, opts);

    if (opts.name || opts.avatar) {
      const who = h('button', {
        class: 'fui-topbar__player',
        attrs: { type: 'button', 'aria-label': opts.name ?? 'Profile' },
      });
      const avatar = h('span', {
        class: 'fui-topbar__avatar',
        style: {
          ...(opts.avatar ? { backgroundImage: `var(--fui-img-${opts.avatar})` } : {}),
          '--fui-top-xp': String(clamp(opts.levelProgress ?? 0, 0, 1)),
        },
      });
      if (opts.level != null) {
        avatar.appendChild(h('span', { class: 'fui-topbar__level fui-num', text: String(opts.level) }));
      }
      who.appendChild(avatar);
      if (opts.name && !opts.compact) {
        who.appendChild(h('span', { class: 'fui-topbar__name', text: opts.name }));
      }
      who.addEventListener('click', () => this.emit('top:profile'));
      root.appendChild(who);
    }

    const rail = h('div', { class: 'fui-topbar__rail' });
    for (const res of opts.resources) {
      const cell = h('div', {
        class: 'fui-topbar__res',
        style: res.color ? { '--fui-top-ink': res.color } : {},
        attrs: { title: res.label ?? res.id },
      });

      const icon = h('span', { class: 'fui-topbar__icon' });
      if (res.art) {
        icon.classList.add('is-art');
        icon.style.backgroundImage = `var(--fui-img-${res.art})`;
      } else if (res.glyph) {
        icon.style.setProperty('--fui-glyph-src', `var(--fui-img-${res.glyph})`);
      }
      cell.appendChild(icon);

      const stack = h('div', { class: 'fui-topbar__stack' });
      const value = h('span', { class: 'fui-topbar__value fui-num' });
      stack.appendChild(value);
      this.values.set(res.id, value);

      if (res.refillIn != null) {
        const refill = h('span', { class: 'fui-topbar__refill fui-num' });
        stack.appendChild(refill);
        this.refills.set(res.id, refill);
        this.setRefill(res.id, res.refillIn);
      }
      cell.appendChild(stack);

      if (res.buyable) {
        const plus = h('button', {
          class: 'fui-topbar__plus',
          text: '+',
          attrs: { type: 'button', 'aria-label': `Get more ${res.label ?? res.id}` },
        });
        plus.addEventListener('click', () => this.emit('top:buy', res.id));
        cell.appendChild(plus);
      }
      rail.appendChild(cell);
      this.write(res.id, res.value, res.max);
    }
    root.appendChild(rail);

    if (opts.actions?.length) {
      const tools = h('div', { class: 'fui-topbar__actions' });
      for (const action of opts.actions) {
        const btn = h('button', {
          class: 'fui-topbar__action',
          style: { '--fui-glyph-src': `var(--fui-img-${action.glyph})` },
          attrs: { type: 'button', 'aria-label': action.label ?? action.id },
        });
        if (action.badge != null) {
          btn.appendChild(
            h('span', { class: 'fui-topbar__badge fui-num', text: String(action.badge) }),
          );
        }
        btn.addEventListener('click', () => this.emit('top:action', action.id));
        tools.appendChild(btn);
      }
      root.appendChild(tools);
    }
  }

  /** Update one resource's value (and optionally its cap) in place. */
  setResource(id: string, value: number, max?: number): this {
    const res = this.opts.resources.find((r) => r.id === id);
    if (res) {
      res.value = value;
      if (max != null) res.max = max;
    }
    this.write(id, value, max ?? res?.max);
    this.emit('top:change', { id, value });
    return this;
  }

  /** Update the "next tick in" readout under a regenerating resource. */
  setRefill(id: string, seconds: number): this {
    const el = this.refills.get(id);
    if (!el) return this;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    el.textContent = seconds > 0 ? `${m}:${String(s).padStart(2, '0')}` : 'Full';
    return this;
  }

  private write(id: string, value: number, max?: number): void {
    const el = this.values.get(id);
    if (!el) return;
    el.textContent = max != null ? `${commas(value)}/${commas(max)}` : abbreviate(value);
    el.title = commas(value);
    el.classList.toggle('is-capped', max != null && value >= max);
  }
}
