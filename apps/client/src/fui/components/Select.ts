// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';

export interface SelectItem {
  value: string;
  label: string;
  /** Asset id for a leading icon. */
  icon?: string;
  /** Secondary line under the label. */
  hint?: string;
  disabled?: boolean;
}

export interface SelectOptions extends BaseOptions {
  label?: string;
  items: SelectItem[];
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  onChange?: (value: string) => void;
}

/**
 * Dropdown for resolution, language, difficulty, sort order and class pickers.
 * Emits `select:change` with the chosen value.
 *
 * Built from buttons rather than a native `<select>` so the option list can
 * carry icons and hint lines, which native options cannot render.
 */
export class Select extends FuiComponent<SelectOptions> {
  private trigger: HTMLButtonElement;
  private list: HTMLElement;
  private valueEl: HTMLElement;
  private iconEl: HTMLElement;
  private current = '';
  private open = false;

  constructor(opts: SelectOptions) {
    const root = h('div', {
      class: 'fui fui-select',
      style:
        opts.width != null
          ? { width: typeof opts.width === 'number' ? `${opts.width}px` : opts.width }
          : undefined,
    });
    super(root, opts);

    if (opts.label) root.appendChild(h('span', { class: 'fui-select__label', text: opts.label }));

    this.iconEl = h('span', { class: 'fui-select__icon', attrs: { 'aria-hidden': 'true' } });
    this.valueEl = h('span', { class: 'fui-select__value' });
    this.trigger = h('button', {
      class: 'fui-select__trigger',
      attrs: {
        type: 'button',
        disabled: opts.disabled,
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
      },
    });
    this.trigger.appendChild(h('span', { class: 'fui-select__art', attrs: { 'aria-hidden': 'true' } }));
    this.trigger.appendChild(this.iconEl);
    this.trigger.appendChild(this.valueEl);
    this.trigger.appendChild(h('span', { class: 'fui-select__caret', attrs: { 'aria-hidden': 'true' } }));
    this.trigger.addEventListener('click', () => this.toggle());
    root.appendChild(this.trigger);

    this.list = h('div', { class: 'fui-select__list fui-scroll', attrs: { role: 'listbox' } });
    root.appendChild(this.list);
    this.renderList();

    // Close when the click lands anywhere else.
    const away = (ev: MouseEvent) => {
      if (this.open && !root.contains(ev.target as Node)) this.close();
    };
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && this.open) this.close();
    };
    const d = root.ownerDocument;
    d.addEventListener('click', away);
    d.addEventListener('keydown', esc);
    this.onDestroy(() => {
      d.removeEventListener('click', away);
      d.removeEventListener('keydown', esc);
    });

    this.select(opts.value ?? opts.items.find((i) => !i.disabled)?.value ?? '', { silent: true });
  }

  private renderList(): void {
    clear(this.list);
    for (const item of this.opts.items) {
      const opt = h('button', {
        class: 'fui-select__option',
        attrs: { type: 'button', role: 'option', disabled: item.disabled },
        dataset: { value: item.value },
      });
      if (item.icon) {
        opt.appendChild(
          h('span', {
            class: 'fui-select__opt-icon',
            style: { backgroundImage: `var(--fui-img-${item.icon})` },
          }),
        );
      }
      opt.appendChild(
        h(
          'span',
          { class: 'fui-select__opt-text' },
          h('span', { text: item.label }),
          item.hint && h('small', { text: item.hint }),
        ),
      );
      opt.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.select(item.value);
        this.close();
      });
      this.list.appendChild(opt);
    }
  }

  get value(): string {
    return this.current;
  }

  select(value: string, o?: { silent?: boolean }): this {
    const item = this.opts.items.find((i) => i.value === value);
    this.current = item ? value : '';
    this.valueEl.textContent = item?.label ?? this.opts.placeholder ?? 'Select…';
    this.valueEl.classList.toggle('is-placeholder', !item);
    this.iconEl.style.backgroundImage = item?.icon ? `var(--fui-img-${item.icon})` : '';
    this.iconEl.style.display = item?.icon ? '' : 'none';

    for (const el of Array.from(this.list.children)) {
      const on = (el as HTMLElement).dataset.value === value;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-selected', String(on));
    }
    if (!o?.silent && item) {
      this.opts.onChange?.(value);
      this.emit('select:change', value);
    }
    return this;
  }

  toggle(): this {
    return this.open ? this.close() : this.openList();
  }

  openList(): this {
    this.open = true;
    this.el.classList.add('is-open');
    this.trigger.setAttribute('aria-expanded', 'true');
    return this;
  }

  close(): this {
    this.open = false;
    this.el.classList.remove('is-open');
    this.trigger.setAttribute('aria-expanded', 'false');
    return this;
  }
}
