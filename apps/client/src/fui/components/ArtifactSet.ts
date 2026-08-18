// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface EquipSlot {
  /** Slot name — Weapon, Helmet, Boots. */
  label: string;
  /** Glyph asset id drawn when the slot is empty. */
  glyph?: string;
  /** Manifest asset id of the equipped piece. */
  art?: string;
  rarity?: Rarity;
  /** Upgrade level printed on the corner. */
  level?: number;
  /** Which set the equipped piece belongs to. */
  set?: string;
}

export interface SetBonus {
  name: string;
  /** Pieces required. */
  need: number;
  /** Pieces currently worn. */
  have: number;
  /** What the bonus does once complete. */
  effect: string;
  color?: string;
}

export interface ArtifactSetOptions extends BaseOptions {
  slots: EquipSlot[];
  bonuses?: SetBonus[];
  /** Cell size in pixels. */
  size?: number;
  /** Heading over the slot row. */
  title?: string;
}

/**
 * The equipped-gear summary: every slot in a row, and underneath it the set
 * bonuses those pieces add up to, with the incomplete ones greyed and counted.
 *
 *   new ArtifactSet({
 *     slots: [
 *       { label: 'Weapon', art: 'weapon-warhammer', rarity: 'legendary', level: 16, set: 'Cruel' },
 *       { label: 'Helmet', glyph: 'glyph-shield-block' },
 *     ],
 *     bonuses: [
 *       { name: 'Cruel', need: 4, have: 2, effect: '+15% ATK', color: '#c0392b' },
 *     ],
 *   });
 *
 * Showing "2 / 4" against a bonus the player has not finished is what turns a
 * gear screen into a goal.
 */
export class ArtifactSet extends FuiComponent<ArtifactSetOptions> {
  constructor(opts: ArtifactSetOptions) {
    const root = h('div', {
      class: 'fui fui-set',
      style: { '--fui-set-size': `${opts.size ?? 62}px` },
    });
    super(root, opts);

    if (opts.title) {
      root.appendChild(h('p', { class: 'fui-set__title fui-label', text: opts.title }));
    }

    const row = h('div', { class: 'fui-set__slots' });
    for (const slot of opts.slots) {
      const cell = h('div', {
        class: 'fui-set__slot',
        dataset: { rarity: slot.rarity ?? 'empty' },
        attrs: { title: slot.set ? `${slot.label} — ${slot.set}` : slot.label },
      });
      if (!slot.art) cell.classList.add('is-empty');

      const art = h('span', { class: 'fui-set__art' });
      if (slot.art) art.style.backgroundImage = `var(--fui-img-${slot.art})`;
      else if (slot.glyph) {
        art.classList.add('is-glyph');
        art.style.setProperty('--fui-glyph-src', `var(--fui-img-${slot.glyph})`);
      }
      cell.appendChild(art);

      if (slot.level != null) {
        cell.appendChild(h('span', { class: 'fui-set__level fui-num', text: `+${slot.level}` }));
      }
      cell.appendChild(h('span', { class: 'fui-set__label', text: slot.label }));
      row.appendChild(cell);
    }
    root.appendChild(row);

    if (opts.bonuses?.length) {
      const list = h('div', { class: 'fui-set__bonuses' });
      for (const bonus of opts.bonuses) {
        const done = bonus.have >= bonus.need;
        const el = h('div', {
          class: 'fui-set__bonus',
          dataset: { done: String(done) },
          style: bonus.color ? { '--fui-set-ink': bonus.color } : {},
        });
        el.appendChild(h('span', { class: 'fui-set__bonus-name', text: bonus.name }));
        el.appendChild(
          h('span', {
            class: 'fui-set__bonus-count fui-num',
            text: `${Math.min(bonus.have, bonus.need)} / ${bonus.need}`,
          }),
        );
        el.appendChild(h('span', { class: 'fui-set__bonus-effect', text: bonus.effect }));
        list.appendChild(el);
      }
      root.appendChild(list);
    }
  }
}
