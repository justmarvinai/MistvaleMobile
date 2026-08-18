// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';
import { Button } from './Button.ts';

export interface MenuEntry {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  /** Reads as the primary call to action. */
  primary?: boolean;
}

export interface MainMenuOptions extends BaseOptions {
  title: string;
  /** Small line under the title — the subtitle or chapter name. */
  tagline?: string;
  /** Logo image URL, shown instead of the text title. */
  logo?: string;
  entries: MenuEntry[];
  /** Bottom-left build string, e.g. `'v0.4.2 · build 812'`. */
  version?: string;
  /** Bottom-right credit line. */
  footer?: string;
  /** Fill the viewport. Set false to render inline for previews. */
  fullscreen?: boolean;
  /** Backdrop image URL; defaults to the theme's painted backdrop. */
  background?: string;
  /** Horizontal alignment of the menu column. */
  align?: 'left' | 'center';
}

/**
 * The title screen: backdrop, logo, a stack of menu buttons, and version /
 * credit lines. Emits `menu:select` with the entry's id.
 *
 *   const menu = new MainMenu({ title: 'Ashen Vale', tagline: 'Chapter One',
 *     entries: [{ id: 'new', label: 'New Game', primary: true },
 *               { id: 'load', label: 'Continue' },
 *               { id: 'quit', label: 'Quit' }] });
 *   menu.on('menu:select', ({ id }) => route(id));
 */
export class MainMenu extends FuiComponent<MainMenuOptions> {
  private navEl: HTMLElement;

  constructor(opts: MainMenuOptions) {
    const root = h('div', {
      class: 'fui fui-mainmenu',
      dataset: { align: opts.align ?? 'center' },
    });
    if (opts.fullscreen !== false) root.classList.add('fui-mainmenu--fullscreen');
    super(root, opts);

    const bg = h('div', { class: 'fui-mainmenu__bg', attrs: { 'aria-hidden': 'true' } });
    if (opts.background) bg.style.backgroundImage = `url("${opts.background}")`;
    root.appendChild(bg);
    root.appendChild(h('div', { class: 'fui-mainmenu__vignette', attrs: { 'aria-hidden': 'true' } }));

    const stage = h('div', { class: 'fui-mainmenu__stage' });

    const header = h('header', { class: 'fui-mainmenu__header' });
    if (opts.logo) {
      header.appendChild(
        h('div', {
          class: 'fui-mainmenu__logo',
          style: { backgroundImage: `url("${opts.logo}")` },
          attrs: { role: 'img', 'aria-label': opts.title },
        }),
      );
    } else {
      header.appendChild(h('h1', { class: 'fui-mainmenu__title fui-title', text: opts.title }));
    }
    if (opts.tagline) {
      header.appendChild(h('p', { class: 'fui-mainmenu__tagline', text: opts.tagline }));
    }
    header.appendChild(h('div', { class: 'fui-mainmenu__rule', attrs: { 'aria-hidden': 'true' } }));
    stage.appendChild(header);

    this.navEl = h('nav', { class: 'fui-mainmenu__nav' });
    stage.appendChild(this.navEl);
    root.appendChild(stage);

    const foot = h('footer', { class: 'fui-mainmenu__foot' });
    foot.appendChild(h('span', { class: 'fui-mainmenu__version', text: opts.version ?? '' }));
    foot.appendChild(h('span', { class: 'fui-mainmenu__credit', text: opts.footer ?? '' }));
    root.appendChild(foot);

    this.setEntries(opts.entries);
  }

  setEntries(entries: MenuEntry[]): this {
    clear(this.navEl);
    this.opts.entries = entries;
    for (const entry of entries) {
      const btn = new Button({
        label: entry.label,
        icon: entry.icon,
        variant: entry.primary ? 'long' : 'ghost',
        size: entry.primary ? 'lg' : 'md',
        block: true,
        disabled: entry.disabled,
        onClick: () => this.emit('menu:select', { id: entry.id, entry }),
      });
      this.navEl.appendChild(btn.el);
    }
    return this;
  }
}
