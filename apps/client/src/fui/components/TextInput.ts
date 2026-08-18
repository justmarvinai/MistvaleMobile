// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface TextInputOptions extends BaseOptions {
  label?: string;
  placeholder?: string;
  value?: string;
  /** Asset id for a leading icon, e.g. a scroll for a search field. */
  icon?: string;
  maxLength?: number;
  /** Show a `12 / 20` counter on the right. */
  counter?: boolean;
  disabled?: boolean;
  /** Red validation line under the field. */
  error?: string;
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  type?: 'text' | 'password' | 'search' | 'number';
  onInput?: (value: string) => void;
  onSubmit?: (value: string) => void;
}

/**
 * Text field for character naming, search boxes, chat, seed entry and
 * server addresses. Emits `input:change` and, on Enter, `input:submit`.
 *
 *   new TextInput({ label: 'Character name', maxLength: 20, counter: true });
 */
export class TextInput extends FuiComponent<TextInputOptions> {
  readonly input: HTMLInputElement;
  private counterEl: HTMLElement | null = null;
  private errorEl: HTMLElement | null = null;

  constructor(opts: TextInputOptions = {}) {
    const root = h('div', {
      class: 'fui fui-input',
      style:
        opts.width != null
          ? { width: typeof opts.width === 'number' ? `${opts.width}px` : opts.width }
          : undefined,
    });
    super(root, opts);

    if (opts.label) root.appendChild(h('span', { class: 'fui-input__label', text: opts.label }));

    const field = h('div', { class: 'fui-input__field' });
    field.appendChild(h('span', { class: 'fui-input__art', attrs: { 'aria-hidden': 'true' } }));
    if (opts.icon) {
      field.appendChild(
        h('span', {
          class: 'fui-input__icon',
          style: { backgroundImage: `var(--fui-img-${opts.icon})` },
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }

    this.input = h('input', {
      class: 'fui-input__control',
      attrs: {
        type: opts.type ?? 'text',
        placeholder: opts.placeholder,
        maxlength: opts.maxLength,
        disabled: opts.disabled,
        'aria-label': opts.label,
      },
    });
    this.input.value = opts.value ?? '';
    field.appendChild(this.input);

    if (opts.counter && opts.maxLength) {
      this.counterEl = h('span', { class: 'fui-input__counter fui-num' });
      field.appendChild(this.counterEl);
    }
    root.appendChild(field);

    if (opts.error) {
      this.errorEl = h('span', { class: 'fui-input__error', text: opts.error });
      root.appendChild(this.errorEl);
      root.classList.add('is-invalid');
    }

    this.input.addEventListener('input', () => {
      this.paintCounter();
      opts.onInput?.(this.value);
      this.emit('input:change', this.value);
    });
    this.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        opts.onSubmit?.(this.value);
        this.emit('input:submit', this.value);
      }
    });
    if (opts.disabled) root.classList.add('is-disabled');
    this.paintCounter();
  }

  get value(): string {
    return this.input.value;
  }

  set(value: string): this {
    this.input.value = value;
    this.paintCounter();
    return this;
  }

  focus(): this {
    this.input.focus();
    return this;
  }

  /** Show or clear the validation message. */
  setError(message: string | null): this {
    this.el.classList.toggle('is-invalid', !!message);
    if (!this.errorEl) {
      this.errorEl = h('span', { class: 'fui-input__error' });
      this.el.appendChild(this.errorEl);
    }
    this.errorEl.textContent = message ?? '';
    this.errorEl.style.display = message ? '' : 'none';
    return this;
  }

  private paintCounter(): void {
    if (this.counterEl && this.opts.maxLength) {
      this.counterEl.textContent = `${this.value.length} / ${this.opts.maxLength}`;
    }
  }
}
