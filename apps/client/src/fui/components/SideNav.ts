// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface SideNavItem {
  id: string;
  label: string;
  /** Glyph asset id for the icon. */
  glyph?: string;
  /** Count bubble — unclaimed rewards, unread mail. */
  badge?: number | string;
  /** Show a plain dot instead of a count. */
  dot?: boolean;
  disabled?: boolean;
  /** Push this item and everything after it to the bottom of the rail. */
  footer?: boolean;
}

export interface SideNavOptions extends BaseOptions {
  items: SideNavItem[];
  /** Item selected first. Defaults to the first enabled one. */
  value?: string;
  /** `icons` is a narrow rail; `full` shows labels beside them. */
  variant?: 'icons' | 'full';
  /** Heading at the top of the rail — a game or section name. */
  title?: string;
  /** Fill the parent's height. */
  fill?: boolean;
}

/**
 * The vertical navigation rail a desktop layout uses where a phone would use
 * `BottomNav` — narrow and icon-only, or wide with labels.
 *
 *   const nav = new SideNav({
 *     title: 'Ashfall',
 *     variant: 'full',
 *     items: [
 *       { id: 'campaign', label: 'Campaign', glyph: 'glyph-crossed-swords' },
 *       { id: 'roster', label: 'Champions', glyph: 'glyph-eagle-staff', badge: 3 },
 *       { id: 'mail', label: 'Mail', glyph: 'glyph-burning-scroll', dot: true },
 *       { id: 'settings', label: 'Settings', glyph: 'glyph-hourglass', footer: true },
 *     ],
 *   });
 *   nav.on<string>('nav:change', (id) => router.go(id));
 *
 * In `icons` mode the label becomes a hover tooltip rather than disappearing,
 * so the rail stays usable for anyone who does not recognise a glyph.
 */
export class SideNav extends FuiComponent<SideNavOptions> {
  private buttons = new Map<string, HTMLButtonElement>();
  private value: string;

  constructor(opts: SideNavOptions) {
    const root = h('nav', {
      class: 'fui fui-sidenav',
      dataset: { variant: opts.variant ?? 'icons' },
      attrs: { 'aria-label': opts.title ?? 'Main navigation' },
    });
    if (opts.fill) root.classList.add('fui-sidenav--fill');
    super(root, opts);

    this.value = opts.value ?? opts.items.find((i) => !i.disabled)?.id ?? '';

    if (opts.title) {
      root.appendChild(h('span', { class: 'fui-sidenav__title fui-title', text: opts.title }));
    }

    const main = h('div', { class: 'fui-sidenav__group' });
    const footer = h('div', { class: 'fui-sidenav__group fui-sidenav__group--footer' });

    for (const item of opts.items) {
      const btn = h('button', {
        class: 'fui-sidenav__item',
        attrs: {
          type: 'button',
          disabled: item.disabled || undefined,
          title: item.label,
          'aria-current': 'false',
        },
      });

      const icon = h('span', { class: 'fui-sidenav__icon' });
      if (item.glyph) icon.style.setProperty('--fui-glyph-src', `var(--fui-img-${item.glyph})`);
      btn.appendChild(icon);
      btn.appendChild(h('span', { class: 'fui-sidenav__label', text: item.label }));

      if (item.badge != null) {
        btn.appendChild(h('span', { class: 'fui-sidenav__badge fui-num', text: String(item.badge) }));
      } else if (item.dot) {
        btn.appendChild(h('span', { class: 'fui-sidenav__dot' }));
      }

      if (!item.disabled) btn.addEventListener('click', () => this.select(item.id));
      this.buttons.set(item.id, btn);
      (item.footer ? footer : main).appendChild(btn);
    }

    root.appendChild(main);
    if (footer.childNodes.length) root.appendChild(footer);
    this.paint();
  }

  get(): string {
    return this.value;
  }

  select(id: string, opts?: { silent?: boolean }): this {
    if (!this.buttons.has(id) || id === this.value) return this;
    this.value = id;
    this.paint();
    if (!opts?.silent) this.emit('nav:change', id);
    return this;
  }

  /** Set or clear one item's badge without rebuilding the rail. */
  setBadge(id: string, badge: number | string | null): this {
    const btn = this.buttons.get(id);
    if (!btn) return this;
    const existing = btn.querySelector('.fui-sidenav__badge, .fui-sidenav__dot');
    if (existing) existing.remove();
    if (badge != null && badge !== '') {
      btn.appendChild(h('span', { class: 'fui-sidenav__badge fui-num', text: String(badge) }));
    }
    return this;
  }

  private paint(): void {
    for (const [id, btn] of this.buttons) {
      const on = id === this.value;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-current', on ? 'page' : 'false');
    }
  }
}
