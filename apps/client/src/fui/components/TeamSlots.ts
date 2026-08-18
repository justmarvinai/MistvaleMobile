// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';
import { ChampionCard, type ChampionCardOptions } from './ChampionCard.ts';

export interface TeamMember extends ChampionCardOptions {
  id: string;
}

export interface TeamSlotsOptions extends BaseOptions {
  /** Number of positions in the formation. Squad games usually run 4–6. */
  size?: number;
  members?: (TeamMember | null)[];
  /** Id of the member wearing the leader crown. */
  leader?: string;
  /** Card width for each filled slot. */
  cardSize?: number;
  title?: string;
  /** Show the combined power of the lineup. */
  showPower?: boolean;
  /** Allow dragging members between positions. Default true. */
  reorderable?: boolean;
}

/**
 * The battle lineup: a fixed row of positions, each either a champion card or
 * an empty "add" tile.
 *
 * Emits `team:add` (empty slot tapped), `team:select`, `team:remove` and
 * `team:reorder`.
 *
 *   const team = new TeamSlots({ size: 5, members: [hero, null, null, null, null] });
 *   team.on<{ index: number }>('team:add', ({ index }) => openRoster(index));
 */
export class TeamSlots extends FuiComponent<TeamSlotsOptions> {
  private members: (TeamMember | null)[];
  private listEl: HTMLElement;
  private powerEl: HTMLElement | null = null;

  constructor(opts: TeamSlotsOptions = {}) {
    const size = opts.size ?? 5;
    const root = h('div', { class: 'fui fui-team' });
    super(root, opts);

    this.members = Array.from({ length: size }, (_, i) => opts.members?.[i] ?? null);

    if (opts.title || opts.showPower) {
      const head = h('div', { class: 'fui-team__head' });
      if (opts.title) head.appendChild(h('span', { class: 'fui-team__title fui-label', text: opts.title }));
      if (opts.showPower) {
        this.powerEl = h('span', { class: 'fui-team__power fui-num' });
        head.appendChild(
          h('span', { class: 'fui-team__powerbox' },
            h('span', { class: 'fui-team__powericon', attrs: { 'aria-hidden': 'true' } }),
            this.powerEl,
          ),
        );
      }
      root.appendChild(head);
    }

    this.listEl = h('div', { class: 'fui-team__list' });
    root.appendChild(this.listEl);
    this.render();
  }

  /** Combined power of every filled position. */
  get totalPower(): number {
    return this.members.reduce((n, m) => n + (m?.power ?? 0), 0);
  }

  /** Filled positions, in order. */
  get roster(): TeamMember[] {
    return this.members.filter((m): m is TeamMember => !!m);
  }

  setMember(index: number, member: TeamMember | null): this {
    if (index < 0 || index >= this.members.length) return this;
    this.members[index] = member;
    this.render();
    this.emit('team:change', { index, member, roster: this.roster });
    return this;
  }

  /** Place a member in the first free position. Returns its index, or -1. */
  add(member: TeamMember): number {
    const free = this.members.findIndex((m) => !m);
    if (free < 0) return -1;
    this.setMember(free, member);
    return free;
  }

  remove(index: number): this {
    return this.setMember(index, null);
  }

  swap(a: number, b: number): this {
    if (a === b) return this;
    const tmp = this.members[a];
    this.members[a] = this.members[b];
    this.members[b] = tmp;
    this.render();
    this.emit('team:reorder', { from: a, to: b, roster: this.roster });
    return this;
  }

  private render(): void {
    clear(this.listEl);
    if (this.powerEl) this.powerEl.textContent = this.totalPower.toLocaleString('en-US');

    this.members.forEach((member, i) => {
      const cell = h('div', { class: 'fui-team__cell', dataset: { index: String(i) } });

      if (member) {
        const card = new ChampionCard({ ...member, size: this.opts.cardSize ?? 108 });
        card.on('champion:click', () => this.emit('team:select', { index: i, member }));
        cell.appendChild(card.el);

        if (this.opts.leader === member.id) {
          cell.appendChild(h('span', { class: 'fui-team__crown', attrs: { title: 'Leader' } }));
        }

        const remove = h('button', {
          class: 'fui-team__remove',
          attrs: { type: 'button', 'aria-label': `Remove ${member.name ?? 'member'}` },
          text: '×',
        });
        remove.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.remove(i);
          this.emit('team:remove', { index: i, member });
        });
        cell.appendChild(remove);

        if (this.opts.reorderable !== false) {
          cell.draggable = true;
          cell.addEventListener('dragstart', (ev) => {
            ev.dataTransfer?.setData('text/plain', String(i));
            cell.classList.add('is-dragging');
          });
          cell.addEventListener('dragend', () => cell.classList.remove('is-dragging'));
        }
      } else {
        const empty = h('button', {
          class: 'fui-team__empty',
          attrs: { type: 'button', 'aria-label': 'Add champion' },
          style: { '--fui-champ-w': `${this.opts.cardSize ?? 108}px` },
        });
        empty.appendChild(h('span', { class: 'fui-team__plus', text: '+' }));
        empty.addEventListener('click', () => this.emit('team:add', { index: i }));
        cell.appendChild(empty);
      }

      if (this.opts.reorderable !== false) {
        cell.addEventListener('dragover', (ev) => {
          ev.preventDefault();
          cell.classList.add('is-over');
        });
        cell.addEventListener('dragleave', () => cell.classList.remove('is-over'));
        cell.addEventListener('drop', (ev) => {
          ev.preventDefault();
          cell.classList.remove('is-over');
          const from = Number(ev.dataTransfer?.getData('text/plain'));
          if (!Number.isNaN(from)) this.swap(from, i);
        });
      }
      this.listEl.appendChild(cell);
    });
  }
}
