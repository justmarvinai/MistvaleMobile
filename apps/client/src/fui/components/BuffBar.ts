// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, duration } from '../core/dom.ts';

export interface Buff {
  id: string;
  /** Asset id for the effect art. */
  icon: string;
  name?: string;
  /** Remaining seconds. Omit for a permanent aura. */
  remaining?: number;
  /** Total duration, used to draw the depletion sweep. */
  total?: number;
  /** Stack count shown in the corner. */
  stacks?: number;
  /** Debuffs get a red rim; buffs a green one. */
  kind?: 'buff' | 'debuff';
}

export interface BuffBarOptions extends BaseOptions {
  buffs?: Buff[];
  /** Size in pixels. */
  size?: number;
  /** Tick timers down automatically and drop expired entries. Default true. */
  autoTick?: boolean;
  /** Wrap onto multiple rows after N icons. */
  perRow?: number;
}

/**
 * The buff / debuff strip above a unit frame: icons with depletion sweeps,
 * countdown text and stack counts. Emits `buff:expire` as each one runs out.
 *
 *   const buffs = new BuffBar({ buffs: [
 *     { id: 'haste', icon: 'skill-comet', remaining: 12, total: 20, stacks: 3 },
 *     { id: 'burn',  icon: 'skill-firehand', remaining: 5, total: 8, kind: 'debuff' },
 *   ]});
 */
export class BuffBar extends FuiComponent<BuffBarOptions> {
  private buffs: Buff[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: BuffBarOptions = {}) {
    const root = h('div', {
      class: 'fui fui-buffs',
      style: {
        '--fui-buff-size': `${opts.size ?? 34}px`,
        ...(opts.perRow ? { maxWidth: `${(opts.size ?? 34) * opts.perRow + 4 * opts.perRow}px` } : {}),
      },
    });
    super(root, opts);

    this.set(opts.buffs ?? []);

    if (opts.autoTick !== false) {
      this.timer = setInterval(() => this.tick(0.1), 100);
      this.onDestroy(() => this.timer && clearInterval(this.timer));
    }
  }

  /** Replace the whole list. */
  set(buffs: Buff[]): this {
    this.buffs = buffs.map((b) => ({ ...b }));
    this.render();
    return this;
  }

  /** Add or refresh one effect. Re-applying resets its timer. */
  apply(buff: Buff): this {
    const i = this.buffs.findIndex((b) => b.id === buff.id);
    if (i >= 0) this.buffs[i] = { ...this.buffs[i], ...buff };
    else this.buffs.push({ ...buff });
    this.render();
    return this;
  }

  remove(id: string): this {
    this.buffs = this.buffs.filter((b) => b.id !== id);
    this.render();
    return this;
  }

  /** Advance every timer by `dt` seconds, dropping any that expire. */
  tick(dt: number): this {
    let changed = false;
    for (const b of this.buffs) {
      if (b.remaining == null) continue;
      b.remaining = Math.max(0, b.remaining - dt);
      changed = true;
    }
    const expired = this.buffs.filter((b) => b.remaining === 0);
    if (expired.length) {
      this.buffs = this.buffs.filter((b) => b.remaining !== 0);
      for (const b of expired) this.emit('buff:expire', b);
    }
    if (changed) this.render();
    return this;
  }

  private render(): void {
    clear(this.el);
    for (const b of this.buffs) {
      const pct = b.total && b.remaining != null ? 1 - b.remaining / b.total : 0;
      const cell = h('div', {
        class: 'fui-buffs__item',
        dataset: { kind: b.kind ?? 'buff' },
        style: { '--fui-buff-sweep': String(pct) },
        attrs: { title: b.name ?? b.id },
      });
      cell.appendChild(
        h('span', {
          class: 'fui-buffs__icon',
          style: { backgroundImage: `var(--fui-img-${b.icon})` },
        }),
      );
      cell.appendChild(h('span', { class: 'fui-buffs__sweep', attrs: { 'aria-hidden': 'true' } }));
      if (b.stacks && b.stacks > 1) {
        cell.appendChild(h('span', { class: 'fui-buffs__stacks fui-num', text: String(b.stacks) }));
      }
      if (b.remaining != null) {
        cell.appendChild(
          h('span', {
            class: 'fui-buffs__time fui-num',
            text: duration(b.remaining),
          }),
        );
        if (b.remaining <= 5) cell.classList.add('is-ending');
      }
      this.el.appendChild(cell);
    }
  }
}
