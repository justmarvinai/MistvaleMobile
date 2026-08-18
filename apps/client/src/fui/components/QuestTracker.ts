// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';
import type { Quest } from './QuestLog.ts';

export interface QuestTrackerOptions extends BaseOptions {
  quests?: Quest[];
  title?: string;
  /** Width in pixels. */
  width?: number;
  /** Collapse to titles only. */
  collapsed?: boolean;
  /** Cap how many quests are listed at once. Default 5. */
  max?: number;
}

/**
 * The compact on-screen objective list pinned to the HUD — the quests the
 * player is actively tracking, with live counters.
 *
 * Emits `tracker:click` when a quest heading is clicked (open the journal).
 *
 *   const tracker = new QuestTracker({ quests: [activeQuest] });
 *   tracker.progress('q1', 0, 4);
 */
export class QuestTracker extends FuiComponent<QuestTrackerOptions> {
  private listEl: HTMLElement;
  private quests: Quest[];

  constructor(opts: QuestTrackerOptions = {}) {
    const root = h('div', {
      class: 'fui fui-tracker',
      style: { width: `${opts.width ?? 250}px` },
    });
    if (opts.collapsed) root.classList.add('is-collapsed');
    super(root, opts);
    this.quests = opts.quests ?? [];

    const head = h('button', {
      class: 'fui-tracker__head',
      attrs: { type: 'button' },
    });
    head.appendChild(h('span', { class: 'fui-tracker__caret', attrs: { 'aria-hidden': 'true' } }));
    head.appendChild(
      h('span', { class: 'fui-tracker__heading fui-label', text: opts.title ?? 'Objectives' }),
    );
    head.addEventListener('click', () => this.toggle());
    root.appendChild(head);

    this.listEl = h('div', { class: 'fui-tracker__list' });
    root.appendChild(this.listEl);
    this.render();
  }

  setQuests(quests: Quest[]): this {
    this.quests = quests;
    this.render();
    return this;
  }

  /** Update one objective's counter in place. */
  progress(questId: string, objectiveIndex: number, have: number): this {
    const obj = this.quests.find((q) => q.id === questId)?.objectives?.[objectiveIndex];
    if (!obj) return this;
    obj.have = have;
    if (obj.need != null && have >= obj.need) obj.done = true;
    this.render();
    return this;
  }

  toggle(): this {
    this.el.classList.toggle('is-collapsed');
    return this;
  }

  private render(): void {
    clear(this.listEl);
    for (const q of this.quests.slice(0, this.opts.max ?? 5)) {
      const block = h('div', { class: 'fui-tracker__quest', dataset: { kind: q.kind ?? 'side' } });
      if (q.complete) block.classList.add('is-complete');

      const title = h('button', {
        class: 'fui-tracker__title',
        attrs: { type: 'button' },
        text: q.title,
      });
      title.addEventListener('click', () => this.emit('tracker:click', q));
      block.appendChild(title);

      const objectives = h('ul', { class: 'fui-tracker__objectives' });
      for (const o of q.objectives ?? []) {
        const li = h('li', { class: 'fui-tracker__objective' });
        if (o.done) li.classList.add('is-done');
        li.appendChild(h('span', { class: 'fui-tracker__otext', text: o.text }));
        if (o.need != null) {
          li.appendChild(
            h('span', { class: 'fui-tracker__count fui-num', text: `${o.have ?? 0}/${o.need}` }),
          );
        }
        objectives.appendChild(li);
      }
      block.appendChild(objectives);

      if (q.complete) {
        block.appendChild(h('div', { class: 'fui-tracker__ready', text: 'Ready to turn in' }));
      }
      this.listEl.appendChild(block);
    }
  }
}
