// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, append, type Child } from '../core/dom.ts';

export type PanelVariant = 'default' | 'alt' | 'surface' | 'bare';

export interface PanelOptions extends BaseOptions {
  /** Heading shown in the panel's title bar. Omit for a chrome-less panel. */
  title?: string;
  /** Small caption under the title. */
  subtitle?: string;
  /**
   * `default` — the theme's primary window art.
   * `alt`     — the secondary/ornate window art.
   * `surface` — a flat inner surface for lists and nested content.
   * `bare`    — no art at all; useful when you only want the layout.
   */
  variant?: PanelVariant;
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  /** Height in pixels, or any CSS length such as `'60vh'`. */
  height?: number | string;
  /** Render a close button in the title bar; emits `close`. */
  closable?: boolean;
  /** Make the body scroll instead of growing. */
  scroll?: boolean;
  /** Initial body content. */
  content?: Child | Child[];
  /** Footer content, typically a row of buttons. */
  footer?: Child | Child[];
  /** Extra padding override for the body, e.g. `'0'` for edge-to-edge lists. */
  bodyPad?: string;
}

/**
 * The workhorse window: a 9-sliced fill layer, an optional ornament frame drawn
 * over it, and a title / body / footer layout.
 *
 *   const p = new Panel({ title: 'Inventory', width: 520, closable: true });
 *   p.on('panel:close', () => p.destroy());
 *   p.setContent(myGrid.el);
 */
export class Panel extends FuiComponent<PanelOptions> {
  readonly body: HTMLElement;
  readonly head: HTMLElement | null = null;
  readonly foot: HTMLElement | null = null;

  constructor(opts: PanelOptions = {}) {
    const variant = opts.variant ?? 'default';

    const body = h('div', {
      class: `fui-panel__body${opts.scroll ? ' fui-scroll' : ''}`,
      style: opts.bodyPad ? { padding: opts.bodyPad } : undefined,
    });

    const root = h('div', {
      class: 'fui fui-panel',
      dataset: { variant },
      style: {
        ...(opts.width != null
          ? { width: typeof opts.width === 'number' ? `${opts.width}px` : opts.width }
          : {}),
        ...(opts.height != null
          ? { height: typeof opts.height === 'number' ? `${opts.height}px` : opts.height }
          : {}),
      },
    });

    super(root, opts);

    this.body = body;

    // Art layers first, so everything else stacks above them.
    root.appendChild(h('div', { class: 'fui-panel__fill', attrs: { 'aria-hidden': 'true' } }));
    if (variant === 'default' || variant === 'alt') {
      root.appendChild(h('div', { class: 'fui-panel__frame', attrs: { 'aria-hidden': 'true' } }));
    }

    if (opts.title) {
      const title = h('h2', { class: 'fui-panel__title fui-title', text: opts.title });
      const heading = h(
        'div',
        { class: 'fui-panel__heading' },
        title,
        opts.subtitle && h('p', { class: 'fui-panel__subtitle fui-label', text: opts.subtitle }),
      );
      const head = h('header', { class: 'fui-panel__head' }, heading);

      if (opts.closable) {
        head.appendChild(
          h('button', {
            class: 'fui-panel__close',
            attrs: { type: 'button', 'aria-label': 'Close' },
            on: { click: () => this.emit('panel:close') },
          }),
        );
      }
      root.appendChild(head);
      (this as { head: HTMLElement | null }).head = head;
    }

    root.appendChild(body);
    if (opts.content) this.setContent(opts.content);

    if (opts.footer) {
      const foot = h('footer', { class: 'fui-panel__foot' });
      append(foot, ...(Array.isArray(opts.footer) ? opts.footer : [opts.footer]));
      root.appendChild(foot);
      (this as { foot: HTMLElement | null }).foot = foot;
    }
  }

  /** Replace the body's contents. */
  setContent(...children: (Child | Child[])[]): this {
    clear(this.body);
    append(this.body, ...(children.flat() as Child[]));
    return this;
  }

  /** Append to the body without clearing it. */
  add(...children: Child[]): this {
    append(this.body, ...children);
    return this;
  }

  setTitle(text: string): this {
    const el = this.el.querySelector('.fui-panel__title');
    if (el) el.textContent = text;
    return this;
  }
}
