// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp } from '../core/dom.ts';

export interface SliderOptions extends BaseOptions {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  /** How the value is rendered: raw number, `%`, or a custom formatter. */
  format?: 'number' | 'percent' | ((v: number) => string);
  /** Asset id for a leading icon, e.g. a speaker or brightness glyph. */
  icon?: string;
  disabled?: boolean;
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  onInput?: (value: number) => void;
}

/**
 * Settings slider — volume, brightness, mouse sensitivity, difficulty scaling.
 * Emits `slider:input` continuously and `slider:change` on release.
 *
 *   new Slider({ label: 'Music', value: 70, format: 'percent',
 *                onInput: v => audio.setVolume(v / 100) });
 */
export class Slider extends FuiComponent<SliderOptions> {
  private input: HTMLInputElement;
  private valueEl: HTMLElement;
  private fill: HTMLElement;

  constructor(opts: SliderOptions = {}) {
    const min = opts.min ?? 0;
    const max = opts.max ?? 100;

    const root = h('div', {
      class: 'fui fui-slider',
      style:
        opts.width != null
          ? { width: typeof opts.width === 'number' ? `${opts.width}px` : opts.width }
          : undefined,
    });
    super(root, opts);

    const head = h('div', { class: 'fui-slider__head' });
    if (opts.icon) {
      head.appendChild(
        h('span', {
          class: 'fui-slider__icon',
          style: { backgroundImage: `var(--fui-img-${opts.icon})` },
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }
    if (opts.label) head.appendChild(h('span', { class: 'fui-slider__label', text: opts.label }));
    this.valueEl = h('span', { class: 'fui-slider__value fui-num' });
    head.appendChild(this.valueEl);
    root.appendChild(head);

    const track = h('div', { class: 'fui-slider__track' });
    this.fill = h('div', { class: 'fui-slider__fill' });
    this.input = h('input', {
      class: 'fui-slider__input',
      attrs: {
        type: 'range',
        min: String(min),
        max: String(max),
        step: String(opts.step ?? 1),
        disabled: opts.disabled,
        'aria-label': opts.label,
      },
    });
    this.input.value = String(clamp(opts.value ?? min, min, max));

    this.input.addEventListener('input', () => {
      this.paint();
      opts.onInput?.(this.value);
      this.emit('slider:input', this.value);
    });
    this.input.addEventListener('change', () => this.emit('slider:change', this.value));

    track.appendChild(this.fill);
    track.appendChild(this.input);
    root.appendChild(track);
    if (opts.disabled) root.classList.add('is-disabled');
    this.paint();
  }

  get value(): number {
    return Number(this.input.value);
  }

  set(value: number, opts?: { silent?: boolean }): this {
    this.input.value = String(value);
    this.paint();
    if (!opts?.silent) this.emit('slider:change', this.value);
    return this;
  }

  private paint(): void {
    const min = Number(this.input.min);
    const max = Number(this.input.max);
    const pct = max === min ? 0 : ((this.value - min) / (max - min)) * 100;
    this.fill.style.width = `${pct}%`;

    const fmt = this.opts.format ?? 'number';
    this.valueEl.textContent =
      typeof fmt === 'function'
        ? fmt(this.value)
        : fmt === 'percent'
          ? `${Math.round(pct)}%`
          : String(this.value);
  }
}
