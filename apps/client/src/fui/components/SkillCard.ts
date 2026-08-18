// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp, duration } from '../core/dom.ts';

export interface SkillEffect {
  /** Short effect name — "Decrease DEF", "Block Debuffs". */
  label: string;
  /** Glyph asset id for the effect's icon. */
  glyph?: string;
  /** How long it lasts, in turns. */
  turns?: number;
  /** Renders as a harmful effect rather than a helpful one. */
  debuff?: boolean;
}

export interface SkillCardOptions extends BaseOptions {
  name: string;
  /** Manifest asset id for the ability art. */
  art?: string;
  description?: string;
  /** Cooldown in turns. */
  cooldown?: number;
  /** Turns still to wait. Zero means ready. */
  remaining?: number;
  /** Skill level, e.g. 5. */
  level?: number;
  maxLevel?: number;
  /** Multiplier line — "6.2 × ATK". */
  multiplier?: string;
  /** Effects the skill applies. */
  effects?: SkillEffect[];
  /** Passive skills have no cooldown and read differently. */
  passive?: boolean;
  /** The unit's signature ability — gets the gold treatment. */
  ultimate?: boolean;
  /** Books / upgrade materials still needed to max it. */
  booksToMax?: number;
  compact?: boolean;
}

/**
 * A champion's ability, laid out the way a squad-RPG skill page does it: art,
 * name, cooldown, level, damage multiplier and the buffs or debuffs it applies.
 *
 *   new SkillCard({
 *     name: 'Sundering Toll',
 *     art: 'fire-phoenix-rise',
 *     description: 'Attacks all enemies. Has a 40% chance of placing a Decrease DEF debuff for 2 turns.',
 *     cooldown: 4, remaining: 2, level: 5, maxLevel: 8,
 *     multiplier: '3.1 × ATK',
 *     effects: [{ label: 'Decrease DEF', turns: 2, debuff: true, glyph: 'glyph-shield-block' }],
 *     ultimate: true,
 *   });
 *
 * `setRemaining` drives the cooldown sweep, so the same card works on a static
 * skill page and inside a live battle HUD.
 */
export class SkillCard extends FuiComponent<SkillCardOptions> {
  private sweep: HTMLElement | null = null;
  private cdText: HTMLElement | null = null;
  private wasReady = true;

  constructor(opts: SkillCardOptions) {
    const root = h('div', { class: 'fui fui-skill' });
    if (opts.ultimate) root.classList.add('fui-skill--ultimate');
    if (opts.compact) root.classList.add('fui-skill--compact');
    super(root, opts);

    const art = h('div', { class: 'fui-skill__art' });
    if (opts.art) art.style.backgroundImage = `var(--fui-img-${opts.art})`;

    if (!opts.passive && opts.cooldown) {
      this.sweep = h('span', { class: 'fui-skill__sweep', attrs: { 'aria-hidden': 'true' } });
      this.cdText = h('span', { class: 'fui-skill__cd fui-num' });
      art.append(this.sweep, this.cdText);
    }
    if (opts.passive) art.appendChild(h('span', { class: 'fui-skill__passive', text: 'Passive' }));
    root.appendChild(art);

    const main = h('div', { class: 'fui-skill__main' });
    const head = h('div', { class: 'fui-skill__head' });
    head.appendChild(h('span', { class: 'fui-skill__name fui-title', text: opts.name }));
    if (opts.level != null) {
      head.appendChild(
        h('span', {
          class: 'fui-skill__level fui-num',
          text: opts.maxLevel ? `Lv ${opts.level}/${opts.maxLevel}` : `Lv ${opts.level}`,
          dataset: { maxed: String(opts.maxLevel != null && opts.level >= opts.maxLevel) },
        }),
      );
    }
    main.appendChild(head);

    if (opts.multiplier) {
      main.appendChild(h('span', { class: 'fui-skill__mult', text: opts.multiplier }));
    }
    if (opts.description) {
      main.appendChild(h('p', { class: 'fui-skill__desc fui-body', text: opts.description }));
    }

    if (opts.effects?.length) {
      const list = h('div', { class: 'fui-skill__effects' });
      for (const fx of opts.effects) {
        const chip = h('span', {
          class: 'fui-skill__effect',
          dataset: { kind: fx.debuff ? 'debuff' : 'buff' },
        });
        if (fx.glyph) {
          chip.appendChild(
            h('span', {
              class: 'fui-skill__effect-glyph',
              style: { '--fui-glyph-src': `var(--fui-img-${fx.glyph})` },
            }),
          );
        }
        chip.appendChild(h('span', { text: fx.label }));
        if (fx.turns) chip.appendChild(h('span', { class: 'fui-skill__turns', text: `${fx.turns}T` }));
        list.appendChild(chip);
      }
      main.appendChild(list);
    }

    const foot = h('div', { class: 'fui-skill__foot' });
    if (!opts.passive && opts.cooldown) {
      foot.appendChild(
        h('span', { class: 'fui-skill__meta', text: `Cooldown ${opts.cooldown} turns` }),
      );
    }
    if (opts.booksToMax) {
      foot.appendChild(
        h('span', { class: 'fui-skill__books', text: `${opts.booksToMax} books to max` }),
      );
    }
    if (foot.childNodes.length) main.appendChild(foot);

    root.appendChild(main);
    this.setRemaining(opts.remaining ?? 0);
  }

  /** Set turns left on the cooldown. Zero clears the sweep and reads "Ready". */
  setRemaining(turns: number): this {
    const cd = this.opts.cooldown ?? 0;
    const left = clamp(turns, 0, cd);
    this.el.classList.toggle('is-ready', left === 0);
    if (this.sweep) this.sweep.style.setProperty('--fui-skill-p', String(cd ? left / cd : 0));
    if (this.cdText) this.cdText.textContent = left > 0 ? String(left) : '';
    this.el.setAttribute('aria-disabled', String(left > 0));
    // Only the transition is an event; a card that starts ready has not just
    // come off cooldown.
    if (left === 0 && !this.wasReady) this.emit('skill:ready');
    this.wasReady = left === 0;
    return this;
  }

  /** Seconds-based cooldowns, for real-time games rather than turn-based ones. */
  setSeconds(seconds: number, total: number): this {
    const left = clamp(seconds, 0, total);
    this.el.classList.toggle('is-ready', left === 0);
    if (this.sweep) this.sweep.style.setProperty('--fui-skill-p', String(total ? left / total : 0));
    if (this.cdText) this.cdText.textContent = left > 0 ? duration(left) : '';
    return this;
  }
}
