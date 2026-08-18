// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, commas } from '../core/dom.ts';
import { Button } from './Button.ts';

export interface LevelUpGain {
  label: string;
  /** e.g. `+3` or `+12 Max Health`. */
  value: string | number;
  icon?: string;
}

export interface LevelUpUnlock {
  icon: string;
  name: string;
  /** Short line under the name. */
  detail?: string;
}

export interface LevelUpModalOptions extends BaseOptions {
  level: number;
  /** Headline. Defaults to `'Level Up'`. */
  title?: string;
  /** Class or archetype line, e.g. `'Warden of the Vale'`. */
  subtitle?: string;
  gains?: LevelUpGain[];
  unlocks?: LevelUpUnlock[];
  /** Skill points awarded, shown as a highlighted chip. */
  points?: number;
  confirmLabel?: string;
}

/**
 * The level-up celebration: a burst of light, the new level in large type,
 * stat gains and any newly unlocked abilities.
 *
 * Emits `levelup:confirm` when dismissed.
 *
 *   const up = new LevelUpModal({ level: 12, points: 2,
 *     gains: [{ label: 'Max Health', value: '+18' }],
 *     unlocks: [{ icon: 'skill-thunderhammer', name: 'Thunder Hammer' }] });
 *   up.open();
 */
export class LevelUpModal extends FuiComponent<LevelUpModalOptions> {
  constructor(opts: LevelUpModalOptions) {
    const root = h('div', {
      class: 'fui fui-levelup',
      attrs: { role: 'dialog', 'aria-modal': 'true' },
    });
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-levelup__scrim', attrs: { 'aria-hidden': 'true' } }));
    root.appendChild(h('div', { class: 'fui-levelup__burst', attrs: { 'aria-hidden': 'true' } }));

    const card = h('div', { class: 'fui-levelup__card' });
    card.appendChild(
      h('p', { class: 'fui-levelup__eyebrow', text: opts.title ?? 'Level Up' }),
    );
    card.appendChild(h('div', { class: 'fui-levelup__level fui-num', text: String(opts.level) }));
    if (opts.subtitle) {
      card.appendChild(h('p', { class: 'fui-levelup__subtitle', text: opts.subtitle }));
    }
    card.appendChild(h('div', { class: 'fui-levelup__rule', attrs: { 'aria-hidden': 'true' } }));

    if (opts.gains?.length) {
      const list = h('dl', { class: 'fui-levelup__gains' });
      for (const g of opts.gains) {
        list.append(
          h('dt', { text: g.label }),
          h('dd', {
            class: 'fui-num',
            text: typeof g.value === 'number' ? `+${commas(g.value)}` : String(g.value),
          }),
        );
      }
      card.appendChild(list);
    }

    if (opts.points) {
      card.appendChild(
        h('div', {
          class: 'fui-levelup__points',
          text: `${opts.points} skill point${opts.points === 1 ? '' : 's'} to spend`,
        }),
      );
    }

    if (opts.unlocks?.length) {
      card.appendChild(h('h3', { class: 'fui-levelup__sub fui-label', text: 'Unlocked' }));
      const unlocks = h('div', { class: 'fui-levelup__unlocks' });
      for (const u of opts.unlocks) {
        unlocks.appendChild(
          h(
            'div',
            { class: 'fui-levelup__unlock' },
            h('span', {
              class: 'fui-levelup__uicon',
              style: { backgroundImage: `var(--fui-img-${u.icon})` },
            }),
            h(
              'span',
              { class: 'fui-levelup__utext' },
              h('span', { class: 'fui-levelup__uname', text: u.name }),
              u.detail && h('small', { text: u.detail }),
            ),
          ),
        );
      }
      card.appendChild(unlocks);
    }

    card.appendChild(
      new Button({
        label: opts.confirmLabel ?? 'Continue',
        size: 'lg',
        class: 'fui-levelup__btn',
        onClick: () => {
          this.close();
          this.emit('levelup:confirm', { level: opts.level });
        },
      }).el,
    );

    root.appendChild(card);
  }

  open(parent?: Element): this {
    if (!this.el.parentNode) (parent ?? this.el.ownerDocument.body).appendChild(this.el);
    requestAnimationFrame(() => this.el.classList.add('is-open'));
    return this;
  }

  close(): this {
    this.el.classList.remove('is-open');
    return this;
  }
}
