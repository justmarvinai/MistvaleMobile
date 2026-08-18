// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, clamp, commas } from '../core/dom.ts';

export interface CodexResist {
  label: string;
  /** −1 (weak) through 0 (neutral) to 1 (immune). */
  value: number;
  color?: string;
}

export interface CodexDrop {
  name: string;
  /** Manifest asset id for the drop's art. */
  art?: string;
  rarity?: Rarity;
  /** Drop chance as a percentage. */
  chance?: number;
}

export interface CodexEntryOptions extends BaseOptions {
  name: string;
  /** Line under the name — family, region, threat level. */
  subtitle?: string;
  /** Manifest asset id for the illustration. */
  art?: string;
  /** Type tags — "Undead", "Flying", "Boss". */
  tags?: string[];
  /** Flavour text. */
  lore?: string;
  /** Stat readouts down the side. */
  stats?: Array<{ label: string; value: string | number }>;
  /** Elemental resistances, drawn as a signed bar each. */
  resists?: CodexResist[];
  /** What it drops. */
  drops?: CodexDrop[];
  /** How many have been slain, against the codex target. */
  slain?: number;
  slainTarget?: number;
  /** Not yet encountered — the whole entry renders as a silhouette. */
  undiscovered?: boolean;
}

/**
 * A bestiary page: illustration, type tags, lore, stats, resistances and drop
 * table — the reference screen a player opens before deciding what to bring.
 *
 *   new CodexEntry({
 *     name: 'Gravebound Revenant',
 *     subtitle: 'Undead · Emberwood Vale · Threat 4',
 *     art: 'blood-necromancer',
 *     tags: ['Undead', 'Caster'],
 *     lore: 'Bound to the gate it failed to hold, and still holding it.',
 *     stats: [{ label: 'HP', value: 184_000 }, { label: 'SPD', value: 118 }],
 *     resists: [{ label: 'Fire', value: -0.5 }, { label: 'Dark', value: 0.9 }],
 *     drops: [{ name: 'Rotbone Charm', art: 'rune-crystal-shard', rarity: 'epic', chance: 12 }],
 *     slain: 34, slainTarget: 50,
 *   });
 *
 * `undiscovered` renders the whole entry as a silhouette with the text hidden,
 * which is the state most of a bestiary is in at any moment.
 */
export class CodexEntry extends FuiComponent<CodexEntryOptions> {
  constructor(opts: CodexEntryOptions) {
    const root = h('div', { class: 'fui fui-codex' });
    if (opts.undiscovered) root.classList.add('is-undiscovered');
    super(root, opts);

    // ── Illustration ──────────────────────────────────────────────────────
    const plate = h('div', { class: 'fui-codex__plate' });
    const art = h('span', { class: 'fui-codex__art' });
    if (opts.art) art.style.backgroundImage = `var(--fui-img-${opts.art})`;
    plate.appendChild(art);
    if (opts.slain != null) {
      const target = opts.slainTarget ?? opts.slain;
      plate.appendChild(
        h(
          'div',
          {
            class: 'fui-codex__slain',
            style: { '--fui-codex-p': String(clamp(opts.slain / Math.max(1, target), 0, 1)) },
          },
          h('span', { class: 'fui-codex__slain-fill' }),
          h('span', {
            class: 'fui-codex__slain-text fui-num',
            text: `${commas(opts.slain)} / ${commas(target)} slain`,
          }),
        ),
      );
    }
    root.appendChild(plate);

    // ── Body ──────────────────────────────────────────────────────────────
    const body = h('div', { class: 'fui-codex__body' });
    body.appendChild(
      h('p', {
        class: 'fui-codex__name fui-title',
        text: opts.undiscovered ? '???' : opts.name,
      }),
    );
    if (opts.subtitle && !opts.undiscovered) {
      body.appendChild(h('p', { class: 'fui-codex__subtitle', text: opts.subtitle }));
    }

    if (opts.tags?.length && !opts.undiscovered) {
      const tags = h('div', { class: 'fui-codex__tags' });
      for (const tag of opts.tags) tags.appendChild(h('span', { class: 'fui-codex__tag', text: tag }));
      body.appendChild(tags);
    }

    if (opts.lore && !opts.undiscovered) {
      body.appendChild(h('p', { class: 'fui-codex__lore fui-body', text: opts.lore }));
    }

    if (opts.stats?.length && !opts.undiscovered) {
      const stats = h('div', { class: 'fui-codex__stats' });
      for (const stat of opts.stats) {
        const row = h('div', { class: 'fui-codex__stat' });
        row.appendChild(h('span', { class: 'fui-codex__stat-label', text: stat.label }));
        row.appendChild(
          h('span', {
            class: 'fui-codex__stat-value fui-num',
            text: typeof stat.value === 'number' ? commas(stat.value) : stat.value,
          }),
        );
        stats.appendChild(row);
      }
      body.appendChild(stats);
    }

    if (opts.resists?.length && !opts.undiscovered) {
      const wrap = h('div', { class: 'fui-codex__resists' });
      wrap.appendChild(h('span', { class: 'fui-codex__section fui-label', text: 'Resistances' }));
      for (const r of opts.resists) {
        const v = clamp(r.value, -1, 1);
        const row = h('div', {
          class: 'fui-codex__resist',
          dataset: { dir: v > 0.05 ? 'resist' : v < -0.05 ? 'weak' : 'flat' },
          // The bar grows from the centre in either direction, so weakness and
          // resistance are the same readout rather than two different ones.
          style: { '--fui-codex-v': String(Math.abs(v)), ...(r.color ? { '--fui-codex-ink': r.color } : {}) },
        });
        row.appendChild(h('span', { class: 'fui-codex__resist-label', text: r.label }));
        row.appendChild(h('span', { class: 'fui-codex__resist-bar' }));
        row.appendChild(
          h('span', {
            class: 'fui-codex__resist-value fui-num',
            text: `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)}%`,
          }),
        );
        wrap.appendChild(row);
      }
      body.appendChild(wrap);
    }

    if (opts.drops?.length && !opts.undiscovered) {
      const wrap = h('div', { class: 'fui-codex__drops' });
      wrap.appendChild(h('span', { class: 'fui-codex__section fui-label', text: 'Drops' }));
      const list = h('div', { class: 'fui-codex__drop-list' });
      for (const drop of opts.drops) {
        const cell = h('span', {
          class: 'fui-codex__drop',
          dataset: { rarity: drop.rarity ?? 'common' },
          attrs: { title: drop.name },
        });
        if (drop.art) cell.style.backgroundImage = `var(--fui-img-${drop.art})`;
        if (drop.chance != null) {
          cell.appendChild(
            h('span', { class: 'fui-codex__drop-chance fui-num', text: `${drop.chance}%` }),
          );
        }
        list.appendChild(cell);
      }
      wrap.appendChild(list);
      body.appendChild(wrap);
    }

    root.appendChild(body);
  }
}
