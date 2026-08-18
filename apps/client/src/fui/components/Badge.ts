// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, abbreviate } from '../core/dom.ts';

export interface BadgeOptions extends BaseOptions {
  text?: string;
  /** Numeric count — abbreviated past 10,000 (`12.5K`). */
  count?: number;
  /** Asset id for a leading icon. */
  icon?: string;
  tone?: 'neutral' | 'gold' | 'danger' | 'success' | 'accent' | 'rare' | 'epic' | 'legendary';
  size?: 'sm' | 'md';
  /** Render as a bare dot — unread markers, "new" pips. */
  dot?: boolean;
  /** Draw attention with a slow pulse. */
  pulse?: boolean;
}

/**
 * Small status pill: quantity counts, "NEW" flags, buff stacks, currency chips,
 * difficulty tags.
 *
 *   new Badge({ icon: 'icon-coins', count: 12500, tone: 'gold' });
 *   new Badge({ text: 'NEW', tone: 'danger', pulse: true });
 */
export class Badge extends FuiComponent<BadgeOptions> {
  private textEl: HTMLElement | null = null;

  constructor(opts: BadgeOptions = {}) {
    const root = h('span', {
      class: 'fui fui-badge',
      dataset: { tone: opts.tone ?? 'neutral', size: opts.size ?? 'md' },
    });
    super(root, opts);

    if (opts.dot) {
      root.classList.add('fui-badge--dot');
    } else {
      if (opts.icon) {
        root.appendChild(
          h('span', {
            class: 'fui-badge__icon',
            style: { backgroundImage: `var(--fui-img-${opts.icon})` },
            attrs: { 'aria-hidden': 'true' },
          }),
        );
      }
      this.textEl = h('span', {
        class: 'fui-badge__text fui-num',
        text: opts.text ?? (opts.count != null ? abbreviate(opts.count) : ''),
      });
      root.appendChild(this.textEl);
    }
    if (opts.pulse) root.classList.add('fui-badge--pulse');
  }

  setCount(n: number): this {
    if (this.textEl) this.textEl.textContent = abbreviate(n);
    return this;
  }

  setText(text: string): this {
    if (this.textEl) this.textEl.textContent = text;
    return this;
  }
}
