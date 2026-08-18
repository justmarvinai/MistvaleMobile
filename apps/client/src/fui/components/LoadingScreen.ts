// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp } from '../core/dom.ts';

export interface LoadingScreenOptions extends BaseOptions {
  title?: string;
  /** Gameplay tips cycled while loading. */
  tips?: string[];
  /** Seconds between tip rotations. Default 5. */
  tipInterval?: number;
  /** Backdrop image URL; defaults to the theme's painted backdrop. */
  background?: string;
  /** Current progress 0–1. Omit for an indeterminate spinner. */
  progress?: number;
  /** Status line under the bar, e.g. `'Streaming terrain…'`. */
  status?: string;
  fullscreen?: boolean;
}

/**
 * The loading screen: backdrop, progress bar, rotating tips and a status line.
 *
 * Emits `loading:done` once progress reaches 1.
 *
 *   const load = new LoadingScreen({ title: 'Entering Emberwood Vale',
 *     tips: ['Blocking reduces stagger by 40%.'] });
 *   load.setProgress(0.4, 'Loading assets…');
 */
export class LoadingScreen extends FuiComponent<LoadingScreenOptions> {
  private fill: HTMLElement;
  private pctEl: HTMLElement;
  private statusEl: HTMLElement;
  private tipEl: HTMLElement;
  private tipTimer: ReturnType<typeof setInterval> | null = null;
  private tipIndex = 0;
  private done = false;

  constructor(opts: LoadingScreenOptions = {}) {
    const root = h('div', { class: 'fui fui-loading' });
    if (opts.fullscreen !== false) root.classList.add('fui-loading--fullscreen');
    if (opts.progress == null) root.classList.add('is-indeterminate');
    super(root, opts);

    const bg = h('div', { class: 'fui-loading__bg', attrs: { 'aria-hidden': 'true' } });
    if (opts.background) bg.style.backgroundImage = `url("${opts.background}")`;
    root.appendChild(bg);
    root.appendChild(h('div', { class: 'fui-loading__scrim', attrs: { 'aria-hidden': 'true' } }));

    const stage = h('div', { class: 'fui-loading__stage' });
    stage.appendChild(
      h('h2', { class: 'fui-loading__title fui-title', text: opts.title ?? 'Loading' }),
    );

    const track = h('div', { class: 'fui-loading__track' });
    this.fill = h('div', { class: 'fui-loading__fill' });
    track.appendChild(this.fill);
    stage.appendChild(track);

    const meta = h('div', { class: 'fui-loading__meta' });
    this.statusEl = h('span', { class: 'fui-loading__status', text: opts.status ?? '' });
    this.pctEl = h('span', { class: 'fui-loading__pct fui-num' });
    meta.append(this.statusEl, this.pctEl);
    stage.appendChild(meta);
    root.appendChild(stage);

    this.tipEl = h('p', { class: 'fui-loading__tip fui-body' });
    root.appendChild(h('div', { class: 'fui-loading__tipbox' }, this.tipEl));

    if (opts.tips?.length) {
      this.showTip(0);
      this.tipTimer = setInterval(
        () => this.showTip(this.tipIndex + 1),
        (opts.tipInterval ?? 5) * 1000,
      );
      this.onDestroy(() => this.tipTimer && clearInterval(this.tipTimer));
    }

    this.setProgress(opts.progress ?? 0, opts.status);
  }

  /** Update progress (0–1) and, optionally, the status line. */
  setProgress(value: number, status?: string): this {
    const pct = clamp(value, 0, 1);
    this.el.classList.remove('is-indeterminate');
    this.fill.style.width = `${pct * 100}%`;
    this.pctEl.textContent = `${Math.round(pct * 100)}%`;
    if (status != null) this.statusEl.textContent = status;

    if (pct >= 1 && !this.done) {
      this.done = true;
      this.emit('loading:done');
    }
    return this;
  }

  /** Show a specific tip, wrapping around the list. */
  showTip(index: number): this {
    const tips = this.opts.tips ?? [];
    if (!tips.length) return this;
    this.tipIndex = ((index % tips.length) + tips.length) % tips.length;
    this.tipEl.textContent = tips[this.tipIndex];
    this.tipEl.classList.remove('is-in');
    void this.tipEl.offsetWidth;
    this.tipEl.classList.add('is-in');
    return this;
  }

  /** Fade out and remove — call once your assets are ready. */
  dismiss(): this {
    this.el.classList.add('is-leaving');
    this.el.addEventListener('transitionend', () => this.destroy(), { once: true });
    return this;
  }
}
