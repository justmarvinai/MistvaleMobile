// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp, clear, duration } from '../core/dom.ts';

export interface SummonBanner {
  id: string;
  title: string;
  /** Line under the title — what is rate-up. */
  subtitle?: string;
  /** Key art asset id. */
  art?: string;
  /** Featured champion art, drawn large on the right. */
  featured?: string;
  /** Seconds left on the banner. */
  endsIn?: number;
  /** Accent colour. */
  color?: string;
  /** Cost line, e.g. "1 Ancient Shard". */
  cost?: string;
  /** Rate-up odds line, e.g. "Legendary 6%". */
  rate?: string;
}

export interface BannerCarouselOptions extends BaseOptions {
  banners: SummonBanner[];
  /** Banner shown first. */
  index?: number;
  /** Label for the single-pull button. */
  pullLabel?: string;
  /** Label for the ten-pull button. */
  multiLabel?: string;
  /** Auto-advance interval in milliseconds. */
  autoplay?: number;
}

/**
 * The summon-banner rail: the rotating hero unit of a gacha game's front page,
 * with tabs across the top and the two pull buttons underneath.
 *
 *   const banners = new BannerCarousel({
 *     banners: [
 *       { id: 'void', title: 'Void Ascendant', subtitle: 'Rate-up: Vexhollow',
 *         art: 'blood-necromancer', featured: 'blood-necromancer',
 *         endsIn: 86_400 * 3, cost: '1 Void Shard', rate: 'Legendary 6%', color: '#a335ee' },
 *     ],
 *     autoplay: 7000,
 *   });
 *   banners.on<string>('banner:pull', (id) => summon(id, 1));
 *   banners.on<string>('banner:multi', (id) => summon(id, 10));
 *
 * The two pull buttons emit the *banner id*, not just a click, so one listener
 * handles every banner in the rotation.
 */
export class BannerCarousel extends FuiComponent<BannerCarouselOptions> {
  private index: number;
  private tabs: HTMLElement[] = [];
  private stage: HTMLElement;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: BannerCarouselOptions) {
    const root = h('div', { class: 'fui fui-banners' });
    super(root, opts);
    this.index = clamp(opts.index ?? 0, 0, Math.max(0, opts.banners.length - 1));

    const tabs = h('div', { class: 'fui-banners__tabs', attrs: { role: 'tablist' } });
    opts.banners.forEach((banner, i) => {
      const tab = h('button', {
        class: 'fui-banners__tab',
        text: banner.title,
        style: banner.color ? { '--fui-banner-ink': banner.color } : {},
        attrs: { type: 'button', role: 'tab' },
      });
      tab.addEventListener('click', () => this.go(i, true));
      this.tabs.push(tab);
      tabs.appendChild(tab);
    });
    root.appendChild(tabs);

    this.stage = h('div', { class: 'fui-banners__stage' });
    root.appendChild(this.stage);

    const actions = h('div', { class: 'fui-banners__actions' });
    const one = h('button', {
      class: 'fui-banners__pull',
      text: opts.pullLabel ?? 'Summon ×1',
      attrs: { type: 'button' },
    });
    one.addEventListener('click', () => this.emit('banner:pull', this.current().id));
    const ten = h('button', {
      class: 'fui-banners__pull fui-banners__pull--multi',
      text: opts.multiLabel ?? 'Summon ×10',
      attrs: { type: 'button' },
    });
    ten.addEventListener('click', () => this.emit('banner:multi', this.current().id));
    actions.append(one, ten);
    root.appendChild(actions);

    if (opts.autoplay && opts.banners.length > 1) {
      this.timer = setInterval(() => this.go((this.index + 1) % opts.banners.length), opts.autoplay);
      root.addEventListener('pointerenter', () => this.pause());
    }
    this.onDestroy(() => this.pause());
    this.render();
  }

  /** The banner currently on stage. */
  current(): SummonBanner {
    return this.opts.banners[this.index];
  }

  go(index: number, manual = false): this {
    if (manual) this.pause();
    const next = clamp(index, 0, this.opts.banners.length - 1);
    if (next === this.index) return this;
    this.index = next;
    this.render();
    this.emit('banner:change', this.current().id);
    return this;
  }

  pause(): this {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return this;
  }

  private render(): void {
    const banner = this.current();
    this.tabs.forEach((tab, i) => {
      tab.classList.toggle('is-on', i === this.index);
      tab.setAttribute('aria-selected', String(i === this.index));
    });

    clear(this.stage);
    if (banner.color) this.stage.style.setProperty('--fui-banner-ink', banner.color);
    this.stage.style.setProperty(
      '--fui-banner-art',
      banner.art ? `var(--fui-img-${banner.art})` : 'none',
    );

    if (banner.featured) {
      this.stage.appendChild(
        h('span', {
          class: 'fui-banners__featured',
          style: { backgroundImage: `var(--fui-img-${banner.featured})` },
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }

    const body = h('div', { class: 'fui-banners__body' });
    body.appendChild(h('p', { class: 'fui-banners__title fui-title', text: banner.title }));
    if (banner.subtitle) {
      body.appendChild(h('p', { class: 'fui-banners__subtitle', text: banner.subtitle }));
    }
    const meta = h('div', { class: 'fui-banners__meta' });
    if (banner.rate) meta.appendChild(h('span', { class: 'fui-banners__rate', text: banner.rate }));
    if (banner.cost) meta.appendChild(h('span', { class: 'fui-banners__cost', text: banner.cost }));
    if (banner.endsIn) {
      meta.appendChild(
        h('span', { class: 'fui-banners__ends fui-num', text: duration(banner.endsIn) + ' left' }),
      );
    }
    if (meta.childNodes.length) body.appendChild(meta);
    this.stage.appendChild(body);
  }
}
