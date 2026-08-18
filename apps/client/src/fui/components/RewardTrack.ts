// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas } from '../core/dom.ts';

export interface TrackNode {
  /** Progress value at which this node unlocks. */
  at: number;
  /** Icon or glyph asset id for the reward. */
  icon: string;
  label?: string;
  qty?: number;
  claimed?: boolean;
  /** Premium-track rewards get the gold treatment. */
  premium?: boolean;
}

export interface RewardTrackOptions extends BaseOptions {
  nodes: TrackNode[];
  /** Current progress along the track. */
  progress?: number;
  title?: string;
  /** Caption under the title, e.g. `'Season 4 · 12 days left'`. */
  subtitle?: string;
  /** Unit shown on the progress readout, e.g. `'XP'`. */
  unit?: string;
  /** Locks premium nodes behind a purchase. */
  premiumLocked?: boolean;
}

/**
 * The battle-pass / milestone rail: a progress line studded with reward nodes
 * that become claimable as the player advances.
 *
 * Emits `track:claim` when a claimable node is tapped, and `track:locked` when
 * a premium node is tapped without the pass.
 *
 *   const pass = new RewardTrack({ title: 'Season Pass', progress: 260, nodes: [
 *     { at: 100, icon: 'icon-coins', qty: 500, claimed: true },
 *     { at: 250, icon: 'icon-chest', qty: 1 },
 *     { at: 400, icon: 'skill-thunderhammer', premium: true },
 *   ]});
 */
export class RewardTrack extends FuiComponent<RewardTrackOptions> {
  private railEl: HTMLElement;
  private fillEl: HTMLElement;
  private readoutEl: HTMLElement | null = null;
  private progress: number;

  constructor(opts: RewardTrackOptions) {
    const root = h('div', { class: 'fui fui-track' });
    super(root, opts);
    this.progress = opts.progress ?? 0;

    if (opts.title) {
      const head = h('header', { class: 'fui-track__head' });
      const titles = h('div', null, h('h3', { class: 'fui-track__title fui-title', text: opts.title }));
      if (opts.subtitle) titles.appendChild(h('p', { class: 'fui-track__sub fui-label', text: opts.subtitle }));
      head.appendChild(titles);
      this.readoutEl = h('span', { class: 'fui-track__readout fui-num' });
      head.appendChild(this.readoutEl);
      root.appendChild(head);
    }

    const rail = h('div', { class: 'fui-track__rail' });
    this.fillEl = h('div', { class: 'fui-track__fill' });
    rail.appendChild(this.fillEl);
    this.railEl = h('div', { class: 'fui-track__nodes' });
    rail.appendChild(this.railEl);
    root.appendChild(rail);

    this.render();
  }

  /** Nodes reached but not yet claimed. */
  get claimable(): TrackNode[] {
    return this.opts.nodes.filter((n) => !n.claimed && this.progress >= n.at);
  }

  setProgress(progress: number): this {
    this.progress = progress;
    this.render();
    this.emit('track:progress', progress);
    return this;
  }

  claim(node: TrackNode): this {
    node.claimed = true;
    this.render();
    this.emit('track:claim', node);
    return this;
  }

  private render(): void {
    const nodes = this.opts.nodes;
    const span = Math.max(1, nodes.length ? nodes[nodes.length - 1].at : 1);
    const pct = Math.max(0, Math.min(1, this.progress / span));
    this.fillEl.style.width = `${pct * 100}%`;

    if (this.readoutEl) {
      this.readoutEl.textContent = `${commas(this.progress)} / ${commas(span)}${
        this.opts.unit ? ` ${this.opts.unit}` : ''
      }`;
    }

    clear(this.railEl);
    for (const node of nodes) {
      const reached = this.progress >= node.at;
      const locked = !!node.premium && !!this.opts.premiumLocked;

      const cell = h('button', {
        class: 'fui-track__node',
        style: { left: `${(node.at / span) * 100}%` },
        attrs: { type: 'button', title: node.label },
        dataset: {
          state: node.claimed ? 'claimed' : reached ? 'ready' : 'locked',
          tier: node.premium ? 'premium' : 'free',
        },
      });

      cell.appendChild(
        h('span', { class: 'fui-track__icon', style: { backgroundImage: `var(--fui-img-${node.icon})` } }),
      );
      if (node.qty && node.qty > 1) {
        cell.appendChild(h('span', { class: 'fui-track__qty fui-num', text: `×${commas(node.qty)}` }));
      }
      cell.appendChild(h('span', { class: 'fui-track__at fui-num', text: String(node.at) }));

      cell.addEventListener('click', () => {
        if (locked) return this.emit('track:locked', node) as void;
        if (!node.claimed && reached) this.claim(node);
      });
      this.railEl.appendChild(cell);
    }
  }
}
