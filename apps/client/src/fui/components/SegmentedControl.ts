// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface Segment {
  /** Stable value emitted on selection. */
  value: string;
  label: string;
  /** Glyph asset id drawn before the label. */
  glyph?: string;
  /** Small count bubble — unread mail, owned shards, filter hits. */
  badge?: number | string;
  disabled?: boolean;
}

export interface SegmentedControlOptions extends BaseOptions {
  segments: Segment[];
  /** Initially selected value. Defaults to the first enabled segment. */
  value?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Stretch every segment to an equal share of the width. */
  block?: boolean;
}

/**
 * A one-of-N switch where every option stays visible — the pattern mobile RPGs
 * use for roster filters, shop currencies and difficulty tiers, because it
 * costs one tap instead of the two a dropdown costs.
 *
 *   const diff = new SegmentedControl({
 *     segments: [
 *       { value: 'normal', label: 'Normal' },
 *       { value: 'hard', label: 'Hard' },
 *       { value: 'brutal', label: 'Brutal', badge: 'NEW' },
 *     ],
 *     value: 'hard',
 *   });
 *   diff.on<string>('segment:change', (v) => loadStages(v));
 */
export class SegmentedControl extends FuiComponent<SegmentedControlOptions> {
  private buttons = new Map<string, HTMLButtonElement>();
  private value: string;
  private observer: ResizeObserver | null = null;

  constructor(opts: SegmentedControlOptions) {
    const root = h('div', {
      class: 'fui fui-seg',
      dataset: { size: opts.size ?? 'md' },
      attrs: { role: 'tablist' },
    });
    if (opts.block) root.classList.add('fui-seg--block');
    super(root, opts);

    const first = opts.segments.find((s) => !s.disabled);
    this.value = opts.value ?? first?.value ?? '';

    root.appendChild(h('span', { class: 'fui-seg__thumb', attrs: { 'aria-hidden': 'true' } }));

    for (const seg of opts.segments) {
      const btn = h('button', {
        class: 'fui-seg__item',
        attrs: { type: 'button', role: 'tab', disabled: seg.disabled, 'data-value': seg.value },
      });
      if (seg.glyph) {
        btn.appendChild(
          h('span', {
            class: 'fui-seg__glyph',
            style: { '--fui-glyph-src': `var(--fui-img-${seg.glyph})` },
          }),
        );
      }
      btn.appendChild(h('span', { class: 'fui-seg__text', text: seg.label }));
      if (seg.badge != null) {
        btn.appendChild(h('span', { class: 'fui-seg__badge fui-num', text: String(seg.badge) }));
      }
      if (!seg.disabled) btn.addEventListener('click', () => this.select(seg.value));
      this.buttons.set(seg.value, btn);
      root.appendChild(btn);
    }
    this.paint();

    // Segments are only equal width when `block` is set, so the thumb has to be
    // measured rather than divided. Observing the root covers mounting, layout
    // changes and late-loading fonts in one callback.
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => this.position());
      this.observer.observe(root);
      this.onDestroy(() => this.observer?.disconnect());
    }
  }

  get(): string {
    return this.value;
  }

  select(value: string, opts?: { silent?: boolean }): this {
    if (!this.buttons.has(value) || value === this.value) return this;
    this.value = value;
    this.paint();
    if (!opts?.silent) this.emit('segment:change', value);
    return this;
  }

  private paint(): void {
    let index = 0;
    let i = 0;
    for (const [value, btn] of this.buttons) {
      const on = value === this.value;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      if (on) index = i;
      i++;
    }
    // The thumb slides between segments instead of each one painting its own
    // background, so the selection reads as one object moving.
    // These two feed the equal-share fallback used before the first measure and
    // in server-rendered markup, where there is no layout to measure.
    this.el.style.setProperty('--fui-seg-count', String(this.buttons.size));
    this.el.style.setProperty('--fui-seg-index', String(index));
    this.position();
  }

  /** Size and place the thumb over the selected segment's real box. */
  private position(): void {
    const btn = this.buttons.get(this.value);
    if (!btn || !btn.offsetWidth) return;
    this.el.style.setProperty('--fui-seg-w', `${btn.offsetWidth}px`);
    this.el.style.setProperty('--fui-seg-x', `${btn.offsetLeft - 3}px`);
    this.el.classList.add('is-measured');
  }
}
