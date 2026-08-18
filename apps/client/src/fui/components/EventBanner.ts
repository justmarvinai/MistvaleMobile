// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp, duration } from '../core/dom.ts';

export interface EventBannerOptions extends BaseOptions {
  title: string;
  /** Line under the title — what the event actually is. */
  subtitle?: string;
  /** Background art asset id. */
  art?: string;
  /** Corner ribbon — "NEW", "2× DROPS", "ENDS SOON". */
  tag?: string;
  /** Seconds remaining. Ticks down on its own and emits `event:expire`. */
  endsIn?: number;
  /** Progress through the event, 0–1, drawn as a bar along the bottom. */
  progress?: number;
  /** Text under the progress bar, e.g. "12 / 30 stages". */
  progressLabel?: string;
  /** Accent colour for the tag, bar and rim. */
  color?: string;
  /** Label for the call to action. */
  action?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * The live-ops tile: a piece of key art, a name, a countdown and a way in. The
 * unit an events hub is tiled from.
 *
 *   const banner = new EventBanner({
 *     title: 'Ember Ascendant', subtitle: 'Double fire shard drops',
 *     art: 'fire-phoenix-rise', tag: '2× DROPS',
 *     endsIn: 3 * 3600, progress: 0.4, progressLabel: '12 / 30 stages',
 *     color: '#ff7a3d', action: 'Enter',
 *   });
 *   banner.on('event:enter', () => go('/events/ember'));
 *
 * The countdown owns its own interval and clears it on `destroy()`, so a hub
 * with twelve of these does not leak twelve timers.
 */
export class EventBanner extends FuiComponent<EventBannerOptions> {
  private remaining: number;
  private timeEl: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: EventBannerOptions) {
    const root = h('div', {
      class: 'fui fui-event',
      dataset: { size: opts.size ?? 'md' },
      style: {
        ...(opts.color ? { '--fui-event-ink': opts.color } : {}),
        ...(opts.art ? { '--fui-event-art': `var(--fui-img-${opts.art})` } : {}),
        ...(opts.progress != null
          ? { '--fui-event-p': String(clamp(opts.progress, 0, 1)) }
          : {}),
      },
      attrs: { role: 'group' },
    });
    super(root, opts);
    this.remaining = opts.endsIn ?? 0;

    root.appendChild(h('span', { class: 'fui-event__art', attrs: { 'aria-hidden': 'true' } }));

    if (opts.tag) {
      root.appendChild(h('span', { class: 'fui-event__tag', text: opts.tag }));
    }

    const body = h('div', { class: 'fui-event__body' });
    body.appendChild(h('p', { class: 'fui-event__title fui-title', text: opts.title }));
    if (opts.subtitle) {
      body.appendChild(h('p', { class: 'fui-event__subtitle', text: opts.subtitle }));
    }

    if (opts.endsIn != null) {
      this.timeEl = h('span', { class: 'fui-event__time fui-num' });
      body.appendChild(this.timeEl);
      this.tick();
      this.timer = setInterval(() => this.tick(), 1000);
      this.onDestroy(() => {
        if (this.timer) clearInterval(this.timer);
      });
    }
    root.appendChild(body);

    if (opts.progress != null) {
      const bar = h('div', { class: 'fui-event__progress' }, h('span', { class: 'fui-event__fill' }));
      root.appendChild(bar);
      if (opts.progressLabel) {
        root.appendChild(h('span', { class: 'fui-event__progress-label', text: opts.progressLabel }));
      }
    }

    if (opts.action) {
      const btn = h('button', {
        class: 'fui-event__action',
        text: opts.action,
        attrs: { type: 'button' },
      });
      btn.addEventListener('click', () => this.emit('event:enter'));
      root.appendChild(btn);
    }
  }

  /** Seconds remaining right now. */
  getRemaining(): number {
    return this.remaining;
  }

  /** Reset the countdown, e.g. after the server sends a fresh end time. */
  setRemaining(seconds: number): this {
    this.remaining = Math.max(0, seconds);
    this.tick(false);
    return this;
  }

  private tick(advance = true): void {
    if (advance && this.remaining > 0) this.remaining -= 1;
    if (this.timeEl) {
      this.timeEl.textContent = this.remaining > 0 ? `Ends in ${duration(this.remaining)}` : 'Ended';
    }
    // Under an hour the countdown turns urgent — the visual half of the same
    // pressure the number is already applying.
    this.el.classList.toggle('is-urgent', this.remaining > 0 && this.remaining < 3600);
    if (advance && this.remaining === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.el.classList.add('is-over');
      this.emit('event:expire');
    }
  }
}
