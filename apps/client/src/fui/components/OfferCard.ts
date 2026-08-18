// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, commas } from '../core/dom.ts';
import { CountdownTimer } from './CountdownTimer.ts';

export interface OfferItem {
  icon: string;
  label?: string;
  qty?: number;
}

export interface OfferCardOptions extends BaseOptions {
  title: string;
  /** Small line under the title. */
  subtitle?: string;
  contents: OfferItem[];
  /** Display price, e.g. `'£9.99'` or a soft-currency number. */
  price: string | number;
  /** Struck-through original price. */
  wasPrice?: string | number;
  /** Percentage off, drawn as a corner flash. */
  discount?: number;
  /** Corner ribbon text, e.g. `'BEST VALUE'`. */
  tag?: string;
  /** Epoch ms the offer expires; renders a live countdown. */
  endsAt?: number;
  /** Background art asset id. */
  art?: string;
  /** Buy button label. */
  buyLabel?: string;
  /** Times the offer can still be bought. */
  remaining?: number;
  /** Gold trim and a stronger glow for the headline bundle. */
  featured?: boolean;
}

/**
 * The shop bundle: what's inside, what it costs, how much is saved and how long
 * it lasts.
 *
 * Emits `offer:buy`, and `offer:expired` when the countdown runs out.
 *
 *   new OfferCard({ title: 'Starter Bundle', discount: 60, featured: true,
 *     price: '£4.99', wasPrice: '£12.99', endsAt: Date.now() + 86_400_000,
 *     contents: [{ icon: 'icon-coins', qty: 5000 }, { icon: 'icon-chest', qty: 3 }] });
 */
export class OfferCard extends FuiComponent<OfferCardOptions> {
  constructor(opts: OfferCardOptions) {
    const root = h('div', { class: 'fui fui-offer' });
    if (opts.featured) root.classList.add('is-featured');
    super(root, opts);

    const art = h('div', { class: 'fui-offer__art', attrs: { 'aria-hidden': 'true' } });
    if (opts.art) art.style.backgroundImage = `var(--fui-img-${opts.art})`;
    root.appendChild(art);
    root.appendChild(h('div', { class: 'fui-offer__scrim', attrs: { 'aria-hidden': 'true' } }));

    if (opts.discount) {
      root.appendChild(h('span', { class: 'fui-offer__discount', text: `-${opts.discount}%` }));
    }
    if (opts.tag) {
      root.appendChild(h('span', { class: 'fui-offer__tag', text: opts.tag }));
    }

    const body = h('div', { class: 'fui-offer__body' });
    body.appendChild(h('h3', { class: 'fui-offer__title fui-title', text: opts.title }));
    if (opts.subtitle) {
      body.appendChild(h('p', { class: 'fui-offer__sub fui-label', text: opts.subtitle }));
    }

    const contents = h('div', { class: 'fui-offer__contents' });
    for (const item of opts.contents) {
      const cell = h('div', { class: 'fui-offer__item', attrs: { title: item.label } });
      cell.appendChild(
        h('span', { class: 'fui-offer__icon', style: { backgroundImage: `var(--fui-img-${item.icon})` } }),
      );
      if (item.qty) {
        cell.appendChild(h('span', { class: 'fui-offer__qty fui-num', text: `×${commas(item.qty)}` }));
      }
      contents.appendChild(cell);
    }
    body.appendChild(contents);

    const meta = h('div', { class: 'fui-offer__meta' });
    if (opts.endsAt) {
      const timer = new CountdownTimer({
        endsAt: opts.endsAt,
        glyph: 'glyph-hourglass',
        onEnd: () => {
          root.classList.add('is-expired');
          this.emit('offer:expired', opts);
        },
      });
      meta.appendChild(timer.el);
    }
    if (opts.remaining != null) {
      meta.appendChild(h('span', { class: 'fui-offer__remaining', text: `${opts.remaining} left` }));
    }
    if (meta.childElementCount) body.appendChild(meta);

    const buy = h('button', { class: 'fui-offer__buy', attrs: { type: 'button' } });
    if (opts.wasPrice != null) {
      buy.appendChild(h('span', { class: 'fui-offer__was', text: String(opts.wasPrice) }));
    }
    buy.appendChild(
      h('span', { class: 'fui-offer__price', text: typeof opts.price === 'number' ? commas(opts.price) : opts.price }),
    );
    if (opts.buyLabel) buy.appendChild(h('span', { class: 'fui-offer__buylabel', text: opts.buyLabel }));
    buy.addEventListener('click', () => this.emit('offer:buy', opts));
    body.appendChild(buy);

    root.appendChild(body);
  }
}
