// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface DividerOptions extends BaseOptions {
  /** `art` uses the painted vine ornament; `rule` is a light etched line. */
  variant?: 'art' | 'rule';
  /** Optional caption sitting in the middle of a `rule`, e.g. `'Equipment'`. */
  label?: string;
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  /** Scales the ornament art. Default 0.34. */
  scale?: number;
}

/**
 * Section separator. The `art` variant is the pack's painted vine ornament;
 * `rule` is a lightweight etched line that can carry a caption.
 *
 *   new Divider();                              // vine ornament
 *   new Divider({ variant: 'rule', label: 'Equipment' });
 */
export class Divider extends FuiComponent<DividerOptions> {
  constructor(opts: DividerOptions = {}) {
    const variant = opts.variant ?? 'art';
    const root = h('div', {
      class: 'fui fui-divider',
      dataset: { variant },
      style: {
        ...(opts.width != null
          ? { width: typeof opts.width === 'number' ? `${opts.width}px` : opts.width }
          : {}),
        ...(opts.scale != null ? { '--fui-divider-scale': String(opts.scale) } : {}),
      },
      attrs: { role: 'separator' },
    });
    super(root, opts);

    if (variant === 'rule' && opts.label) {
      root.appendChild(h('span', { class: 'fui-divider__label fui-label', text: opts.label }));
    }
  }
}
