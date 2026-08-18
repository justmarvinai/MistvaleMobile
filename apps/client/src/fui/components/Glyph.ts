// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export type GlyphTone =
  | 'inherit'
  | 'ink'
  | 'dim'
  | 'accent'
  | 'gold'
  | 'danger'
  | 'success'
  | 'health'
  | 'mana';

export interface GlyphOptions extends BaseOptions {
  /** Glyph asset id, e.g. `'glyph-crossed-swords'`. */
  glyph: string;
  /** Pixel size of the square box. Defaults to 24. */
  size?: number;
  /** Named colour, or `inherit` to take the surrounding text colour. */
  tone?: GlyphTone;
  /** Any CSS colour, overriding `tone`. */
  color?: string;
  /** Accessible name; also the `title` tooltip. */
  label?: string;
  /** Soft halo in the current colour — ready states, active nav. */
  glow?: boolean;
}

/**
 * A single-colour vector glyph, drawn as a CSS mask so it takes its colour from
 * the page rather than from the file.
 *
 * That is the whole point of this component: one SVG serves every state. The
 * same `glyph-crossed-swords` renders grey in a disabled row, gold on a
 * legendary card and red on a warning, with no extra assets and no recolouring
 * pipeline.
 *
 *   new Glyph({ glyph: 'glyph-crossed-swords', size: 28, tone: 'gold' });
 *   new Glyph({ glyph: 'glyph-shield-block', color: 'var(--fui-rarity-epic)' });
 */
export class Glyph extends FuiComponent<GlyphOptions> {
  constructor(opts: GlyphOptions) {
    const size = opts.size ?? 24;
    const root = h('span', {
      class: 'fui fui-glyph',
      dataset: { tone: opts.tone ?? 'inherit' },
      style: {
        width: `${size}px`,
        height: `${size}px`,
        '--fui-glyph-src': `var(--fui-img-${opts.glyph})`,
        ...(opts.color ? { color: opts.color } : {}),
      },
      attrs: {
        role: opts.label ? 'img' : 'presentation',
        'aria-label': opts.label,
        title: opts.label,
      },
    });
    if (opts.glow) root.classList.add('fui-glyph--glow');
    super(root, opts);
  }

  setGlyph(id: string): this {
    this.el.style.setProperty('--fui-glyph-src', `var(--fui-img-${id})`);
    return this;
  }

  setTone(tone: GlyphTone): this {
    this.el.dataset.tone = tone;
    return this;
  }

  setColor(color: string | null): this {
    if (color) this.el.style.color = color;
    else this.el.style.removeProperty('color');
    return this;
  }
}
