// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, clamp } from '../core/dom.ts';

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  /** Right-aligned keybind hint, e.g. `'Right-click'`. */
  hint?: string;
  /** Render in the danger colour — Destroy, Abandon, Delete. */
  danger?: boolean;
  disabled?: boolean;
  /** Pass `'-'` as the id to render a separator instead of a row. */
  separator?: boolean;
}

export interface ContextMenuOptions extends BaseOptions {
  items: MenuItem[];
  /** Small heading above the items — usually the item's name. */
  title?: string;
  /** Width in pixels. */
  width?: number;
}

/**
 * Right-click menu for inventory items, party members, map pins and chat names.
 * Emits `menu:select` with the chosen item's id.
 *
 *   const menu = new ContextMenu({ items: [
 *     { id: 'use', label: 'Use', icon: 'icon-potion' },
 *     { id: '-', label: '', separator: true },
 *     { id: 'drop', label: 'Destroy', danger: true },
 *   ]});
 *   document.body.append(menu.el);
 *   menu.bind(slot.el);
 */
export class ContextMenu extends FuiComponent<ContextMenuOptions> {
  private list: HTMLElement;

  constructor(opts: ContextMenuOptions) {
    const root = h('div', {
      class: 'fui fui-menu',
      style: { width: `${opts.width ?? 190}px` },
      attrs: { role: 'menu' },
    });
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-menu__fill', attrs: { 'aria-hidden': 'true' } }));
    this.list = h('div', { class: 'fui-menu__list' });
    root.appendChild(this.list);
    this.setItems(opts.items, opts.title);

    // Any click elsewhere, or a scroll, dismisses the menu.
    const away = () => this.hide();
    const d = root.ownerDocument;
    d.addEventListener('click', away);
    d.addEventListener('scroll', away, true);
    this.onDestroy(() => {
      d.removeEventListener('click', away);
      d.removeEventListener('scroll', away, true);
    });
  }

  /** Replace the menu contents — call before `showAt` to make it contextual. */
  setItems(items: MenuItem[], title?: string): this {
    this.opts.items = items;
    clear(this.list);
    if (title) this.list.appendChild(h('div', { class: 'fui-menu__title fui-label', text: title }));

    for (const item of items) {
      if (item.separator) {
        this.list.appendChild(h('div', { class: 'fui-menu__sep' }));
        continue;
      }
      const row = h('button', {
        class: 'fui-menu__item',
        dataset: { id: item.id },
        attrs: { type: 'button', role: 'menuitem', disabled: item.disabled },
      });
      if (item.danger) row.classList.add('is-danger');
      if (item.icon) {
        row.appendChild(
          h('span', {
            class: 'fui-menu__icon',
            style: { backgroundImage: `var(--fui-img-${item.icon})` },
          }),
        );
      }
      row.appendChild(h('span', { class: 'fui-menu__label', text: item.label }));
      if (item.hint) row.appendChild(h('kbd', { class: 'fui-menu__hint', text: item.hint }));
      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.hide();
        this.emit('menu:select', { id: item.id, item });
      });
      this.list.appendChild(row);
    }
    return this;
  }

  /** Show at viewport coordinates, flipped to stay on screen. */
  showAt(x: number, y: number): this {
    this.el.classList.add('is-open');
    const view = this.el.ownerDocument.defaultView;
    const vw = view?.innerWidth ?? 1920;
    const vh = view?.innerHeight ?? 1080;
    const { offsetWidth: w, offsetHeight: hgt } = this.el;
    this.el.style.left = `${clamp(x, 6, Math.max(6, vw - w - 6))}px`;
    this.el.style.top = `${clamp(y, 6, Math.max(6, vh - hgt - 6))}px`;
    return this;
  }

  hide(): this {
    this.el.classList.remove('is-open');
    return this;
  }

  /** Open this menu on right-click of `target`. */
  bind(target: HTMLElement, items?: () => MenuItem[]): () => void {
    const handler = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (items) this.setItems(items());
      this.showAt(ev.clientX, ev.clientY);
    };
    target.addEventListener('contextmenu', handler);
    const off = () => target.removeEventListener('contextmenu', handler);
    this.onDestroy(off);
    return off;
  }
}
