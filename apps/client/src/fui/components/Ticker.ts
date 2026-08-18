// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';

export interface TickerMessage {
  /** The announcement itself. */
  text: string;
  /** Who or what is speaking — "Server", a player name, an event. */
  from?: string;
  /** Recolours the entry. */
  tone?: 'info' | 'warn' | 'rare' | 'event';
  /** Glyph asset id shown before the message. */
  glyph?: string;
}

export interface TickerOptions extends BaseOptions {
  messages: TickerMessage[];
  /** Seconds for one message to cross the rail. Longer is slower. */
  speed?: number;
  /** Glyph asset id for the fixed badge on the left. */
  glyph?: string;
  /** Fixed label on the left, e.g. "World". */
  label?: string;
  /** Pause the scroll while the pointer is over it. */
  pauseOnHover?: boolean;
}

/**
 * The scrolling announcement rail — legendary summons, boss kills, server
 * notices. The one piece of a game's UI that exists purely to make other
 * players' luck visible.
 *
 *   const ticker = new Ticker({
 *     label: 'World',
 *     glyph: 'glyph-shooting-stars',
 *     messages: [
 *       { from: 'Rhogar', text: 'summoned Vexhollow from an Ancient Shard!', tone: 'rare' },
 *       { from: 'Server', text: 'Ember Ascendant ends in 3 hours.', tone: 'event' },
 *     ],
 *   });
 *   ticker.push({ from: 'Nell', text: 'cleared Nightmare for the first time!', tone: 'rare' });
 *
 * The scroll is a CSS animation over a duplicated track, so it loops seamlessly
 * with no timer and stops dead under `prefers-reduced-motion`.
 */
export class Ticker extends FuiComponent<TickerOptions> {
  private track: HTMLElement;
  private messages: TickerMessage[];

  constructor(opts: TickerOptions) {
    const root = h('div', {
      class: 'fui fui-ticker',
      style: { '--fui-ticker-speed': `${opts.speed ?? 26}s` },
      attrs: { role: 'log', 'aria-live': 'polite' },
    });
    if (opts.pauseOnHover ?? true) root.classList.add('fui-ticker--pausable');
    super(root, opts);
    this.messages = [...opts.messages];

    if (opts.label || opts.glyph) {
      const badge = h('div', { class: 'fui-ticker__badge' });
      if (opts.glyph) {
        badge.appendChild(
          h('span', {
            class: 'fui-ticker__badge-glyph',
            style: { '--fui-glyph-src': `var(--fui-img-${opts.glyph})` },
          }),
        );
      }
      if (opts.label) badge.appendChild(h('span', { text: opts.label }));
      root.appendChild(badge);
    }

    this.track = h('div', { class: 'fui-ticker__track' });
    root.appendChild(h('div', { class: 'fui-ticker__viewport' }, this.track));
    this.render();
  }

  /** Append a message. It appears on the next pass of the rail. */
  push(message: TickerMessage): this {
    this.messages.push(message);
    this.render();
    this.emit('ticker:message', message);
    return this;
  }

  setMessages(messages: TickerMessage[]): this {
    this.messages = [...messages];
    this.render();
    return this;
  }

  private render(): void {
    clear(this.track);
    if (this.messages.length === 0) return;

    // The run is emitted twice back to back. The animation translates by
    // exactly one run's width, so the second copy is already in place when the
    // first scrolls off and the loop has no visible seam.
    for (const pass of [0, 1]) {
      const run = h('div', {
        class: 'fui-ticker__run',
        attrs: pass === 1 ? { 'aria-hidden': 'true' } : {},
      });
      for (const msg of this.messages) {
        const item = h('span', {
          class: 'fui-ticker__item',
          dataset: { tone: msg.tone ?? 'info' },
        });
        if (msg.glyph) {
          item.appendChild(
            h('span', {
              class: 'fui-ticker__glyph',
              style: { '--fui-glyph-src': `var(--fui-img-${msg.glyph})` },
            }),
          );
        }
        if (msg.from) item.appendChild(h('span', { class: 'fui-ticker__from', text: msg.from }));
        item.appendChild(h('span', { class: 'fui-ticker__text', text: msg.text }));
        run.appendChild(item);
      }
      this.track.appendChild(run);
    }
  }
}
