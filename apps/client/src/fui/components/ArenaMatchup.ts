// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h, commas } from '../core/dom.ts';

export interface MatchupUnit {
  name?: string;
  /** Manifest asset id for the portrait. */
  art?: string;
  rarity?: Rarity;
  level?: number;
  stars?: number;
}

export interface MatchupSide {
  /** Player or clan name. */
  name: string;
  /** Avatar / crest asset id. */
  art?: string;
  /** Total team power. */
  power?: number;
  /** Arena rank or tier. */
  rank?: string;
  /** The squad being fielded. */
  units?: MatchupUnit[];
  /** Colour for this side's accents. */
  color?: string;
}

export interface ArenaMatchupOptions extends BaseOptions {
  left: MatchupSide;
  right: MatchupSide;
  /** Text in the middle divider. Defaults to "VS". */
  divider?: string;
  /** Win chance for the left side, 0–100. Drawn as a tug-of-war bar. */
  odds?: number;
  /** Label on the fight button. Omit to render no button. */
  action?: string;
  /** What is at stake — "+24 / −11 points". */
  stake?: string;
}

/**
 * The pre-battle versus screen: two teams face to face, their power compared,
 * the odds between them, and the button that starts it.
 *
 *   const match = new ArenaMatchup({
 *     left: { name: 'You', power: 184_320, rank: 'Gold III', units: myTeam },
 *     right: { name: 'Ashvale', power: 201_900, rank: 'Gold I', units: theirTeam, color: '#c0392b' },
 *     odds: 42, stake: '+24 / −11 points', action: 'Battle',
 *   });
 *   match.on('arena:fight', () => startBattle());
 *
 * The odds bar is deliberately a single tug-of-war rather than two percentages:
 * the player only needs to know which way it leans and by how much.
 */
export class ArenaMatchup extends FuiComponent<ArenaMatchupOptions> {
  constructor(opts: ArenaMatchupOptions) {
    const root = h('div', {
      class: 'fui fui-matchup',
      style: {
        ...(opts.left.color ? { '--fui-vs-left': opts.left.color } : {}),
        ...(opts.right.color ? { '--fui-vs-right': opts.right.color } : {}),
        ...(opts.odds != null ? { '--fui-vs-odds': String(opts.odds / 100) } : {}),
      },
    });
    super(root, opts);

    const board = h('div', { class: 'fui-matchup__board' });
    board.appendChild(this.makeSide(opts.left, 'left'));
    board.appendChild(
      h('div', { class: 'fui-matchup__divider' }, h('span', { text: opts.divider ?? 'VS' })),
    );
    board.appendChild(this.makeSide(opts.right, 'right'));
    root.appendChild(board);

    if (opts.odds != null) {
      const odds = h('div', { class: 'fui-matchup__odds' });
      odds.appendChild(h('span', { class: 'fui-matchup__odds-value fui-num', text: `${Math.round(opts.odds)}%` }));
      odds.appendChild(h('span', { class: 'fui-matchup__odds-bar' }));
      odds.appendChild(
        h('span', {
          class: 'fui-matchup__odds-value fui-num',
          text: `${100 - Math.round(opts.odds)}%`,
        }),
      );
      root.appendChild(odds);
    }

    if (opts.stake) root.appendChild(h('p', { class: 'fui-matchup__stake', text: opts.stake }));

    if (opts.action) {
      const btn = h('button', {
        class: 'fui-matchup__action',
        text: opts.action,
        attrs: { type: 'button' },
      });
      btn.addEventListener('click', () => this.emit('arena:fight'));
      root.appendChild(btn);
    }
  }

  private makeSide(side: MatchupSide, which: 'left' | 'right'): HTMLElement {
    const el = h('div', { class: 'fui-matchup__side', dataset: { side: which } });

    const head = h('div', { class: 'fui-matchup__head' });
    const avatar = h('span', { class: 'fui-matchup__avatar' });
    if (side.art) avatar.style.backgroundImage = `var(--fui-img-${side.art})`;
    const names = h('div', { class: 'fui-matchup__names' });
    names.appendChild(h('span', { class: 'fui-matchup__name fui-title', text: side.name }));
    if (side.rank) names.appendChild(h('span', { class: 'fui-matchup__rank', text: side.rank }));
    head.append(avatar, names);
    el.appendChild(head);

    if (side.power != null) {
      el.appendChild(
        h('span', { class: 'fui-matchup__power fui-num', text: commas(side.power) }),
      );
    }

    if (side.units?.length) {
      const team = h('div', { class: 'fui-matchup__team' });
      for (const unit of side.units) {
        const cell = h('span', {
          class: 'fui-matchup__unit',
          dataset: { rarity: unit.rarity ?? 'common' },
          attrs: { title: unit.name ?? '' },
        });
        if (unit.art) cell.style.backgroundImage = `var(--fui-img-${unit.art})`;
        if (unit.level != null) {
          cell.appendChild(h('span', { class: 'fui-matchup__unit-level fui-num', text: String(unit.level) }));
        }
        team.appendChild(cell);
      }
      el.appendChild(team);
    }
    return el;
  }
}
