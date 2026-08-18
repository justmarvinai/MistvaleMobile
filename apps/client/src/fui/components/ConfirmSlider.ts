// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp } from '../core/dom.ts';

export interface ConfirmSliderOptions extends BaseOptions {
  /** Prompt shown on the track before the player commits. */
  label?: string;
  /** Text shown once the slider has been driven all the way across. */
  confirmLabel?: string;
  /** Glyph asset id drawn on the handle. */
  glyph?: string;
  /** Recolours the track for a destructive action. */
  tone?: 'accent' | 'gold' | 'danger';
  /** Fraction of the track that counts as committed. Defaults to 0.9. */
  threshold?: number;
  disabled?: boolean;
}

/**
 * Slide-to-confirm: a deliberate, hard-to-misfire commit for the actions a
 * player must not trigger by accident — spending premium currency, sacrificing
 * a champion to rank up another, leaving a clan, resetting a build.
 *
 *   const sell = new ConfirmSlider({ label: 'Slide to sacrifice', tone: 'danger' });
 *   sell.on('confirm:done', () => sacrifice());
 *
 * A modal with a Yes button gets tapped through on reflex; a gesture that has
 * to be completed does not. Emits `confirm:done` on commit and `confirm:cancel`
 * if the handle is released short of the threshold.
 */
export class ConfirmSlider extends FuiComponent<ConfirmSliderOptions> {
  private handle: HTMLElement;
  private track: HTMLElement;
  private progress = 0;
  private dragging = false;
  private done = false;

  constructor(opts: ConfirmSliderOptions = {}) {
    const root = h('div', {
      class: 'fui fui-confirm',
      dataset: { tone: opts.tone ?? 'accent' },
      attrs: {
        role: 'slider',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': 0,
        'aria-label': opts.label ?? 'Slide to confirm',
        tabindex: opts.disabled ? -1 : 0,
      },
    });
    if (opts.disabled) root.classList.add('is-disabled');
    super(root, opts);

    this.track = h('div', { class: 'fui-confirm__fill', attrs: { 'aria-hidden': 'true' } });
    const label = h('span', { class: 'fui-confirm__label', text: opts.label ?? 'Slide to confirm' });
    const doneLabel = h('span', {
      class: 'fui-confirm__done',
      text: opts.confirmLabel ?? 'Confirmed',
    });

    this.handle = h('span', {
      class: 'fui-confirm__handle',
      style: opts.glyph ? { '--fui-glyph-src': `var(--fui-img-${opts.glyph})` } : {},
      attrs: { 'aria-hidden': 'true' },
    });
    if (opts.glyph) this.handle.classList.add('has-glyph');

    root.append(this.track, label, doneLabel, this.handle);
    if (!opts.disabled) this.bind();
  }

  private bind(): void {
    const onDown = (ev: PointerEvent) => {
      if (this.done) return;
      this.dragging = true;
      this.el.classList.add('is-dragging');
      this.handle.setPointerCapture?.(ev.pointerId);
    };
    const onMove = (ev: PointerEvent) => {
      if (!this.dragging) return;
      const rect = this.el.getBoundingClientRect();
      const span = Math.max(1, rect.width - this.handle.offsetWidth);
      this.setProgress((ev.clientX - rect.left - this.handle.offsetWidth / 2) / span);
    };
    const onUp = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.el.classList.remove('is-dragging');
      if (this.progress >= (this.opts.threshold ?? 0.9)) this.complete();
      else {
        // Springs back rather than sticking, so a half-hearted drag is a no-op.
        this.setProgress(0);
        this.emit('confirm:cancel');
      }
    };

    this.handle.addEventListener('pointerdown', onDown);
    this.handle.addEventListener('pointermove', onMove);
    this.handle.addEventListener('pointerup', onUp);
    this.handle.addEventListener('pointercancel', onUp);

    // Keyboard commit, because a drag gesture alone is not operable by everyone.
    this.el.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (this.done) return;
      if (ev.key === 'ArrowRight') this.setProgress(this.progress + 0.2);
      else if (ev.key === 'ArrowLeft') this.setProgress(this.progress - 0.2);
      else if (ev.key === 'Enter' || ev.key === ' ') this.complete();
      else return;
      ev.preventDefault();
      if (this.progress >= (this.opts.threshold ?? 0.9)) this.complete();
    });
  }

  private setProgress(next: number): void {
    this.progress = clamp(next, 0, 1);
    this.el.style.setProperty('--fui-confirm-p', String(this.progress));
    this.el.setAttribute('aria-valuenow', String(Math.round(this.progress * 100)));
  }

  /** Drive the slider to the committed state and fire `confirm:done`. */
  complete(): this {
    if (this.done) return this;
    this.done = true;
    this.setProgress(1);
    this.el.classList.add('is-done');
    this.emit('confirm:done');
    return this;
  }

  /** Return to the untouched state, ready to be confirmed again. */
  reset(): this {
    this.done = false;
    this.el.classList.remove('is-done');
    this.setProgress(0);
    return this;
  }
}
