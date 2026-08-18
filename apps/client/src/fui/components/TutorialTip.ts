// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export type TipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TutorialTipOptions extends BaseOptions {
  /** The instruction itself. */
  text: string;
  /** Optional heading above the text. */
  title?: string;
  /** Which side of the anchor the card sits on. */
  placement?: TipPlacement;
  /** Element (or selector) the tip points at. It gets spotlit. */
  anchor?: Element | string;
  /** Current step, 1-based — renders "2 / 5" and a progress row of pips. */
  step?: number;
  /** Total steps in the sequence. */
  steps?: number;
  /** Label for the advance button. Defaults to "Got it" on the last step. */
  nextLabel?: string;
  /** Show a skip link. Emits `tip:skip`. */
  skippable?: boolean;
  /** Dim everything except the anchor. */
  spotlight?: boolean;
}

/**
 * The coach mark a first-time-user flow is built from: a card pointing at one
 * control, everything else dimmed, with step counter and a skip out.
 *
 *   const tip = new TutorialTip({
 *     title: 'Your first summon',
 *     text: 'Tap here to open the portal and spend your starter scrolls.',
 *     anchor: '#summon-button',
 *     step: 1,
 *     steps: 4,
 *     spotlight: true,
 *     mount: document.body,
 *   });
 *   tip.on('tip:next', () => showStep(2));
 *
 * The spotlight is a single box-shadow spread over the whole viewport with a
 * hole cut where the anchor is, so it costs one element and no canvas.
 */
export class TutorialTip extends FuiComponent<TutorialTipOptions> {
  private card: HTMLElement;
  private hole: HTMLElement | null = null;
  private anchor: Element | string | null = null;
  private observer: ResizeObserver | null = null;

  constructor(opts: TutorialTipOptions) {
    const root = h('div', {
      class: 'fui fui-tip',
      dataset: { placement: opts.placement ?? 'bottom' },
      attrs: { role: 'dialog', 'aria-label': opts.title ?? 'Tutorial' },
    });
    super(root, opts);

    if (opts.spotlight) {
      this.hole = h('div', { class: 'fui-tip__hole', attrs: { 'aria-hidden': 'true' } });
      root.appendChild(this.hole);
    }

    this.card = h('div', { class: 'fui-tip__card' });
    this.card.appendChild(h('span', { class: 'fui-tip__arrow', attrs: { 'aria-hidden': 'true' } }));
    if (opts.title) {
      this.card.appendChild(h('p', { class: 'fui-tip__title fui-title', text: opts.title }));
    }
    this.card.appendChild(h('p', { class: 'fui-tip__text fui-body', text: opts.text }));

    const foot = h('div', { class: 'fui-tip__foot' });
    if (opts.steps) {
      const pips = h('div', { class: 'fui-tip__pips' });
      for (let i = 1; i <= opts.steps; i++) {
        const pip = h('span', { class: 'fui-tip__pip' });
        if (i === (opts.step ?? 1)) pip.classList.add('is-on');
        if (i < (opts.step ?? 1)) pip.classList.add('is-done');
        pips.appendChild(pip);
      }
      foot.appendChild(pips);
      foot.appendChild(
        h('span', { class: 'fui-tip__count fui-num', text: `${opts.step ?? 1} / ${opts.steps}` }),
      );
    }

    if (opts.skippable) {
      const skip = h('button', { class: 'fui-tip__skip', text: 'Skip', attrs: { type: 'button' } });
      skip.addEventListener('click', () => this.emit('tip:skip'));
      foot.appendChild(skip);
    }

    const last = opts.steps != null && (opts.step ?? 1) >= opts.steps;
    const next = h('button', {
      class: 'fui-tip__next',
      text: opts.nextLabel ?? (last ? 'Got it' : 'Next'),
      attrs: { type: 'button' },
    });
    next.addEventListener('click', () => this.emit(last ? 'tip:done' : 'tip:next', opts.step ?? 1));
    foot.appendChild(next);

    this.card.appendChild(foot);
    root.appendChild(this.card);

    if (opts.anchor) this.pointAt(opts.anchor);

    // The anchor cannot be measured until both it and this tip are laid out,
    // and a tip is often constructed before either is in the document. Watching
    // the root re-runs the maths on mount and on every later layout change.
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => this.position());
      this.observer.observe(root);
      this.onDestroy(() => this.observer?.disconnect());
    }
  }

  /** Point the tip at a new element. Repositioning happens automatically. */
  pointAt(anchor: Element | string): this {
    this.anchor = anchor;
    this.position();
    return this;
  }

  /** Measure the anchor and move the card and spotlight hole onto it. */
  private position(): void {
    if (!this.anchor) return;
    const el =
      typeof this.anchor === 'string'
        ? this.el.ownerDocument.querySelector(this.anchor)
        : this.anchor;
    if (!el || typeof el.getBoundingClientRect !== 'function') return;

    const r = el.getBoundingClientRect();
    // Both rects are viewport-relative, but a `position: fixed` element is laid
    // out against the nearest transformed ancestor when there is one. Since the
    // root is `inset: 0`, its own rect *is* that containing block — subtracting
    // it works whether the block is the viewport or a transformed parent.
    const own = this.el.getBoundingClientRect();
    if (!r.width && !r.height) return;

    this.el.style.setProperty('--fui-tip-x', `${r.left + r.width / 2 - own.left}px`);
    this.el.style.setProperty('--fui-tip-y', `${r.top + r.height / 2 - own.top}px`);
    this.el.style.setProperty('--fui-tip-w', `${r.width}px`);
    this.el.style.setProperty('--fui-tip-h', `${r.height}px`);
  }
}
