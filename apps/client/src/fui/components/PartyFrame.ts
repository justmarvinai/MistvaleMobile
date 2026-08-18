// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';
import { UnitFrame, type UnitFrameOptions } from './UnitFrame.ts';

export interface PartyMember extends UnitFrameOptions {
  id: string;
}

export interface PartyFrameOptions extends BaseOptions {
  members: PartyMember[];
  orientation?: 'vertical' | 'horizontal';
  /** Highlight this member as the current selection. */
  selected?: string;
  title?: string;
}

/**
 * The party / raid list — a stack of compact unit frames you can update by id.
 * Emits `party:select` when a row is clicked.
 *
 *   const party = new PartyFrame({ members: [
 *     { id: 'p1', name: 'Kaelen', health: 780, healthMax: 900, role: 'icon-sword' },
 *     { id: 'p2', name: 'Sera',   health: 410, healthMax: 620, role: 'icon-scroll' },
 *   ]});
 *   party.setHealth('p2', 120);
 */
export class PartyFrame extends FuiComponent<PartyFrameOptions> {
  private frames = new Map<string, UnitFrame>();
  private list: HTMLElement;

  constructor(opts: PartyFrameOptions) {
    const root = h('div', {
      class: 'fui fui-party',
      dataset: { orientation: opts.orientation ?? 'vertical' },
    });
    super(root, opts);

    if (opts.title) {
      root.appendChild(h('div', { class: 'fui-party__title fui-label', text: opts.title }));
    }
    this.list = h('div', { class: 'fui-party__list' });
    root.appendChild(this.list);
    this.setMembers(opts.members);
    if (opts.selected) this.select(opts.selected);
  }

  setMembers(members: PartyMember[]): this {
    clear(this.list);
    this.frames.clear();
    for (const m of members) {
      const frame = new UnitFrame({ ...m, compact: true });
      frame.el.addEventListener('click', () => {
        this.select(m.id);
        this.emit('party:select', { id: m.id, member: m });
      });
      this.frames.set(m.id, frame);
      this.list.appendChild(frame.el);
    }
    this.opts.members = members;
    return this;
  }

  /** The UnitFrame for a member, for direct control. */
  member(id: string): UnitFrame | undefined {
    return this.frames.get(id);
  }

  setHealth(id: string, value: number, max?: number): this {
    this.frames.get(id)?.setHealth(value, max);
    return this;
  }

  setMana(id: string, value: number, max?: number): this {
    this.frames.get(id)?.setMana(value, max);
    return this;
  }

  /** Mark a member as dead / disconnected. */
  setInactive(id: string, inactive: boolean): this {
    this.frames.get(id)?.setInactive(inactive);
    return this;
  }

  select(id: string): this {
    for (const [key, frame] of this.frames) frame.setActive(key === id);
    return this;
  }
}
