// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface LoadingDotsOptions extends BaseOptions {
  /** How many dots ride the wave. */
  count?: number;
  /** Diameter of one dot in pixels. */
  size?: number;
  /** Any CSS colour. Defaults to the theme accent. */
  color?: string;
  /** Text shown before the dots — "Matchmaking", "Summoning". */
  label?: string;
  /** `wave` bounces, `pulse` fades, `orbit` spins them around a point. */
  variant?: 'wave' | 'pulse' | 'orbit';
}

/**
 * An inline busy indicator for waits too short to deserve a loading screen —
 * matchmaking, a summon animation warming up, a shop request in flight.
 *
 *   new LoadingDots({ label: 'Matchmaking' });
 *   new LoadingDots({ variant: 'orbit', size: 8, color: 'var(--fui-gold)' });
 *
 * Pure CSS animation with a staggered delay per dot, so it costs no timers and
 * stops dead under `prefers-reduced-motion`.
 */
export class LoadingDots extends FuiComponent<LoadingDotsOptions> {
  constructor(opts: LoadingDotsOptions = {}) {
    const count = opts.count ?? 3;
    const size = opts.size ?? 9;
    const root = h('div', {
      class: 'fui fui-dots',
      dataset: { variant: opts.variant ?? 'wave' },
      style: {
        '--fui-dot-size': `${size}px`,
        ...(opts.color ? { '--fui-dot-color': opts.color } : {}),
      },
      attrs: { role: 'status', 'aria-label': opts.label ?? 'Loading' },
    });
    super(root, opts);

    if (opts.label) root.appendChild(h('span', { class: 'fui-dots__label', text: opts.label }));
    const ring = h('span', {
      class: 'fui-dots__ring',
      // Each dot's stagger is derived in CSS from its index over the count, so
      // the spacing stays even whatever the count and whatever each variant's
      // cycle length happens to be.
      style: { '--fui-dot-n': String(count) },
      attrs: { 'aria-hidden': 'true' },
    });
    for (let i = 0; i < count; i++) {
      ring.appendChild(h('span', { class: 'fui-dots__dot', style: { '--fui-dot-i': String(i) } }));
    }
    root.appendChild(ring);
  }
}
