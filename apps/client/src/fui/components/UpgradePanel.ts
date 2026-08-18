// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, commas } from '../core/dom.ts';

export interface UpgradeMaterial {
  icon: string;
  name: string;
  /** How many the upgrade consumes. */
  need: number;
  /** How many the player holds. */
  have: number;
}

export interface UpgradeStat {
  label: string;
  from: number | string;
  to: number | string;
}

export interface UpgradePanelOptions extends BaseOptions {
  title?: string;
  /** Art of the thing being upgraded. */
  icon?: string;
  /** Headline transition, e.g. `'Level 40'` → `'Level 50'`. */
  from?: string;
  to?: string;
  /** Stat rows showing the before / after deltas. */
  stats?: UpgradeStat[];
  materials?: UpgradeMaterial[];
  /** Soft-currency cost. */
  cost?: number;
  costIcon?: string;
  /** Player's balance of that currency, for the affordability check. */
  balance?: number;
  /** Success probability 0–1, for games where upgrades can fail. */
  chance?: number;
  confirmLabel?: string;
}

/**
 * The upgrade / ascension dialog: what it costs, what it consumes, what it
 * gives you, and whether you can afford it.
 *
 * The confirm button unlocks only when every material and the currency cost are
 * covered, so the panel is the single source of truth for affordability.
 *
 * Emits `upgrade:confirm` when the player commits.
 *
 *   new UpgradePanel({ title: 'Ascend', from: '★4', to: '★5', chance: 0.7,
 *     materials: [{ icon: 'icon-rune-stone', name: 'Ember Rune', need: 4, have: 6 }],
 *     cost: 120000, balance: 240000 });
 */
export class UpgradePanel extends FuiComponent<UpgradePanelOptions> {
  private confirmBtn: HTMLButtonElement;

  constructor(opts: UpgradePanelOptions = {}) {
    const root = h('div', { class: 'fui fui-upgrade' });
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-upgrade__fill', attrs: { 'aria-hidden': 'true' } }));
    root.appendChild(
      h('h3', { class: 'fui-upgrade__title fui-title', text: opts.title ?? 'Upgrade' }),
    );

    // ── Headline transition ───────────────────────────────────────────────
    const head = h('div', { class: 'fui-upgrade__head' });
    if (opts.icon) {
      head.appendChild(
        h('span', { class: 'fui-upgrade__icon', style: { backgroundImage: `var(--fui-img-${opts.icon})` } }),
      );
    }
    if (opts.from || opts.to) {
      head.appendChild(
        h('span', { class: 'fui-upgrade__transition' },
          h('span', { class: 'fui-upgrade__from', text: opts.from ?? '' }),
          h('span', { class: 'fui-upgrade__arrow', attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'fui-upgrade__to', text: opts.to ?? '' }),
        ),
      );
    }
    root.appendChild(head);

    // ── Stat deltas ───────────────────────────────────────────────────────
    if (opts.stats?.length) {
      const list = h('ul', { class: 'fui-upgrade__stats' });
      for (const s of opts.stats) {
        list.appendChild(
          h('li', null,
            h('span', { class: 'fui-upgrade__statlabel', text: s.label }),
            h('span', { class: 'fui-upgrade__statfrom fui-num', text: String(s.from) }),
            h('span', { class: 'fui-upgrade__arrow sm', attrs: { 'aria-hidden': 'true' } }),
            h('span', { class: 'fui-upgrade__statto fui-num', text: String(s.to) }),
          ),
        );
      }
      root.appendChild(list);
    }

    // ── Materials ─────────────────────────────────────────────────────────
    if (opts.materials?.length) {
      root.appendChild(h('h4', { class: 'fui-upgrade__sub fui-label', text: 'Requires' }));
      const mats = h('div', { class: 'fui-upgrade__materials' });
      for (const m of opts.materials) {
        const enough = m.have >= m.need;
        const cell = h('div', {
          class: `fui-upgrade__mat${enough ? '' : ' is-short'}`,
          attrs: { title: m.name },
        });
        cell.appendChild(
          h('span', { class: 'fui-upgrade__maticon', style: { backgroundImage: `var(--fui-img-${m.icon})` } }),
        );
        cell.appendChild(
          h('span', { class: 'fui-upgrade__matcount fui-num', text: `${m.have}/${m.need}` }),
        );
        mats.appendChild(cell);
      }
      root.appendChild(mats);
    }

    // ── Cost & chance ─────────────────────────────────────────────────────
    const foot = h('div', { class: 'fui-upgrade__foot' });
    if (opts.chance != null) {
      foot.appendChild(
        h('span', {
          class: `fui-upgrade__chance${opts.chance < 0.5 ? ' is-risky' : ''}`,
          text: `${Math.round(opts.chance * 100)}% success`,
        }),
      );
    }
    if (opts.cost != null) {
      const affordable = (opts.balance ?? Infinity) >= opts.cost;
      foot.appendChild(
        h('span', { class: `fui-upgrade__cost${affordable ? '' : ' is-short'}` },
          h('span', {
            class: 'fui-upgrade__costicon',
            style: { backgroundImage: `var(--fui-img-${opts.costIcon ?? 'icon-coins'})` },
          }),
          h('span', { class: 'fui-num', text: commas(opts.cost) }),
        ),
      );
    }
    if (foot.childElementCount) root.appendChild(foot);

    // ── Confirm ───────────────────────────────────────────────────────────
    this.confirmBtn = h('button', {
      class: 'fui-upgrade__confirm',
      attrs: { type: 'button' },
      text: opts.confirmLabel ?? 'Upgrade',
    });
    this.confirmBtn.addEventListener('click', () => {
      if (this.canAfford) this.emit('upgrade:confirm', opts);
    });
    root.appendChild(this.confirmBtn);
    this.paint();
  }

  /** True when every material and the currency cost are covered. */
  get canAfford(): boolean {
    const mats = (this.opts.materials ?? []).every((m) => m.have >= m.need);
    const gold = this.opts.cost == null || (this.opts.balance ?? Infinity) >= this.opts.cost;
    return mats && gold;
  }

  /** Refresh after the player's inventory changes. */
  update(patch: Partial<UpgradePanelOptions>): this {
    this.opts = { ...this.opts, ...patch };
    this.paint();
    return this;
  }

  private paint(): void {
    const ok = this.canAfford;
    this.confirmBtn.disabled = !ok;
    this.confirmBtn.textContent = ok
      ? (this.opts.confirmLabel ?? 'Upgrade')
      : 'Not enough materials';
  }
}
