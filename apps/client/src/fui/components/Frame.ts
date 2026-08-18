// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, append, type Child } from '../core/dom.ts';

export interface FrameOptions extends BaseOptions {
  /** `md` uses the theme's large frame, `sm` its compact one. */
  size?: 'sm' | 'md';
  /** Override with any asset id from the manifest, e.g. `'frame-round-lg'`. */
  art?: string;
  /** Explicit 9-slice numbers when pairing with a custom `art`. */
  slice?: [number, number, number, number] | number;
  /** Multiplier applied to `slice` to get on-screen border width. */
  scale?: number;
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  /** Height in pixels, or any CSS length such as `'60vh'`. */
  height?: number | string;
  /** Padding between the frame ornament and the content. */
  pad?: number | string;
  content?: Child | Child[];
}

/**
 * A decorative border drawn *around* arbitrary content — a map view, a render
 * canvas, a portrait, a screenshot. Unlike Panel it paints no background, so
 * whatever sits behind shows through the middle.
 *
 *   new Frame({ content: myCanvas, width: 480, height: 320 });
 *   new Frame({ art: 'frame-tall', slice: 51, scale: 0.5, content: sidebar });
 */
export class Frame extends FuiComponent<FrameOptions> {
  readonly inner: HTMLElement;

  constructor(opts: FrameOptions = {}) {
    const root = h('div', {
      class: 'fui fui-frame',
      dataset: { size: opts.size ?? 'md' },
      style: {
        ...(opts.width != null
          ? { width: typeof opts.width === 'number' ? `${opts.width}px` : opts.width }
          : {}),
        ...(opts.height != null
          ? { height: typeof opts.height === 'number' ? `${opts.height}px` : opts.height }
          : {}),
        ...(opts.pad != null
          ? { '--fui-frame-pad': typeof opts.pad === 'number' ? `${opts.pad}px` : opts.pad }
          : {}),
      },
    });

    super(root, opts);

    const art = h('div', { class: 'fui-frame__art', attrs: { 'aria-hidden': 'true' } });
    if (opts.art) {
      const sl = opts.slice ?? 40;
      const nums = typeof sl === 'number' ? [sl, sl, sl, sl] : sl;
      const scale = opts.scale ?? 0.5;
      art.style.borderImageSource = `var(--fui-img-${opts.art})`;
      art.style.borderImageSlice = nums.join(' ');
      art.style.borderWidth = nums.map((n) => `${(n * scale).toFixed(2)}px`).join(' ');
    }
    root.appendChild(art);

    this.inner = h('div', { class: 'fui-frame__inner' });
    if (opts.content) append(this.inner, ...(Array.isArray(opts.content) ? opts.content : [opts.content]));
    root.appendChild(this.inner);
  }

  add(...children: Child[]): this {
    append(this.inner, ...children);
    return this;
  }
}
