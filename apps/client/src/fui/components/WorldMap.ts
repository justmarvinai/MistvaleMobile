// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp } from '../core/dom.ts';

export interface MapNode {
  id: string;
  name: string;
  /** Position as a percentage of the map, 0–100. */
  x: number;
  y: number;
  /** `locked` cannot be entered, `open` can, `cleared` is finished. */
  state?: 'locked' | 'open' | 'cleared' | 'current';
  /** Glyph asset id drawn inside the marker. */
  glyph?: string;
  /** Stars earned here, out of three. */
  stars?: number;
  /** Marks a chapter boss — bigger marker, danger colour. */
  boss?: boolean;
  /** Node ids this one connects to. Paths are drawn between them. */
  links?: string[];
  /** Sub-label under the name, e.g. "Lv 24" or "3/3". */
  note?: string;
}

export interface WorldMapOptions extends BaseOptions {
  nodes: MapNode[];
  /** Background art asset id, e.g. `'bg-scene-dark'`. */
  art?: string;
  /** Map height. Width always fills the parent. */
  height?: number | string;
  /** Region name printed top-left. */
  title?: string;
  /** Overall completion, 0–1, shown as a bar under the title. */
  progress?: number;
  /** Clicking an unlocked node emits `map:enter`. */
  interactive?: boolean;
}

/**
 * The region map a campaign is navigated from: nodes placed on painted art,
 * joined by paths, each locked, open, current or cleared.
 *
 *   const map = new WorldMap({
 *     art: 'bg-scene-dark',
 *     title: 'Emberwood Vale',
 *     height: 340,
 *     nodes: [
 *       { id: 'a', name: 'Ashfall Gate', x: 14, y: 62, state: 'cleared', stars: 3, links: ['b'] },
 *       { id: 'b', name: 'Sunken Road',  x: 40, y: 44, state: 'current', links: ['c'] },
 *       { id: 'c', name: 'The Maw',      x: 72, y: 58, state: 'locked', boss: true },
 *     ],
 *   });
 *   map.on<string>('map:enter', (id) => loadStage(id));
 *
 * Paths are derived from each node's `links`, so moving a node moves its
 * connections with it and there is no second list to keep in sync.
 */
export class WorldMap extends FuiComponent<WorldMapOptions> {
  private markers = new Map<string, HTMLElement>();

  constructor(opts: WorldMapOptions) {
    const root = h('div', {
      class: 'fui fui-map',
      style: {
        ...(opts.art ? { '--fui-map-art': `var(--fui-img-${opts.art})` } : {}),
        ...(opts.height != null
          ? { height: typeof opts.height === 'number' ? `${opts.height}px` : opts.height }
          : {}),
      },
    });
    super(root, opts);

    root.appendChild(h('span', { class: 'fui-map__art', attrs: { 'aria-hidden': 'true' } }));

    if (opts.title || opts.progress != null) {
      const head = h('div', { class: 'fui-map__head' });
      if (opts.title) {
        head.appendChild(h('p', { class: 'fui-map__title fui-title', text: opts.title }));
      }
      if (opts.progress != null) {
        head.appendChild(
          h(
            'div',
            {
              class: 'fui-map__progress',
              style: { '--fui-map-p': String(clamp(opts.progress, 0, 1)) },
            },
            h('span', { class: 'fui-map__progress-fill' }),
          ),
        );
      }
      root.appendChild(head);
    }

    // Paths sit under the markers, so a marker always wins the click.
    root.appendChild(this.drawPaths(opts.nodes));

    for (const node of opts.nodes) {
      const state = node.state ?? 'open';
      const marker = h(opts.interactive ? 'button' : 'div', {
        class: 'fui-map__node',
        dataset: { state, id: node.id },
        style: { left: `${clamp(node.x, 0, 100)}%`, top: `${clamp(node.y, 0, 100)}%` },
        attrs: {
          type: opts.interactive ? 'button' : undefined,
          disabled: opts.interactive && state === 'locked' ? true : undefined,
          title: node.name,
        },
      });
      if (node.boss) marker.classList.add('is-boss');

      const disc = h('span', { class: 'fui-map__disc' });
      if (node.glyph) disc.style.setProperty('--fui-glyph-src', `var(--fui-img-${node.glyph})`);
      marker.appendChild(disc);

      const label = h('span', { class: 'fui-map__label' });
      label.appendChild(h('span', { class: 'fui-map__name', text: node.name }));
      if (node.stars != null) {
        label.appendChild(
          h('span', { class: 'fui-map__stars', text: '★'.repeat(clamp(node.stars, 0, 3)) }),
        );
      }
      if (node.note) label.appendChild(h('span', { class: 'fui-map__note', text: node.note }));
      marker.appendChild(label);

      if (opts.interactive && state !== 'locked') {
        marker.addEventListener('click', () => this.emit('map:enter', node.id));
      }
      this.markers.set(node.id, marker);
      root.appendChild(marker);
    }
  }

  /** One SVG holding every path, derived from the nodes' own `links`. */
  private drawPaths(nodes: MapNode[]): SVGSVGElement {
    const doc = this.el.ownerDocument;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(NS, 'svg') as SVGSVGElement;
    svg.setAttribute('class', 'fui-map__paths');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const from of nodes) {
      for (const id of from.links ?? []) {
        const to = byId.get(id);
        if (!to) continue;
        const line = doc.createElementNS(NS, 'line');
        line.setAttribute('x1', String(from.x));
        line.setAttribute('y1', String(from.y));
        line.setAttribute('x2', String(to.x));
        line.setAttribute('y2', String(to.y));
        // A path counts as walked once the node behind it is cleared.
        line.setAttribute('class', from.state === 'cleared' ? 'is-walked' : '');
        svg.appendChild(line);
      }
    }
    return svg;
  }

  /** Change one node's state without rebuilding the map. */
  setState(id: string, state: NonNullable<MapNode['state']>): this {
    const marker = this.markers.get(id);
    if (marker) marker.dataset.state = state;
    return this;
  }
}
