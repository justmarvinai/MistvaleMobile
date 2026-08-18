// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, append, clear, clamp, commas, type Child } from '../core/dom.ts';

export interface TooltipStat {
  label: string;
  value: string | number;
  /** `good` renders green, `bad` red, `magic` the accent colour. */
  tone?: 'good' | 'bad' | 'magic' | 'plain';
}

export interface TooltipOptions extends BaseOptions {
  title?: string;
  rarity?: Rarity;
  /** Item class line, e.g. `'Two-Handed Sword'`. */
  subtitle?: string;
  /** Right-aligned slot line, e.g. `'Main Hand'`. */
  slotLabel?: string;
  stats?: TooltipStat[];
  /** Italic flavour text. */
  flavor?: string;
  /** Red requirement lines, e.g. `['Requires Level 30']`. */
  requires?: string[];
  /** Sell price, rendered with a coin icon. */
  price?: number;
  /** Keybind / action hint pinned to the bottom. */
  hint?: string;
  /** Arbitrary extra nodes appended to the body. */
  content?: Child | Child[];
  /** Width in pixels. */
  width?: number;
}

/**
 * The item tooltip — rarity-tinted title, stat lines, flavour text and price.
 *
 * Use it as a static card, or bind it to hover targets:
 *
 *   const tip = new Tooltip({ title: 'Emberfang', rarity: 'epic', ... });
 *   document.body.append(tip.el);
 *   tip.attach(slot.el);       // follows the cursor, hides on leave
 */
export class Tooltip extends FuiComponent<TooltipOptions> {
  private body: HTMLElement;

  constructor(opts: TooltipOptions = {}) {
    const root = h('div', {
      class: 'fui fui-tooltip',
      dataset: opts.rarity ? { rarity: opts.rarity } : undefined,
      style: { width: `${opts.width ?? 268}px` },
      attrs: { role: 'tooltip' },
    });
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-tooltip__fill', attrs: { 'aria-hidden': 'true' } }));
    this.body = h('div', { class: 'fui-tooltip__body' });
    root.appendChild(this.body);
    this.render(opts);
  }

  /** Rebuild the contents with a new payload — reuse one tooltip for a whole grid. */
  render(opts: TooltipOptions): this {
    this.opts = { ...this.opts, ...opts };
    if (opts.rarity) this.el.dataset.rarity = opts.rarity;
    clear(this.body);

    if (opts.title) {
      this.body.appendChild(h('h3', { class: 'fui-tooltip__title fui-title', text: opts.title }));
    }
    if (opts.subtitle || opts.slotLabel) {
      this.body.appendChild(
        h(
          'div',
          { class: 'fui-tooltip__meta' },
          opts.subtitle && h('span', { text: opts.subtitle }),
          opts.slotLabel && h('span', { class: 'fui-tooltip__slot', text: opts.slotLabel }),
        ),
      );
    }
    if (opts.stats?.length) {
      const list = h('ul', { class: 'fui-tooltip__stats' });
      for (const s of opts.stats) {
        list.appendChild(
          h(
            'li',
            { dataset: { tone: s.tone ?? 'plain' } },
            h('span', { class: 'fui-tooltip__stat-label', text: s.label }),
            h('span', { class: 'fui-tooltip__stat-value fui-num', text: String(s.value) }),
          ),
        );
      }
      this.body.appendChild(list);
    }
    if (opts.requires?.length) {
      const req = h('ul', { class: 'fui-tooltip__requires' });
      for (const r of opts.requires) req.appendChild(h('li', { text: r }));
      this.body.appendChild(req);
    }
    if (opts.flavor) {
      this.body.appendChild(h('p', { class: 'fui-tooltip__flavor', text: opts.flavor }));
    }
    if (opts.content) {
      append(this.body, ...(Array.isArray(opts.content) ? opts.content : [opts.content]));
    }
    if (opts.price != null) {
      this.body.appendChild(
        h(
          'div',
          { class: 'fui-tooltip__price' },
          h('span', { class: 'fui-tooltip__coin', attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'fui-num', text: commas(opts.price) }),
        ),
      );
    }
    if (opts.hint) {
      this.body.appendChild(h('div', { class: 'fui-tooltip__hint', text: opts.hint }));
    }
    return this;
  }

  /** Position near a point, clamped to stay on screen. */
  showAt(x: number, y: number): this {
    this.el.classList.add('is-open');
    const { offsetWidth: w, offsetHeight: hgt } = this.el;
    const vw = this.el.ownerDocument.defaultView?.innerWidth ?? 1920;
    const vh = this.el.ownerDocument.defaultView?.innerHeight ?? 1080;
    this.el.style.left = `${clamp(x + 16, 8, Math.max(8, vw - w - 8))}px`;
    this.el.style.top = `${clamp(y + 16, 8, Math.max(8, vh - hgt - 8))}px`;
    return this;
  }

  hide(): this {
    this.el.classList.remove('is-open');
    return this;
  }

  /**
   * Follow the cursor while hovering `target`. Pass `payload` to swap contents
   * on entry, so a single tooltip instance can serve an entire inventory.
   */
  attach(target: HTMLElement, payload?: TooltipOptions | (() => TooltipOptions)): () => void {
    const enter = (ev: MouseEvent) => {
      if (payload) this.render(typeof payload === 'function' ? payload() : payload);
      this.showAt(ev.clientX, ev.clientY);
    };
    const move = (ev: MouseEvent) => this.showAt(ev.clientX, ev.clientY);
    const leave = () => this.hide();

    target.addEventListener('mouseenter', enter);
    target.addEventListener('mousemove', move);
    target.addEventListener('mouseleave', leave);

    const off = () => {
      target.removeEventListener('mouseenter', enter);
      target.removeEventListener('mousemove', move);
      target.removeEventListener('mouseleave', leave);
    };
    this.onDestroy(off);
    return off;
  }
}
