// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface PortraitOptions extends BaseOptions {
  /** Image URL for the character art. */
  src?: string;
  /** Or an asset id from the manifest, e.g. `'silhouette-warrior-m'`. */
  art?: string;
  /** Square with an ornament frame, or a circular medallion. */
  shape?: 'square' | 'round';
  /** Size in pixels. */
  size?: number;
  /** Level pip in the lower corner. */
  level?: number;
  /** Small class/role icon in the upper corner, e.g. `'icon-sword'`. */
  badge?: string;
  name?: string;
  /**
   * `cover` crops to fill the frame (right for headshots); `contain` fits the
   * whole image inside it (right for full-body silhouettes and class art).
   */
  fit?: 'cover' | 'contain';
  /** Grey out and dim — dead, offline, unavailable. */
  inactive?: boolean;
  /** Pulsing halo, for the active turn or current speaker. */
  active?: boolean;
}

/**
 * Character portrait with frame, level pip and role badge. Used by unit frames,
 * party lists, dialogue and character select.
 *
 *   new Portrait({ art: 'silhouette-warrior-f', level: 24, badge: 'icon-sword' });
 */
export class Portrait extends FuiComponent<PortraitOptions> {
  private imgEl: HTMLElement;

  constructor(opts: PortraitOptions = {}) {
    const size = opts.size ?? 72;
    const root = h('div', {
      class: 'fui fui-portrait',
      dataset: { shape: opts.shape ?? 'square', fit: opts.fit ?? 'cover' },
      style: { width: `${size}px`, height: `${size}px` },
      attrs: { title: opts.name, 'aria-label': opts.name },
    });
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-portrait__fill', attrs: { 'aria-hidden': 'true' } }));

    this.imgEl = h('div', { class: 'fui-portrait__img' });
    if (opts.src) this.imgEl.style.backgroundImage = `url("${opts.src}")`;
    else if (opts.art) this.imgEl.style.backgroundImage = `var(--fui-img-${opts.art})`;
    root.appendChild(this.imgEl);

    root.appendChild(h('div', { class: 'fui-portrait__frame', attrs: { 'aria-hidden': 'true' } }));

    if (opts.badge) {
      root.appendChild(
        h('span', {
          class: 'fui-portrait__badge',
          style: { backgroundImage: `var(--fui-img-${opts.badge})` },
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }
    if (opts.level != null) {
      root.appendChild(h('span', { class: 'fui-portrait__level fui-num', text: String(opts.level) }));
    }
    if (opts.inactive) root.classList.add('fui-portrait--inactive');
    if (opts.active) root.classList.add('fui-portrait--active');
  }

  setImage(src: string): this {
    this.imgEl.style.backgroundImage = `url("${src}")`;
    return this;
  }

  setActive(active: boolean): this {
    this.el.classList.toggle('fui-portrait--active', active);
    return this;
  }

  setInactive(inactive: boolean): this {
    this.el.classList.toggle('fui-portrait--inactive', inactive);
    return this;
  }
}
