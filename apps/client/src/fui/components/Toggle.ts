// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface ToggleOptions extends BaseOptions {
  label?: string;
  /** Small explanatory line under the label. */
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  /** `switch` is a sliding track, `check` an engraved tick box. */
  variant?: 'switch' | 'check';
  onChange?: (checked: boolean) => void;
}

/**
 * On/off control for settings screens — sound, fullscreen, damage numbers.
 * Emits `toggle:change` with the new boolean.
 *
 *   new Toggle({ label: 'Screen shake', checked: true, onChange: v => setShake(v) });
 */
export class Toggle extends FuiComponent<ToggleOptions> {
  private input: HTMLInputElement;

  constructor(opts: ToggleOptions = {}) {
    const root = h('label', {
      class: 'fui fui-toggle',
      dataset: { variant: opts.variant ?? 'switch' },
    });
    super(root, opts);

    this.input = h('input', {
      class: 'fui-toggle__input',
      attrs: { type: 'checkbox', checked: opts.checked, disabled: opts.disabled },
    });
    this.input.checked = !!opts.checked;

    this.input.addEventListener('change', () => {
      root.classList.toggle('is-on', this.input.checked);
      opts.onChange?.(this.input.checked);
      this.emit('toggle:change', this.input.checked);
    });

    root.appendChild(this.input);
    root.appendChild(
      h('span', { class: 'fui-toggle__control', attrs: { 'aria-hidden': 'true' } },
        h('span', { class: 'fui-toggle__knob' }),
      ),
    );

    if (opts.label || opts.hint) {
      root.appendChild(
        h(
          'span',
          { class: 'fui-toggle__text' },
          opts.label && h('span', { class: 'fui-toggle__label', text: opts.label }),
          opts.hint && h('span', { class: 'fui-toggle__hint', text: opts.hint }),
        ),
      );
    }
    if (opts.checked) root.classList.add('is-on');
    if (opts.disabled) root.classList.add('is-disabled');
  }

  get checked(): boolean {
    return this.input.checked;
  }

  set(checked: boolean, opts?: { silent?: boolean }): this {
    this.input.checked = checked;
    this.el.classList.toggle('is-on', checked);
    if (!opts?.silent) this.emit('toggle:change', checked);
    return this;
  }
}
