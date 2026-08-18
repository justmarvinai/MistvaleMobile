// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';
import { Button } from './Button.ts';

export interface CharacterClass {
  id: string;
  name: string;
  /** One-line hook, e.g. `'Heavy armour, heavier axe.'` */
  tagline?: string;
  /** Silhouette or portrait asset id from the manifest. */
  art?: string;
  /** Or a full image URL. */
  image?: string;
  /** Role glyph shown on the card, e.g. `'icon-sword'`. */
  icon?: string;
  description?: string;
  /** Bars rendered 0–5, e.g. `{ Might: 5, Agility: 2 }`. */
  stats?: Record<string, number>;
  /** Starting kit shown as small icons. */
  startingGear?: string[];
  locked?: boolean;
  /** Unlock hint shown on a locked card. */
  lockHint?: string;
}

export interface CharacterSelectOptions extends BaseOptions {
  title?: string;
  classes: CharacterClass[];
  selected?: string;
  /** Label on the confirm button. Default `'Begin'`. */
  confirmLabel?: string;
  fullscreen?: boolean;
}

/**
 * The class / hero picker: a row of silhouette cards with a detail column
 * showing the selected class's stats and starting gear.
 *
 * Emits `character:select` as cards are clicked and `character:confirm` when
 * the player commits.
 *
 *   new CharacterSelect({ classes: [
 *     { id: 'warrior', name: 'Warrior', art: 'silhouette-warrior-m',
 *       stats: { Might: 5, Agility: 2, Arcana: 1 } },
 *   ]});
 */
export class CharacterSelect extends FuiComponent<CharacterSelectOptions> {
  private cardsEl: HTMLElement;
  private detailEl: HTMLElement;
  private selectedId: string;

  constructor(opts: CharacterSelectOptions) {
    const root = h('div', { class: 'fui fui-charsel' });
    if (opts.fullscreen !== false) root.classList.add('fui-charsel--fullscreen');
    super(root, opts);
    this.selectedId = opts.selected ?? opts.classes.find((c) => !c.locked)?.id ?? '';

    root.appendChild(h('div', { class: 'fui-charsel__bg', attrs: { 'aria-hidden': 'true' } }));

    root.appendChild(
      h('h1', { class: 'fui-charsel__title fui-title', text: opts.title ?? 'Choose Your Hero' }),
    );

    this.cardsEl = h('div', { class: 'fui-charsel__cards' });
    this.detailEl = h('div', { class: 'fui-charsel__detail' });
    root.appendChild(h('div', { class: 'fui-charsel__stage' }, this.cardsEl, this.detailEl));

    const confirm = new Button({
      label: opts.confirmLabel ?? 'Begin',
      variant: 'long',
      size: 'lg',
      class: 'fui-charsel__confirm',
      onClick: () =>
        this.emit('character:confirm', this.opts.classes.find((c) => c.id === this.selectedId)),
    });
    root.appendChild(confirm.el);

    this.renderCards();
    this.renderDetail();
  }

  select(id: string): this {
    const cls = this.opts.classes.find((c) => c.id === id);
    if (!cls || cls.locked) return this;
    this.selectedId = id;
    this.renderCards();
    this.renderDetail();
    this.emit('character:select', cls);
    return this;
  }

  /** The class currently highlighted. */
  get selection(): CharacterClass | undefined {
    return this.opts.classes.find((c) => c.id === this.selectedId);
  }

  private renderCards(): void {
    clear(this.cardsEl);
    for (const c of this.opts.classes) {
      const card = h('button', {
        class: 'fui-charsel__card',
        attrs: { type: 'button', disabled: c.locked },
      });
      if (c.id === this.selectedId) card.classList.add('is-selected');
      if (c.locked) card.classList.add('is-locked');

      card.appendChild(h('span', { class: 'fui-charsel__cardfill', attrs: { 'aria-hidden': 'true' } }));

      const art = h('span', { class: 'fui-charsel__art', attrs: { 'aria-hidden': 'true' } });
      if (c.image) art.style.backgroundImage = `url("${c.image}")`;
      else if (c.art) art.style.backgroundImage = `var(--fui-img-${c.art})`;
      card.appendChild(art);

      if (c.icon) {
        card.appendChild(
          h('span', {
            class: 'fui-charsel__role',
            style: { backgroundImage: `var(--fui-img-${c.icon})` },
          }),
        );
      }
      card.appendChild(h('span', { class: 'fui-charsel__name fui-title', text: c.name }));
      if (c.locked && c.lockHint) {
        card.appendChild(h('span', { class: 'fui-charsel__lock', text: c.lockHint }));
      }
      card.addEventListener('click', () => this.select(c.id));
      this.cardsEl.appendChild(card);
    }
  }

  private renderDetail(): void {
    clear(this.detailEl);
    const c = this.selection;
    if (!c) return;

    this.detailEl.appendChild(h('h2', { class: 'fui-charsel__dname fui-title', text: c.name }));
    if (c.tagline) {
      this.detailEl.appendChild(h('p', { class: 'fui-charsel__tagline', text: c.tagline }));
    }
    if (c.description) {
      this.detailEl.appendChild(h('p', { class: 'fui-charsel__desc fui-body', text: c.description }));
    }

    if (c.stats) {
      const list = h('ul', { class: 'fui-charsel__stats' });
      for (const [label, value] of Object.entries(c.stats)) {
        const pips = h('span', { class: 'fui-charsel__pips' });
        for (let i = 0; i < 5; i++) {
          const pip = h('span', { class: 'fui-charsel__pip' });
          if (i < value) pip.classList.add('is-on');
          pips.appendChild(pip);
        }
        list.appendChild(
          h('li', null, h('span', { class: 'fui-charsel__statlabel', text: label }), pips),
        );
      }
      this.detailEl.appendChild(list);
    }

    if (c.startingGear?.length) {
      this.detailEl.appendChild(
        h('h3', { class: 'fui-charsel__sub fui-label', text: 'Starting Gear' }),
      );
      const gear = h('div', { class: 'fui-charsel__gear' });
      for (const g of c.startingGear) {
        gear.appendChild(
          h('span', { class: 'fui-charsel__gearicon', style: { backgroundImage: `var(--fui-img-${g})` } }),
        );
      }
      this.detailEl.appendChild(gear);
    }
  }
}
