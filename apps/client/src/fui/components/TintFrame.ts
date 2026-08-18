// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, append, clamp, type Child } from '../core/dom.ts';

/** How the ornament's centre is treated. */
export type TintFrameFill =
  /** Ring only — whatever sits behind shows through. */
  | 'hollow'
  /** Translucent wash, so art behind still reads. */
  | 'scrim'
  /** Opaque centre. */
  | 'solid'
  /** Opaque centre with a faded edge. */
  | 'soft';

const SUFFIX: Record<TintFrameFill, string> = {
  hollow: '',
  scrim: '-scrim',
  solid: '-solid',
  soft: '-soft',
};

/** The ornament reads as this rarity when `rarity` is set instead of `tint`. */
const RARITY_TINT: Record<Rarity, string> = {
  common: 'var(--fui-rarity-common)',
  uncommon: 'var(--fui-rarity-uncommon)',
  rare: 'var(--fui-rarity-rare)',
  epic: 'var(--fui-rarity-epic)',
  legendary: 'var(--fui-rarity-legendary)',
  mythic: 'var(--fui-rarity-mythic)',
};

export interface TintFrameOptions extends BaseOptions {
  /** Ornament shape, 1–32. Each is a different corner and edge treatment. */
  shape?: number;
  /** What happens inside the ring. Defaults to `hollow`. */
  fill?: TintFrameFill;
  /** Any CSS paint — a colour, a gradient, even an image. Defaults to gold. */
  tint?: string;
  /** Shortcut for `tint`: paints the ornament in a rarity colour. */
  rarity?: Rarity;
  /** Multiplier on the art's 32px corner. 1 draws at native pixel size. */
  scale?: number;
  /** Repeat mode for the stretched edges. `round` keeps the pixel grid exact. */
  repeat?: 'stretch' | 'round';
  /** Halo around the ornament in the tint colour. */
  glow?: boolean;
  /** Space between the ornament and the content. */
  pad?: number | string;
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  /** Height in pixels, or any CSS length such as `'60vh'`. */
  height?: number | string;
  /** Explicit asset id, overriding `shape` and `fill`. */
  art?: string;
  content?: Child | Child[];
}

/**
 * An ornamental border that takes its colour from CSS rather than from the file.
 *
 * The art is a pure-white silhouette, so it is drawn as a 9-sliced *mask* with
 * the tint painted underneath. One asset therefore serves every colour a game
 * needs — a grey common frame, a purple epic frame and a gold legendary frame
 * are the same 400-byte PNG. With 32 shapes and four centre treatments that is
 * 128 framings before you pick a colour at all.
 *
 *   new TintFrame({ shape: 7, rarity: 'legendary', content: card });
 *   new TintFrame({ shape: 13, fill: 'scrim', tint: 'var(--fui-accent)' });
 *   new TintFrame({ shape: 21, fill: 'solid', tint: 'linear-gradient(160deg,#ffd98a,#7a3d05)' });
 *
 * Browsers without `mask-border` (Firefox today) fall back to the untinted
 * white ornament, which still reads correctly on a dark surface.
 */
export class TintFrame extends FuiComponent<TintFrameOptions> {
  readonly inner: HTMLElement;
  private art: HTMLElement;

  constructor(opts: TintFrameOptions = {}) {
    const scale = opts.scale ?? 0.75;
    const tint = opts.tint ?? (opts.rarity ? RARITY_TINT[opts.rarity] : undefined);

    const root = h('div', {
      class: 'fui fui-tintframe',
      dataset: { fill: opts.fill ?? 'hollow' },
      style: {
        '--fui-tf-scale': String(scale),
        '--fui-tf-src': `var(--fui-img-${TintFrame.artId(opts)})`,
        ...(tint ? { '--fui-tf-tint': tint } : {}),
        ...(opts.repeat ? { '--fui-tf-repeat': opts.repeat } : {}),
        ...(opts.pad != null
          ? { '--fui-tf-pad': typeof opts.pad === 'number' ? `${opts.pad}px` : opts.pad }
          : {}),
        ...(opts.width != null
          ? { width: typeof opts.width === 'number' ? `${opts.width}px` : opts.width }
          : {}),
        ...(opts.height != null
          ? { height: typeof opts.height === 'number' ? `${opts.height}px` : opts.height }
          : {}),
      },
    });
    if (opts.glow) root.classList.add('fui-tintframe--glow');
    super(root, opts);

    this.art = h('div', { class: 'fui-tintframe__art', attrs: { 'aria-hidden': 'true' } });
    this.inner = h('div', { class: 'fui-tintframe__inner' });
    if (opts.content) {
      append(this.inner, ...(Array.isArray(opts.content) ? opts.content : [opts.content]));
    }
    append(root, this.art, this.inner);
  }

  /** Resolve `shape` + `fill` (or an explicit `art`) to a manifest asset id. */
  private static artId(opts: TintFrameOptions): string {
    if (opts.art) return opts.art;
    const n = String(clamp(Math.round(opts.shape ?? 1), 1, 32)).padStart(2, '0');
    return `deco-frame-${n}${SUFFIX[opts.fill ?? 'hollow']}`;
  }

  add(...children: Child[]): this {
    append(this.inner, ...children);
    return this;
  }

  /** Repaint the ornament. Accepts any CSS paint, gradients included. */
  setTint(tint: string): this {
    this.el.style.setProperty('--fui-tf-tint', tint);
    return this;
  }

  setRarity(rarity: Rarity): this {
    return this.setTint(RARITY_TINT[rarity]);
  }

  /** Swap the ornament without rebuilding the contents. */
  setShape(shape: number, fill?: TintFrameFill): this {
    const next = { ...this.opts, shape, fill: fill ?? this.opts.fill };
    this.el.dataset.fill = next.fill ?? 'hollow';
    this.el.style.setProperty('--fui-tf-src', `var(--fui-img-${TintFrame.artId(next)})`);
    this.opts = next;
    return this;
  }
}
