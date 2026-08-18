// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clamp } from '../core/dom.ts';

export interface RadarAxis {
  label: string;
  /** 0–1, already normalised against whatever the game's ceiling is. */
  value: number;
  /** Second series for comparison — the champion you are considering. */
  compare?: number;
}

export interface StatRadarOptions extends BaseOptions {
  /** Three or more axes. Five or six reads best. */
  axes: RadarAxis[];
  /** Diameter of the web in pixels. The element is wider than this, because
   *  the axis labels are given their own margin either side. */
  size?: number;
  /** Colour of the primary polygon. */
  color?: string;
  /** Colour of the `compare` polygon. */
  compareColor?: string;
  /** Number of concentric guide rings. */
  rings?: number;
  /** Hide the axis labels for a compact sparkline-style radar. */
  bare?: boolean;
}

/** SVG needs a real namespace; `h()` builds HTML elements only. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The stat web collection games print on a champion page — ATK, DEF, HP, SPD,
 * C.RATE, ACC in one shape, so two champions can be compared by silhouette
 * rather than by reading twelve numbers.
 *
 *   new StatRadar({
 *     axes: [
 *       { label: 'ATK', value: 0.82, compare: 0.6 },
 *       { label: 'DEF', value: 0.4, compare: 0.75 },
 *       { label: 'HP', value: 0.55, compare: 0.9 },
 *       { label: 'SPD', value: 0.7, compare: 0.5 },
 *       { label: 'C.RATE', value: 0.9, compare: 0.35 },
 *     ],
 *     size: 220,
 *   });
 *
 * Values are 0–1 — normalising against the game's own ceilings is the caller's
 * job, because only the game knows what "fast" means.
 */
export class StatRadar extends FuiComponent<StatRadarOptions> {
  private svg: SVGSVGElement;

  constructor(opts: StatRadarOptions) {
    const size = opts.size ?? 200;
    const root = h('div', {
      class: 'fui fui-radar',
      style: {
        '--fui-radar-size': `${size}px`,
        ...(opts.color ? { '--fui-radar-color': opts.color } : {}),
        ...(opts.compareColor ? { '--fui-radar-compare': opts.compareColor } : {}),
      },
    });
    super(root, opts);

    const doc = root.ownerDocument;
    this.svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('viewBox', '0 0 100 100');
    this.svg.setAttribute('aria-hidden', 'true');
    root.appendChild(this.svg);
    this.draw();

    if (!opts.bare) {
      // Labels are HTML rather than SVG text so they inherit the theme's font
      // stack and stay selectable and translatable.
      const labels = h('div', { class: 'fui-radar__labels' });
      opts.axes.forEach((axis, i) => {
        const p = this.point(i, 1.18);
        labels.appendChild(
          h('span', {
            class: 'fui-radar__label',
            text: axis.label,
            style: { left: `${p.x.toFixed(2)}%`, top: `${p.y.toFixed(2)}%` },
          }),
        );
      });
      root.appendChild(labels);
    }
  }

  /** Polar → cartesian on a 100×100 viewBox, first axis pointing straight up. */
  private point(index: number, radius: number): { x: number; y: number } {
    const n = this.opts.axes.length;
    const angle = (index / n) * Math.PI * 2 - Math.PI / 2;
    // 40 rather than 50 keeps the outermost ring clear of the box edge, so the
    // labels drawn just beyond it have somewhere to sit.
    return {
      x: 50 + Math.cos(angle) * 40 * radius,
      y: 50 + Math.sin(angle) * 40 * radius,
    };
  }

  private polygon(pick: (a: RadarAxis) => number): string {
    return this.opts.axes
      .map((axis, i) => {
        const p = this.point(i, clamp(pick(axis), 0, 1));
        return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      })
      .join(' ');
  }

  private draw(): void {
    const doc = this.el.ownerDocument;
    const add = (tag: string, attrs: Record<string, string>) => {
      const node = doc.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      this.svg.appendChild(node);
      return node;
    };

    const rings = this.opts.rings ?? 4;
    for (let r = 1; r <= rings; r++) {
      add('polygon', {
        class: 'fui-radar__ring',
        points: this.opts.axes
          .map((_, i) => {
            const p = this.point(i, r / rings);
            return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          })
          .join(' '),
      });
    }
    for (let i = 0; i < this.opts.axes.length; i++) {
      const p = this.point(i, 1);
      add('line', { class: 'fui-radar__spoke', x1: '50', y1: '50', x2: p.x.toFixed(2), y2: p.y.toFixed(2) });
    }

    if (this.opts.axes.some((a) => a.compare != null)) {
      add('polygon', {
        class: 'fui-radar__shape fui-radar__shape--compare',
        points: this.polygon((a) => a.compare ?? 0),
      });
    }
    add('polygon', { class: 'fui-radar__shape', points: this.polygon((a) => a.value) });
  }

  /** Redraw with new values, keeping the same axes. */
  setValues(values: number[], compare?: number[]): this {
    this.opts.axes.forEach((axis, i) => {
      if (values[i] != null) axis.value = values[i];
      if (compare && compare[i] != null) axis.compare = compare[i];
    });
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    this.draw();
    return this;
  }
}
