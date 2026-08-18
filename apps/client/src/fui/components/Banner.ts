// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface BannerOptions extends BaseOptions {
  text: string;
  /** Asset id of an icon rendered before the text. */
  icon?: string;
  /** Small trailing note — level, distance, faction. */
  meta?: string;
  /** `plain` is a flat nameplate, `arrow` uses the chevron ribbon art. */
  variant?: 'plain' | 'arrow' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  /** Tint the text with a rarity / faction colour. */
  tone?: 'default' | 'gold' | 'danger' | 'accent';
}

/**
 * A nameplate ribbon — section headers, unit names, chapter titles, objective
 * markers.
 *
 *   new Banner({ text: 'Ashfall Keep', icon: 'icon-star', meta: 'Lv 24' });
 */
export class Banner extends FuiComponent<BannerOptions> {
  private textEl: HTMLElement;

  constructor(opts: BannerOptions) {
    const root = h('div', {
      class: 'fui fui-banner',
      dataset: {
        variant: opts.variant ?? 'plain',
        size: opts.size ?? 'md',
        tone: opts.tone ?? 'default',
      },
      style:
        opts.width != null
          ? { width: typeof opts.width === 'number' ? `${opts.width}px` : opts.width }
          : undefined,
    });
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-banner__art', attrs: { 'aria-hidden': 'true' } }));
    if (opts.icon) {
      root.appendChild(
        h('span', {
          class: 'fui-banner__icon',
          style: { backgroundImage: `var(--fui-img-${opts.icon})` },
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }
    this.textEl = h('span', { class: 'fui-banner__text fui-title', text: opts.text });
    root.appendChild(this.textEl);
    if (opts.meta) root.appendChild(h('span', { class: 'fui-banner__meta fui-num', text: opts.meta }));
  }

  setText(text: string): this {
    this.textEl.textContent = text;
    return this;
  }
}
