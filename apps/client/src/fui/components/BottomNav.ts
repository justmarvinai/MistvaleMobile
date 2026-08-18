// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, abbreviate } from '../core/dom.ts';

export interface NavItem {
  id: string;
  label: string;
  /** Glyph asset id — line glyphs suit nav best because they tint per state. */
  glyph: string;
  /** Red count bubble. Pass 0 or omit for none. */
  badge?: number;
  /** Plain dot instead of a number — "something new in here". */
  dot?: boolean;
  disabled?: boolean;
  /** Raise this entry into the centre action button. */
  primary?: boolean;
}

export interface BottomNavOptions extends BaseOptions {
  items: NavItem[];
  active?: string;
}

/**
 * The persistent bottom navigation mobile games use for their main sections —
 * with per-tab badges for unclaimed rewards and unread mail.
 *
 * Emits `nav:change` with `{ id, item }`.
 *
 *   const nav = new BottomNav({ active: 'battle', items: [
 *     { id: 'champions', label: 'Champions', glyph: 'glyph-cloaked-figure', badge: 3 },
 *     { id: 'battle', label: 'Battle', glyph: 'glyph-crossed-swords', primary: true },
 *     { id: 'shop', label: 'Shop', glyph: 'glyph-trophy-cup', dot: true },
 *   ]});
 */
export class BottomNav extends FuiComponent<BottomNavOptions> {
  private buttons = new Map<string, HTMLElement>();
  private activeId = '';

  constructor(opts: BottomNavOptions) {
    const root = h('nav', {
      class: 'fui fui-bottomnav',
      attrs: { 'aria-label': 'Main navigation' },
    });
    super(root, opts);

    this.render();
    this.select(opts.active ?? opts.items.find((i) => !i.disabled)?.id ?? '', { silent: true });
  }

  get active(): string {
    return this.activeId;
  }

  select(id: string, o?: { silent?: boolean }): this {
    if (!this.buttons.has(id)) return this;
    this.activeId = id;
    for (const [key, btn] of this.buttons) {
      const on = key === id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-current', on ? 'page' : 'false');
    }
    if (!o?.silent) {
      this.emit('nav:change', { id, item: this.opts.items.find((i) => i.id === id) });
    }
    return this;
  }

  /** Update a tab's badge count; 0 clears it. */
  setBadge(id: string, count: number): this {
    const btn = this.buttons.get(id);
    if (!btn) return this;
    let badge = btn.querySelector<HTMLElement>('.fui-bottomnav__badge');
    if (count > 0) {
      if (!badge) {
        badge = h('span', { class: 'fui-bottomnav__badge fui-num' });
        btn.appendChild(badge);
      }
      badge.textContent = abbreviate(count);
    } else {
      badge?.remove();
    }
    return this;
  }

  private render(): void {
    clear(this.el);
    this.buttons.clear();

    for (const item of this.opts.items) {
      const btn = h('button', {
        class: 'fui-bottomnav__item',
        dataset: { id: item.id },
        attrs: { type: 'button', disabled: item.disabled },
      });
      if (item.primary) btn.classList.add('is-primary');

      btn.appendChild(
        h('span', {
          class: 'fui-bottomnav__glyph',
          style: { '--fui-glyph-src': `var(--fui-img-${item.glyph})` },
        }),
      );
      btn.appendChild(h('span', { class: 'fui-bottomnav__label', text: item.label }));

      if (item.badge) {
        btn.appendChild(h('span', { class: 'fui-bottomnav__badge fui-num', text: abbreviate(item.badge) }));
      } else if (item.dot) {
        btn.appendChild(h('span', { class: 'fui-bottomnav__dot' }));
      }

      btn.addEventListener('click', () => this.select(item.id));
      this.buttons.set(item.id, btn);
      this.el.appendChild(btn);
    }
  }
}
