// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export type ButtonVariant = 'primary' | 'long' | 'ghost' | 'square' | 'round';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonOptions extends BaseOptions {
  label?: string;
  /** Asset id of an icon to render before the label, e.g. `'icon-sword'`. */
  icon?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Stretch to the container's full width. */
  block?: boolean;
  /** Keyboard hint rendered on the right, e.g. `'Enter'`. */
  hint?: string;
  /** Convenience shorthand for `.on('click', ...)`. */
  onClick?: (ev: MouseEvent) => void;
  /** Native button type. Defaults to `button` so it never submits a form. */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * A 9-sliced button that survives any label length.
 *
 * Themes that ship real idle/hover artwork (Dark Ember) swap the texture on
 * hover; themes that don't (Stone & Vine) brighten the single texture instead.
 * Either way the component code is identical.
 *
 *   new Button({ label: 'Attack', icon: 'icon-sword', onClick: () => swing() });
 */
export class Button extends FuiComponent<ButtonOptions> {
  private labelEl: HTMLElement | null = null;

  constructor(opts: ButtonOptions = {}) {
    const root = h('button', {
      class: 'fui fui-btn',
      dataset: {
        variant: opts.variant ?? 'primary',
        size: opts.size ?? 'md',
      },
      attrs: {
        type: opts.type ?? 'button',
        disabled: opts.disabled,
        'aria-label': !opts.label && opts.icon ? opts.icon : undefined,
      },
    });
    if (opts.block) root.classList.add('fui-btn--block');

    super(root, opts);

    // Texture layer first so the label and icon stack above it.
    root.appendChild(h('span', { class: 'fui-btn__art', attrs: { 'aria-hidden': 'true' } }));

    if (opts.icon) {
      root.appendChild(
        h('span', {
          class: 'fui-btn__icon',
          style: { backgroundImage: `var(--fui-img-${opts.icon})` },
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }
    if (opts.label) {
      this.labelEl = h('span', { class: 'fui-btn__label', text: opts.label });
      root.appendChild(this.labelEl);
    }
    if (opts.hint) {
      root.appendChild(h('kbd', { class: 'fui-btn__hint', text: opts.hint }));
    }

    if (opts.onClick) root.addEventListener('click', opts.onClick as EventListener);
  }

  setLabel(text: string): this {
    if (this.labelEl) this.labelEl.textContent = text;
    return this;
  }

  setDisabled(disabled: boolean): this {
    (this.el as HTMLButtonElement).disabled = disabled;
    return this;
  }

  /** Play a one-shot "not enough mana / on cooldown" refusal shake. */
  deny(): this {
    this.el.classList.remove('fui-btn--deny');
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add('fui-btn--deny');
    return this;
  }
}
