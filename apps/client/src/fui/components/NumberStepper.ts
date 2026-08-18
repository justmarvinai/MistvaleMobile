// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp, commas } from '../core/dom.ts';

export interface NumberStepperOptions extends BaseOptions {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  /** Show a MAX button that jumps straight to `max`. */
  maxButton?: boolean;
  /** Unit price — the stepper then shows a running total. */
  unitCost?: number;
  /** Currency glyph asset id shown beside the total. */
  costGlyph?: string;
  /** Let the player type a value directly. */
  editable?: boolean;
  size?: 'sm' | 'md';
}

/**
 * A quantity picker with press-and-hold acceleration and an optional running
 * cost — the control between a shop item and a confirm button.
 *
 *   const qty = new NumberStepper({ value: 1, max: 99, unitCost: 150, costGlyph: 'glyph-coin-stack' });
 *   qty.on<number>('stepper:change', (n) => preview(n));
 *
 * Holding a button repeats and then accelerates, so picking 87 of something
 * does not cost 87 taps.
 */
export class NumberStepper extends FuiComponent<NumberStepperOptions> {
  private value: number;
  private readout: HTMLElement;
  private input: HTMLInputElement | null = null;
  private totalEl: HTMLElement | null = null;
  private minus: HTMLButtonElement;
  private plus: HTMLButtonElement;

  constructor(opts: NumberStepperOptions = {}) {
    const root = h('div', { class: 'fui fui-stepper', dataset: { size: opts.size ?? 'md' } });
    super(root, opts);

    const min = opts.min ?? 0;
    const max = opts.max ?? 99;
    this.value = clamp(opts.value ?? min, min, max);

    this.minus = this.makeButton('−', -1);
    this.plus = this.makeButton('+', 1);

    if (opts.editable) {
      this.input = h('input', {
        class: 'fui-stepper__input fui-num',
        attrs: { type: 'text', inputmode: 'numeric', 'aria-label': 'Quantity' },
      });
      this.input.value = String(this.value);
      this.input.addEventListener('change', () => {
        const parsed = Number.parseInt(this.input!.value.replace(/\D/g, ''), 10);
        this.set(Number.isNaN(parsed) ? min : parsed);
      });
      this.readout = this.input;
    } else {
      this.readout = h('span', { class: 'fui-stepper__value fui-num' });
    }

    const box = h('div', { class: 'fui-stepper__box' }, this.minus, this.readout, this.plus);
    root.appendChild(box);

    if (opts.maxButton) {
      const maxBtn = h('button', {
        class: 'fui-stepper__max',
        text: 'MAX',
        attrs: { type: 'button' },
      });
      maxBtn.addEventListener('click', () => this.set(max));
      root.appendChild(maxBtn);
    }

    if (opts.unitCost != null) {
      this.totalEl = h('span', { class: 'fui-stepper__total fui-num' });
      const cost = h('div', { class: 'fui-stepper__cost' });
      if (opts.costGlyph) {
        cost.appendChild(
          h('span', {
            class: 'fui-stepper__cost-glyph',
            style: { '--fui-glyph-src': `var(--fui-img-${opts.costGlyph})` },
          }),
        );
      }
      cost.appendChild(this.totalEl);
      root.appendChild(cost);
    }
    this.paint();
  }

  /** A stepper button that repeats while held, accelerating as it goes. */
  private makeButton(label: string, dir: 1 | -1): HTMLButtonElement {
    const btn = h('button', {
      class: 'fui-stepper__btn',
      text: label,
      attrs: { type: 'button', 'aria-label': dir > 0 ? 'Increase' : 'Decrease' },
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = 380;

    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      delay = 380;
    };
    const tick = () => {
      this.set(this.value + dir * (this.opts.step ?? 1));
      delay = Math.max(40, delay * 0.72);
      timer = setTimeout(tick, delay);
    };

    btn.addEventListener('pointerdown', () => {
      tick();
      timer = setTimeout(tick, delay);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
      btn.addEventListener(ev, stop);
    }
    this.onDestroy(stop);
    return btn;
  }

  get(): number {
    return this.value;
  }

  set(value: number, opts?: { silent?: boolean }): this {
    const min = this.opts.min ?? 0;
    const max = this.opts.max ?? 99;
    const next = clamp(Math.round(value), min, max);
    if (next === this.value) return this;
    this.value = next;
    this.paint();
    if (!opts?.silent) this.emit('stepper:change', next);
    return this;
  }

  private paint(): void {
    const min = this.opts.min ?? 0;
    const max = this.opts.max ?? 99;
    if (this.input) this.input.value = String(this.value);
    else this.readout.textContent = String(this.value);
    this.minus.disabled = this.value <= min;
    this.plus.disabled = this.value >= max;
    if (this.totalEl && this.opts.unitCost != null) {
      this.totalEl.textContent = commas(this.value * this.opts.unitCost);
    }
  }
}
