// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, append, type Child } from '../core/dom.ts';

export interface EmptyStateOptions extends BaseOptions {
  /** Glyph asset id drawn large above the title. */
  glyph?: string;
  title: string;
  /** One or two lines saying what to do about it. */
  message?: string;
  /** Label for the call-to-action button. Emits `empty:action` when pressed. */
  action?: string;
  /** Anything extra below the message — a second button, a hint row. */
  extra?: Child | Child[];
  size?: 'sm' | 'md';
}

/**
 * The panel a list shows when it has nothing in it — an empty mailbox, a clan
 * with no applicants, a filter that matched no champions.
 *
 *   new EmptyState({
 *     glyph: 'glyph-broken-shackle',
 *     title: 'No champions match',
 *     message: 'Try clearing a filter or two.',
 *     action: 'Reset filters',
 *   });
 *
 * Worth building once rather than inlining: an empty list that just renders
 * nothing reads as a bug, and every list in a game eventually hits this state.
 */
export class EmptyState extends FuiComponent<EmptyStateOptions> {
  constructor(opts: EmptyStateOptions) {
    const root = h('div', { class: 'fui fui-empty', dataset: { size: opts.size ?? 'md' } });
    super(root, opts);

    if (opts.glyph) {
      root.appendChild(
        h('span', {
          class: 'fui-empty__glyph',
          style: { '--fui-glyph-src': `var(--fui-img-${opts.glyph})` },
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }
    root.appendChild(h('p', { class: 'fui-empty__title fui-title', text: opts.title }));
    if (opts.message) {
      root.appendChild(h('p', { class: 'fui-empty__message fui-body', text: opts.message }));
    }
    if (opts.action) {
      const btn = h('button', {
        class: 'fui-empty__action',
        text: opts.action,
        attrs: { type: 'button' },
      });
      btn.addEventListener('click', () => this.emit('empty:action'));
      root.appendChild(btn);
    }
    if (opts.extra) append(root, ...(Array.isArray(opts.extra) ? opts.extra : [opts.extra]));
  }
}
