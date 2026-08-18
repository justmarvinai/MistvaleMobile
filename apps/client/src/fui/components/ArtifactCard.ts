// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, clamp } from '../core/dom.ts';

export interface SubStat {
  label: string;
  value: string;
  /** How many times this substat has been rolled up. */
  rolls?: number;
}

export interface ArtifactCardOptions extends BaseOptions {
  name: string;
  /** Manifest asset id for the item art. */
  art?: string;
  rarity?: Rarity;
  /** Slot name — Weapon, Helmet, Boots, Ring. */
  slot?: string;
  /** Glyph asset id for the slot pip. */
  slotGlyph?: string;
  /** Set name, e.g. "Lifesteal". Shown as a coloured tag. */
  set?: string;
  setColor?: string;
  /** How many pieces the set needs. */
  setSize?: number;
  level?: number;
  maxLevel?: number;
  /** The headline stat — the reason to equip this piece. */
  mainStat?: { label: string; value: string };
  subStats?: SubStat[];
  /** Champion currently wearing it. */
  equippedBy?: string;
  /** Padlock against accidental sale. */
  locked?: boolean;
  selected?: boolean;
  selectable?: boolean;
  /** Width in pixels. */
  width?: number;
}

/**
 * A gear piece with its main stat, substats, set and upgrade level — the card
 * a squad-RPG's equipment screen is made of.
 *
 *   new ArtifactCard({
 *     name: 'Bloodforged Cuirass',
 *     art: 'weapon-warhammer', rarity: 'legendary',
 *     slot: 'Chest', set: 'Lifesteal', setSize: 4, setColor: '#c0392b',
 *     level: 12, maxLevel: 16,
 *     mainStat: { label: 'ATK%', value: '+48%' },
 *     subStats: [
 *       { label: 'C.RATE', value: '+18%', rolls: 3 },
 *       { label: 'SPD', value: '+12', rolls: 1 },
 *     ],
 *     equippedBy: 'Vexhollow',
 *   });
 *
 * The roll pips on each substat are the detail that makes the card useful:
 * they are what tells a player whether a piece is worth keeping.
 */
export class ArtifactCard extends FuiComponent<ArtifactCardOptions> {
  constructor(opts: ArtifactCardOptions) {
    const root = h('div', {
      class: 'fui fui-artifact',
      dataset: { rarity: opts.rarity ?? 'common' },
      style: {
        ...(opts.width ? { width: `${opts.width}px` } : {}),
        ...(opts.setColor ? { '--fui-art-set': opts.setColor } : {}),
      },
    });
    if (opts.selected) root.classList.add('is-selected');
    super(root, opts);

    const head = h('div', { class: 'fui-artifact__head' });

    const art = h('div', { class: 'fui-artifact__art' });
    if (opts.art) art.style.backgroundImage = `var(--fui-img-${opts.art})`;
    if (opts.level != null) {
      art.appendChild(h('span', { class: 'fui-artifact__level fui-num', text: `+${opts.level}` }));
    }
    head.appendChild(art);

    const title = h('div', { class: 'fui-artifact__title' });
    title.appendChild(h('span', { class: 'fui-artifact__name', text: opts.name }));
    const tags = h('div', { class: 'fui-artifact__tags' });
    if (opts.slot) {
      const slot = h('span', { class: 'fui-artifact__slot' });
      if (opts.slotGlyph) {
        slot.appendChild(
          h('span', {
            class: 'fui-artifact__slot-glyph',
            style: { '--fui-glyph-src': `var(--fui-img-${opts.slotGlyph})` },
          }),
        );
      }
      slot.appendChild(h('span', { text: opts.slot }));
      tags.appendChild(slot);
    }
    if (opts.set) {
      tags.appendChild(
        h('span', {
          class: 'fui-artifact__set',
          text: opts.setSize ? `${opts.set} (${opts.setSize})` : opts.set,
        }),
      );
    }
    if (tags.childNodes.length) title.appendChild(tags);
    head.appendChild(title);

    if (opts.locked) {
      head.appendChild(h('span', { class: 'fui-artifact__lock', attrs: { 'aria-label': 'Locked' } }));
    }
    root.appendChild(head);

    if (opts.mainStat) {
      const main = h('div', { class: 'fui-artifact__main' });
      main.appendChild(h('span', { class: 'fui-artifact__main-label', text: opts.mainStat.label }));
      main.appendChild(
        h('span', { class: 'fui-artifact__main-value fui-num', text: opts.mainStat.value }),
      );
      root.appendChild(main);
    }

    if (opts.subStats?.length) {
      const list = h('ul', { class: 'fui-artifact__subs' });
      for (const sub of opts.subStats) {
        const li = h('li', { class: 'fui-artifact__sub' });
        li.appendChild(h('span', { class: 'fui-artifact__sub-label', text: sub.label }));
        if (sub.rolls) {
          const pips = h('span', { class: 'fui-artifact__rolls', attrs: { 'aria-label': `${sub.rolls} rolls` } });
          for (let i = 0; i < clamp(sub.rolls, 0, 5); i++) {
            pips.appendChild(h('span', { class: 'fui-artifact__roll' }));
          }
          li.appendChild(pips);
        }
        li.appendChild(h('span', { class: 'fui-artifact__sub-value fui-num', text: sub.value }));
        list.appendChild(li);
      }
      root.appendChild(list);
    }

    if (opts.equippedBy) {
      root.appendChild(
        h('div', { class: 'fui-artifact__equipped' }, `Equipped by ${opts.equippedBy}`),
      );
    }

    if (opts.selectable) {
      root.classList.add('is-selectable');
      root.setAttribute('role', 'button');
      root.setAttribute('tabindex', '0');
      const pick = () => {
        root.classList.toggle('is-selected');
        this.emit('artifact:select', root.classList.contains('is-selected'));
      };
      root.addEventListener('click', pick);
      root.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          pick();
        }
      });
    }
  }
}
