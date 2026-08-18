// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';

export interface SkillNode {
  id: string;
  name: string;
  /** Asset id for the ability art. */
  icon: string;
  /** Row in the tree, 0 at the top. */
  tier: number;
  /** Column within the row, 0-indexed. */
  col: number;
  /** Points already invested. */
  rank?: number;
  maxRank?: number;
  /** Node ids that must be maxed before this one unlocks. */
  requires?: string[];
  description?: string;
  /** Diamond-shaped keystone nodes, for capstones. */
  keystone?: boolean;
}

export interface SkillTreeOptions extends BaseOptions {
  title?: string;
  nodes: SkillNode[];
  /** Unspent skill points. */
  points?: number;
  /** Columns in the layout grid. Defaults to the widest tier. */
  columns?: number;
  /** Width in pixels. */
  width?: number;
}

/**
 * The talent tree: tiered nodes wired by dependency lines, with rank pips and
 * point spending. Nodes lock until their prerequisites are maxed.
 *
 * Emits `skill:invest` with `{ node, rank }` and `skill:select` on hover/click.
 *
 *   const tree = new SkillTree({ points: 5, nodes: [
 *     { id: 'a', name: 'Kindling', icon: 'skill-firehand', tier: 0, col: 1, maxRank: 3 },
 *     { id: 'b', name: 'Firestorm', icon: 'skill-comet', tier: 1, col: 1, requires: ['a'] },
 *   ]});
 */
export class SkillTree extends FuiComponent<SkillTreeOptions> {
  private gridEl: HTMLElement;
  private linesEl: SVGSVGElement;
  private points: number;
  private nodeEls = new Map<string, HTMLElement>();

  constructor(opts: SkillTreeOptions) {
    const columns = opts.columns ?? Math.max(...opts.nodes.map((n) => n.col)) + 1;
    const root = h('div', {
      class: 'fui fui-tree',
      style: {
        width: `${opts.width ?? 520}px`,
        '--fui-tree-cols': String(columns),
      },
    });
    super(root, opts);
    this.points = opts.points ?? 0;

    root.appendChild(h('div', { class: 'fui-tree__fill', attrs: { 'aria-hidden': 'true' } }));

    const head = h('header', { class: 'fui-tree__head' });
    head.appendChild(h('h2', { class: 'fui-tree__title fui-title', text: opts.title ?? 'Talents' }));
    head.appendChild(
      h(
        'span',
        { class: 'fui-tree__points' },
        h('span', { class: 'fui-label', text: 'Points' }),
        h('span', { class: 'fui-tree__pointsnum fui-num', text: String(this.points) }),
      ),
    );
    root.appendChild(head);

    const stage = h('div', { class: 'fui-tree__stage' });
    // Dependency lines are drawn in an SVG layer underneath the node grid.
    this.linesEl = root.ownerDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    ) as SVGSVGElement;
    this.linesEl.setAttribute('class', 'fui-tree__lines');
    this.linesEl.setAttribute('aria-hidden', 'true');
    stage.appendChild(this.linesEl);

    this.gridEl = h('div', { class: 'fui-tree__grid' });
    stage.appendChild(this.gridEl);
    root.appendChild(stage);

    this.render();
    // Lines need real geometry, so draw them once layout has settled.
    requestAnimationFrame(() => this.drawLines());
  }

  /** Whether a node's prerequisites are all maxed. */
  isUnlocked(node: SkillNode): boolean {
    if (!node.requires?.length) return true;
    return node.requires.every((id) => {
      const dep = this.opts.nodes.find((n) => n.id === id);
      return dep ? (dep.rank ?? 0) >= (dep.maxRank ?? 1) : true;
    });
  }

  setPoints(points: number): this {
    this.points = points;
    this.render();
    requestAnimationFrame(() => this.drawLines());
    return this;
  }

  /** Spend one point on a node, if it's unlocked and not already maxed. */
  invest(id: string): boolean {
    const node = this.opts.nodes.find((n) => n.id === id);
    if (!node || this.points <= 0) return false;
    if (!this.isUnlocked(node)) return false;
    const rank = node.rank ?? 0;
    const max = node.maxRank ?? 1;
    if (rank >= max) return false;

    node.rank = rank + 1;
    this.points--;
    this.render();
    requestAnimationFrame(() => this.drawLines());
    this.emit('skill:invest', { node, rank: node.rank });
    return true;
  }

  private render(): void {
    clear(this.gridEl);
    this.nodeEls.clear();
    const pointsNum = this.el.querySelector('.fui-tree__pointsnum');
    if (pointsNum) pointsNum.textContent = String(this.points);

    for (const node of this.opts.nodes) {
      const rank = node.rank ?? 0;
      const max = node.maxRank ?? 1;
      const unlocked = this.isUnlocked(node);

      const cell = h('button', {
        class: 'fui-tree__node',
        attrs: { type: 'button', title: node.description ?? node.name },
        style: {
          gridRow: String(node.tier + 1),
          gridColumn: String(node.col + 1),
        },
      });
      if (node.keystone) cell.classList.add('is-keystone');
      if (!unlocked) cell.classList.add('is-locked');
      if (rank > 0) cell.classList.add('is-invested');
      if (rank >= max) cell.classList.add('is-maxed');

      cell.appendChild(
        h('span', {
          class: 'fui-tree__icon',
          style: { backgroundImage: `var(--fui-img-${node.icon})` },
        }),
      );
      cell.appendChild(h('span', { class: 'fui-tree__ring', attrs: { 'aria-hidden': 'true' } }));
      cell.appendChild(h('span', { class: 'fui-tree__rank fui-num', text: `${rank}/${max}` }));
      cell.appendChild(h('span', { class: 'fui-tree__name', text: node.name }));

      cell.addEventListener('click', () => {
        if (!this.invest(node.id)) {
          cell.classList.remove('is-denied');
          void cell.offsetWidth;
          cell.classList.add('is-denied');
        }
      });
      cell.addEventListener('mouseenter', () => this.emit('skill:select', node));

      this.nodeEls.set(node.id, cell);
      this.gridEl.appendChild(cell);
    }
  }

  /** Draw the dependency lines between node centres. */
  private drawLines(): void {
    const svg = this.linesEl;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const stage = this.gridEl.parentElement;
    if (!stage) return;
    const base = stage.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);

    for (const node of this.opts.nodes) {
      for (const depId of node.requires ?? []) {
        const from = this.nodeEls.get(depId);
        const to = this.nodeEls.get(node.id);
        if (!from || !to) continue;
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();

        const line = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(a.left - base.left + a.width / 2));
        line.setAttribute('y1', String(a.top - base.top + a.height / 2));
        line.setAttribute('x2', String(b.left - base.left + b.width / 2));
        line.setAttribute('y2', String(b.top - base.top + b.height / 2));
        line.setAttribute(
          'class',
          `fui-tree__line${this.isUnlocked(node) ? ' is-active' : ''}`,
        );
        svg.appendChild(line);
      }
    }
  }
}
