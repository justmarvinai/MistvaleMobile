// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, commas } from '../core/dom.ts';

export interface QuestObjective {
  text: string;
  /** Current count, e.g. 3 of 8 wolves. */
  have?: number;
  need?: number;
  done?: boolean;
  optional?: boolean;
}

export interface QuestReward {
  icon: string;
  label?: string;
  qty?: number;
}

export interface Quest {
  id: string;
  title: string;
  /** `main`, `side`, `daily`, `bounty` — drives the marker colour. */
  kind?: 'main' | 'side' | 'daily' | 'bounty';
  level?: number;
  /** Zone or giver, shown under the title in the list. */
  region?: string;
  summary?: string;
  objectives?: QuestObjective[];
  rewards?: QuestReward[];
  xp?: number;
  gold?: number;
  /** All objectives met — ready to hand in. */
  complete?: boolean;
  /** Currently pinned to the on-screen tracker. */
  tracked?: boolean;
}

export interface QuestLogOptions extends BaseOptions {
  quests: Quest[];
  /** Id of the quest shown in the detail pane. */
  selected?: string;
  /** Width in pixels. */
  width?: number;
  /** Height in pixels. */
  height?: number;
  title?: string;
}

/**
 * The journal: a list of quests on the left, full detail on the right —
 * objectives with counters, rewards and hand-in state.
 *
 * Emits `quest:select`, `quest:track` and `quest:abandon`.
 *
 *   const log = new QuestLog({ quests: [{ id: 'q1', title: 'The Sunken Gate',
 *     kind: 'main', objectives: [{ text: 'Find the key', have: 0, need: 1 }] }] });
 */
export class QuestLog extends FuiComponent<QuestLogOptions> {
  private listEl: HTMLElement;
  private detailEl: HTMLElement;
  private selectedId: string;

  constructor(opts: QuestLogOptions) {
    const root = h('div', {
      class: 'fui fui-questlog',
      style: {
        width: `${opts.width ?? 700}px`,
        height: `${opts.height ?? 460}px`,
      },
    });
    super(root, opts);
    this.selectedId = opts.selected ?? opts.quests[0]?.id ?? '';

    root.appendChild(h('div', { class: 'fui-questlog__fill', attrs: { 'aria-hidden': 'true' } }));
    root.appendChild(
      h('h2', { class: 'fui-questlog__title fui-title', text: opts.title ?? 'Quest Log' }),
    );

    this.listEl = h('div', { class: 'fui-questlog__list fui-scroll' });
    this.detailEl = h('div', { class: 'fui-questlog__detail fui-scroll' });
    root.appendChild(h('div', { class: 'fui-questlog__cols' }, this.listEl, this.detailEl));

    this.renderList();
    this.renderDetail();
  }

  select(id: string): this {
    this.selectedId = id;
    this.renderList();
    this.renderDetail();
    this.emit('quest:select', this.opts.quests.find((q) => q.id === id));
    return this;
  }

  /** Replace the quest set — after accepting, completing or abandoning one. */
  setQuests(quests: Quest[]): this {
    this.opts.quests = quests;
    if (!quests.some((q) => q.id === this.selectedId)) this.selectedId = quests[0]?.id ?? '';
    this.renderList();
    this.renderDetail();
    return this;
  }

  /** Bump an objective's counter and auto-mark it done when it fills. */
  progress(questId: string, objectiveIndex: number, have: number): this {
    const quest = this.opts.quests.find((q) => q.id === questId);
    const obj = quest?.objectives?.[objectiveIndex];
    if (!obj) return this;
    obj.have = have;
    if (obj.need != null && have >= obj.need) obj.done = true;
    if (quest!.objectives!.every((o) => o.done || o.optional)) quest!.complete = true;
    this.renderList();
    if (this.selectedId === questId) this.renderDetail();
    this.emit('quest:progress', { questId, objectiveIndex, have });
    return this;
  }

  private renderList(): void {
    clear(this.listEl);
    for (const q of this.opts.quests) {
      const row = h('button', {
        class: 'fui-questlog__row',
        dataset: { kind: q.kind ?? 'side' },
        attrs: { type: 'button' },
      });
      if (q.id === this.selectedId) row.classList.add('is-selected');
      if (q.complete) row.classList.add('is-complete');

      row.appendChild(h('span', { class: 'fui-questlog__marker', attrs: { 'aria-hidden': 'true' } }));
      row.appendChild(
        h(
          'span',
          { class: 'fui-questlog__rowbody' },
          h('span', { class: 'fui-questlog__rowtitle', text: q.title }),
          (q.region || q.level != null) &&
            h('span', {
              class: 'fui-questlog__rowmeta',
              text: [q.level != null ? `Lv ${q.level}` : null, q.region].filter(Boolean).join(' · '),
            }),
        ),
      );
      if (q.tracked) row.appendChild(h('span', { class: 'fui-questlog__pin', text: '📌' }));
      row.addEventListener('click', () => this.select(q.id));
      this.listEl.appendChild(row);
    }
  }

  private renderDetail(): void {
    clear(this.detailEl);
    const q = this.opts.quests.find((x) => x.id === this.selectedId);
    if (!q) {
      this.detailEl.appendChild(
        h('p', { class: 'fui-questlog__empty fui-body', text: 'No quest selected.' }),
      );
      return;
    }

    this.detailEl.appendChild(h('h3', { class: 'fui-questlog__dtitle fui-title', text: q.title }));
    if (q.region || q.level != null) {
      this.detailEl.appendChild(
        h('p', {
          class: 'fui-questlog__dmeta fui-label',
          text: [q.level != null ? `Level ${q.level}` : null, q.region].filter(Boolean).join(' · '),
        }),
      );
    }
    if (q.summary) {
      this.detailEl.appendChild(h('p', { class: 'fui-questlog__summary fui-body', text: q.summary }));
    }

    if (q.objectives?.length) {
      this.detailEl.appendChild(h('h4', { class: 'fui-questlog__sub fui-label', text: 'Objectives' }));
      const list = h('ul', { class: 'fui-questlog__objectives' });
      for (const o of q.objectives) {
        const li = h('li', { class: 'fui-questlog__objective' });
        if (o.done) li.classList.add('is-done');
        if (o.optional) li.classList.add('is-optional');
        li.appendChild(h('span', { class: 'fui-questlog__tick', attrs: { 'aria-hidden': 'true' } }));
        li.appendChild(h('span', { text: o.text }));
        if (o.need != null) {
          li.appendChild(
            h('span', { class: 'fui-questlog__count fui-num', text: `${o.have ?? 0} / ${o.need}` }),
          );
        }
        list.appendChild(li);
      }
      this.detailEl.appendChild(list);
    }

    if (q.rewards?.length || q.xp || q.gold) {
      this.detailEl.appendChild(h('h4', { class: 'fui-questlog__sub fui-label', text: 'Rewards' }));
      const rewards = h('div', { class: 'fui-questlog__rewards' });
      for (const r of q.rewards ?? []) {
        rewards.appendChild(
          h(
            'div',
            { class: 'fui-questlog__reward', attrs: { title: r.label } },
            h('span', {
              class: 'fui-questlog__ricon',
              style: { backgroundImage: `var(--fui-img-${r.icon})` },
            }),
            r.qty && r.qty > 1 ? h('span', { class: 'fui-num', text: `x${r.qty}` }) : null,
          ),
        );
      }
      if (q.xp) rewards.appendChild(h('span', { class: 'fui-questlog__xp', text: `${commas(q.xp)} XP` }));
      if (q.gold) {
        rewards.appendChild(
          h(
            'span',
            { class: 'fui-questlog__goldchip' },
            h('span', { class: 'fui-questlog__coin', attrs: { 'aria-hidden': 'true' } }),
            h('span', { class: 'fui-num', text: commas(q.gold) }),
          ),
        );
      }
      this.detailEl.appendChild(rewards);
    }

    const actions = h('div', { class: 'fui-questlog__actions' });
    const track = h('button', {
      class: 'fui-questlog__btn',
      attrs: { type: 'button' },
      text: q.tracked ? 'Untrack' : 'Track',
    });
    track.addEventListener('click', () => {
      q.tracked = !q.tracked;
      this.renderList();
      this.renderDetail();
      this.emit('quest:track', q);
    });
    const abandon = h('button', {
      class: 'fui-questlog__btn is-danger',
      attrs: { type: 'button' },
      text: 'Abandon',
    });
    abandon.addEventListener('click', () => this.emit('quest:abandon', q));
    actions.append(track, abandon);
    this.detailEl.appendChild(actions);
  }
}
