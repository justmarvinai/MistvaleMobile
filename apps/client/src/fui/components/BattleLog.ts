// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas } from '../core/dom.ts';

export type LogKind = 'damage' | 'heal' | 'buff' | 'debuff' | 'death' | 'turn' | 'system' | 'crit';

export interface LogLine {
  kind?: LogKind;
  /** Who acted. */
  actor?: string;
  /** What they did. */
  text: string;
  /** Number attached to the event — damage, healing, shield. */
  value?: number;
  /** Turn number this line belongs to. */
  turn?: number;
}

export interface BattleLogOptions extends BaseOptions {
  lines?: LogLine[];
  /** Cap on retained lines. Older ones are dropped. */
  limit?: number;
  /** Fixed height; the log scrolls inside it. */
  height?: number | string;
  /** Stick to the bottom as lines arrive. */
  autoScroll?: boolean;
  /** Filter chips for the event kinds. */
  filters?: LogKind[];
  title?: string;
}

const KIND_LABEL: Record<LogKind, string> = {
  damage: 'Damage',
  crit: 'Crit',
  heal: 'Heal',
  buff: 'Buff',
  debuff: 'Debuff',
  death: 'Death',
  turn: 'Turn',
  system: 'System',
};

/**
 * The scrolling combat log — what hit what, for how much, in what order. The
 * screen a player opens when they want to know why they lost.
 *
 *   const log = new BattleLog({ height: 220, autoScroll: true, filters: ['damage', 'heal'] });
 *   log.push({ kind: 'crit', actor: 'Vexhollow', text: 'strikes Clan Boss', value: 482_100 });
 *
 * `limit` keeps a long fight from growing without bound — the log holds the
 * last N lines and drops the rest, so a twenty-minute raid stays cheap.
 */
export class BattleLog extends FuiComponent<BattleLogOptions> {
  private body: HTMLElement;
  private lines: LogLine[] = [];
  private hidden = new Set<LogKind>();

  constructor(opts: BattleLogOptions = {}) {
    const root = h('div', { class: 'fui fui-log' });
    super(root, opts);

    if (opts.title || opts.filters?.length) {
      const head = h('div', { class: 'fui-log__head' });
      if (opts.title) head.appendChild(h('span', { class: 'fui-log__title fui-label', text: opts.title }));
      if (opts.filters?.length) {
        const chips = h('div', { class: 'fui-log__filters' });
        for (const kind of opts.filters) {
          const chip = h('button', {
            class: 'fui-log__filter is-on',
            dataset: { kind },
            text: KIND_LABEL[kind] ?? kind,
            attrs: { type: 'button' },
          });
          chip.addEventListener('click', () => {
            if (this.hidden.has(kind)) this.hidden.delete(kind);
            else this.hidden.add(kind);
            chip.classList.toggle('is-on', !this.hidden.has(kind));
            this.render();
          });
          chips.appendChild(chip);
        }
        head.appendChild(chips);
      }
      root.appendChild(head);
    }

    this.body = h('div', { class: 'fui-log__body fui-scroll' });
    if (opts.height != null) {
      this.body.style.height = typeof opts.height === 'number' ? `${opts.height}px` : opts.height;
    }
    root.appendChild(this.body);

    if (opts.lines?.length) for (const line of opts.lines) this.push(line, { silent: true });
    this.render();
  }

  /** Append a line, trimming the history to `limit`. */
  push(line: LogLine, opts?: { silent?: boolean }): this {
    this.lines.push(line);
    const limit = this.opts.limit ?? 200;
    if (this.lines.length > limit) this.lines.splice(0, this.lines.length - limit);
    if (!opts?.silent) {
      this.render();
      this.emit('log:line', line);
    }
    return this;
  }

  clear(): this {
    this.lines = [];
    this.render();
    return this;
  }

  /** Every retained line, oldest first. */
  getLines(): LogLine[] {
    return [...this.lines];
  }

  private render(): void {
    clear(this.body);
    let lastTurn: number | undefined;

    for (const line of this.lines) {
      const kind = line.kind ?? 'system';
      if (this.hidden.has(kind)) continue;

      // A turn divider is cheaper to read than repeating the turn on every row.
      if (line.turn != null && line.turn !== lastTurn) {
        this.body.appendChild(
          h('div', { class: 'fui-log__turn' }, h('span', { text: `Turn ${line.turn}` })),
        );
        lastTurn = line.turn;
      }

      const row = h('div', { class: 'fui-log__line', dataset: { kind } });
      if (line.actor) row.appendChild(h('span', { class: 'fui-log__actor', text: line.actor }));
      row.appendChild(h('span', { class: 'fui-log__text', text: line.text }));
      if (line.value != null) {
        row.appendChild(
          h('span', { class: 'fui-log__value fui-num', text: commas(line.value) }),
        );
      }
      this.body.appendChild(row);
    }

    if (this.opts.autoScroll ?? true) this.body.scrollTop = this.body.scrollHeight;
  }
}
