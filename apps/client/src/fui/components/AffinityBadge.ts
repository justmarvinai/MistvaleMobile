// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface AffinityDef {
  id: string;
  label: string;
  /** Glyph asset id drawn inside the badge. */
  glyph: string;
  /** Badge colour. */
  color: string;
}

/**
 * The four-way affinity wheel collection games tend to share, plus the usual
 * elemental set. Pass your own `def` to use a different system entirely.
 */
export const AFFINITIES: Record<string, AffinityDef> = {
  magic: { id: 'magic', label: 'Magic', glyph: 'glyph-arcane-symbol', color: '#3b8ae0' },
  spirit: { id: 'spirit', label: 'Spirit', glyph: 'glyph-spirit-vortex', color: '#38d13c' },
  force: { id: 'force', label: 'Force', glyph: 'glyph-fist-punch', color: '#d84b3a' },
  void: { id: 'void', label: 'Void', glyph: 'glyph-celestial-body', color: '#a335ee' },
  fire: { id: 'fire', label: 'Fire', glyph: 'glyph-magic-flame', color: '#ff7a3d' },
  water: { id: 'water', label: 'Water', glyph: 'glyph-spirit-vortex', color: '#4ab6e0' },
  earth: { id: 'earth', label: 'Earth', glyph: 'glyph-nature-shield', color: '#8a9a3d' },
  light: { id: 'light', label: 'Light', glyph: 'glyph-holy-cross', color: '#f0cf85' },
  dark: { id: 'dark', label: 'Dark', glyph: 'glyph-skull-wreath', color: '#7d5bbd' },
};

export interface AffinityBadgeOptions extends BaseOptions {
  /** Key into `AFFINITIES`, or supply `def` for a custom system. */
  affinity?: string;
  def?: AffinityDef;
  /** Size in pixels. */
  size?: number;
  /** `chip` shows the label beside the glyph; `dot` is glyph-only. */
  variant?: 'dot' | 'chip';
  /** Draw the counter-relationship arrow used on battle previews. */
  advantage?: 'up' | 'down' | 'none';
}

/**
 * The element / affinity marker that sits on champion cards, battle previews
 * and team screens.
 *
 *   new AffinityBadge({ affinity: 'void' });
 *   new AffinityBadge({ affinity: 'force', variant: 'chip', advantage: 'up' });
 */
export class AffinityBadge extends FuiComponent<AffinityBadgeOptions> {
  readonly def: AffinityDef;

  constructor(opts: AffinityBadgeOptions = {}) {
    const def = opts.def ?? AFFINITIES[opts.affinity ?? 'magic'] ?? AFFINITIES.magic;
    const size = opts.size ?? 26;

    const root = h('span', {
      class: 'fui fui-affinity',
      dataset: { variant: opts.variant ?? 'dot', advantage: opts.advantage ?? 'none' },
      style: { '--fui-aff': def.color, '--fui-aff-size': `${size}px` },
      attrs: { title: def.label, 'aria-label': def.label },
    });
    super(root, opts);
    this.def = def;

    root.appendChild(
      h('span', {
        class: 'fui-affinity__glyph',
        style: { '--fui-glyph-src': `var(--fui-img-${def.glyph})` },
      }),
    );
    if ((opts.variant ?? 'dot') === 'chip') {
      root.appendChild(h('span', { class: 'fui-affinity__label', text: def.label }));
    }
    if (opts.advantage && opts.advantage !== 'none') {
      root.appendChild(h('span', { class: 'fui-affinity__arrow', attrs: { 'aria-hidden': 'true' } }));
    }
  }
}
