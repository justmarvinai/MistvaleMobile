// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface Achievement {
  id?: string;
  title: string;
  /** Requirement line, e.g. `'Defeat the Warden without taking damage.'` */
  description?: string;
  /** Asset id for the badge art. */
  icon?: string;
  /** Gamerscore-style points. */
  points?: number;
  /** `bronze` | `silver` | `gold` | `platinum` — drives the metal treatment. */
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum';
  /** Milliseconds on screen. Default 4200. */
  duration?: number;
}

export interface AchievementPopupOptions extends BaseOptions {
  position?: 'top' | 'bottom';
}

/**
 * The achievement unlock banner: a badge that slides in, holds, and slides out.
 * One instance queues however many unlock at once.
 *
 * Emits `achievement:show` and `achievement:hide`.
 *
 *   const achievements = new AchievementPopup({ mount: document.body });
 *   achievements.unlock({ title: 'Untouched', tier: 'gold', points: 50,
 *     icon: 'icon-shield', description: 'Defeat the Warden without taking damage.' });
 */
export class AchievementPopup extends FuiComponent<AchievementPopupOptions> {
  private queue: Achievement[] = [];
  private showing = false;

  constructor(opts: AchievementPopupOptions = {}) {
    const root = h('div', {
      class: 'fui fui-achieve',
      dataset: { position: opts.position ?? 'top' },
      attrs: { role: 'status', 'aria-live': 'polite' },
    });
    super(root, opts);
  }

  /** Queue an unlock. Multiple unlocks play one after another. */
  unlock(achievement: Achievement): this {
    this.queue.push(achievement);
    if (!this.showing) this.next();
    return this;
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.showing = false;
      return;
    }
    this.showing = true;

    const card = h('div', { class: 'fui-achieve__card', dataset: { tier: item.tier ?? 'bronze' } });
    card.appendChild(h('span', { class: 'fui-achieve__shine', attrs: { 'aria-hidden': 'true' } }));

    const badge = h('span', { class: 'fui-achieve__badge' });
    if (item.icon) badge.style.backgroundImage = `var(--fui-img-${item.icon})`;
    card.appendChild(badge);

    const body = h('div', { class: 'fui-achieve__body' });
    body.appendChild(h('div', { class: 'fui-achieve__eyebrow', text: 'Achievement Unlocked' }));
    body.appendChild(h('div', { class: 'fui-achieve__title', text: item.title }));
    if (item.description) {
      body.appendChild(h('div', { class: 'fui-achieve__desc', text: item.description }));
    }
    card.appendChild(body);

    if (item.points != null) {
      card.appendChild(h('span', { class: 'fui-achieve__points fui-num', text: `${item.points}` }));
    }

    this.el.appendChild(card);
    requestAnimationFrame(() => card.classList.add('is-in'));
    this.emit('achievement:show', item);

    const life = item.duration ?? 4200;
    setTimeout(() => {
      card.classList.remove('is-in');
      card.addEventListener(
        'transitionend',
        () => {
          card.remove();
          this.emit('achievement:hide', item);
          this.next();
        },
        { once: true },
      );
    }, life);
  }
}
