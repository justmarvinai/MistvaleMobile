// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, commas } from '../core/dom.ts';

export interface MasteryNode {
  id: string;
  name: string;
  /** Glyph asset id for the node's icon. */
  glyph?: string;
  /** Row index, 0-based. Rows unlock in order. */
  tier: number;
  /** Which branch column the node sits in. */
  branch: number;
  /** Points invested. */
  rank?: number;
  /** Points the node can take. */
  maxRank?: number;
  /** Node ids that must be ranked before this one opens. */
  requires?: string[];
  /** A tier's capstone — drawn larger, with a gold rim. */
  keystone?: boolean;
}

export interface MasteryBranch {
  name: string;
  color?: string;
}

export interface MasteryGridOptions extends BaseOptions {
  branches: MasteryBranch[];
  nodes: MasteryNode[];
  /** Points still to spend. */
  points?: number;
  /** Points spent so far. */
  spent?: number;
  /** Clicking a node ranks it up and emits `mastery:rank`. */
  interactive?: boolean;
  /** Cell size in pixels. */
  size?: number;
}

/**
 * The mastery board — a tiered grid of small passive upgrades split across
 * branches, gated by the points spent below each tier. Every long-running
 * squad-RPG ships one of these on top of its skill tree.
 *
 *   const board = new MasteryGrid({
 *     branches: [{ name: 'Offence', color: '#d84b3a' }, { name: 'Defence', color: '#4a8ede' }],
 *     nodes: [
 *       { id: 'blade', name: 'Blade Disciple', tier: 0, branch: 0, rank: 5, maxRank: 5 },
 *       { id: 'cut', name: 'Deep Cuts', tier: 1, branch: 0, rank: 2, maxRank: 5, requires: ['blade'] },
 *     ],
 *     points: 12, spent: 7, interactive: true,
 *   });
 *   board.on('mastery:rank', ({ id, rank }) => save(id, rank));
 *
 * Prerequisites are enforced here rather than left to the caller: a node whose
 * requirements are unmet renders locked and refuses the click.
 */
export class MasteryGrid extends FuiComponent<MasteryGridOptions> {
  private cells = new Map<string, HTMLButtonElement>();
  private ranks = new Map<string, number>();
  private pointsEl: HTMLElement | null = null;

  constructor(opts: MasteryGridOptions) {
    const root = h('div', {
      class: 'fui fui-mastery',
      style: {
        '--fui-mastery-size': `${opts.size ?? 46}px`,
        '--fui-mastery-cols': String(opts.branches.length),
      },
    });
    super(root, opts);

    for (const node of opts.nodes) this.ranks.set(node.id, node.rank ?? 0);

    const head = h('div', { class: 'fui-mastery__head' });
    opts.branches.forEach((branch, i) => {
      head.appendChild(
        h('span', {
          class: 'fui-mastery__branch',
          text: branch.name,
          style: branch.color ? { '--fui-mastery-ink': branch.color } : {},
          dataset: { branch: String(i) },
        }),
      );
    });
    root.appendChild(head);

    const tiers = Math.max(...opts.nodes.map((n) => n.tier)) + 1;
    const board = h('div', { class: 'fui-mastery__board' });
    for (let tier = 0; tier < tiers; tier++) {
      const row = h('div', { class: 'fui-mastery__tier' });
      for (let branch = 0; branch < opts.branches.length; branch++) {
        const node = opts.nodes.find((n) => n.tier === tier && n.branch === branch);
        if (!node) {
          row.appendChild(h('span', { class: 'fui-mastery__gap' }));
          continue;
        }
        row.appendChild(this.makeCell(node, opts.branches[branch]?.color));
      }
      board.appendChild(row);
    }
    root.appendChild(board);

    if (opts.points != null || opts.spent != null) {
      this.pointsEl = h('div', { class: 'fui-mastery__points' });
      root.appendChild(this.pointsEl);
    }
    this.paint();
  }

  private makeCell(node: MasteryNode, color?: string): HTMLButtonElement {
    const cell = h('button', {
      class: 'fui-mastery__node',
      dataset: { id: node.id },
      style: color ? { '--fui-mastery-ink': color } : {},
      attrs: { type: 'button', title: node.name },
    });
    if (node.keystone) cell.classList.add('is-keystone');

    const icon = h('span', { class: 'fui-mastery__icon' });
    if (node.glyph) icon.style.setProperty('--fui-glyph-src', `var(--fui-img-${node.glyph})`);
    cell.appendChild(icon);
    cell.appendChild(
      h('span', {
        class: 'fui-mastery__rank fui-num',
        text: `${node.rank ?? 0}/${node.maxRank ?? 1}`,
      }),
    );
    cell.appendChild(h('span', { class: 'fui-mastery__name', text: node.name }));

    if (this.opts.interactive) {
      cell.addEventListener('click', () => this.rankUp(node.id));
    }
    this.cells.set(node.id, cell);
    return cell;
  }

  /** Whether every prerequisite of a node has at least one point in it. */
  private unlocked(node: MasteryNode): boolean {
    return (node.requires ?? []).every((id) => (this.ranks.get(id) ?? 0) > 0);
  }

  /** Spend one point in a node, if it is unlocked and not already maxed. */
  rankUp(id: string): this {
    const node = this.opts.nodes.find((n) => n.id === id);
    if (!node || !this.unlocked(node)) return this;
    const rank = this.ranks.get(id) ?? 0;
    const max = node.maxRank ?? 1;
    if (rank >= max) return this;
    if (this.opts.points != null && this.opts.points <= 0) return this;

    this.ranks.set(id, rank + 1);
    if (this.opts.points != null) this.opts.points -= 1;
    if (this.opts.spent != null) this.opts.spent += 1;
    this.paint();
    this.emit('mastery:rank', { id, rank: rank + 1 });
    return this;
  }

  /** Every node's current rank, keyed by node id. */
  getRanks(): Record<string, number> {
    return Object.fromEntries(this.ranks);
  }

  private paint(): void {
    for (const node of this.opts.nodes) {
      const cell = this.cells.get(node.id);
      if (!cell) continue;
      const rank = this.ranks.get(node.id) ?? 0;
      const max = node.maxRank ?? 1;
      const open = this.unlocked(node);
      cell.classList.toggle('is-locked', !open);
      cell.classList.toggle('is-active', rank > 0);
      cell.classList.toggle('is-maxed', rank >= max);
      cell.disabled = !this.opts.interactive || !open || rank >= max;
      const readout = cell.querySelector('.fui-mastery__rank');
      if (readout) readout.textContent = `${rank}/${max}`;
    }
    if (this.pointsEl) {
      const parts: string[] = [];
      if (this.opts.points != null) parts.push(`${commas(this.opts.points)} points left`);
      if (this.opts.spent != null) parts.push(`${commas(this.opts.spent)} spent`);
      this.pointsEl.textContent = parts.join(' · ');
    }
  }
}
