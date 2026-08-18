// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface FilterOption {
  /** Value emitted when this chip is on. */
  value: string;
  label: string;
  /** Glyph asset id drawn before the label. */
  glyph?: string;
  /** Paints the chip in a specific colour when active — rarity, affinity. */
  color?: string;
  count?: number;
}

export interface FilterGroup {
  /** Stable key this group's selection is reported under. */
  key: string;
  label: string;
  options: FilterOption[];
  /** Allow several chips on at once. Defaults to true. */
  multi?: boolean;
}

export interface FilterBarOptions extends BaseOptions {
  groups: FilterGroup[];
  /** Pre-selected values per group key. */
  value?: Record<string, string[]>;
  /** Show the "Clear all" button once anything is selected. */
  clearable?: boolean;
  /** Stack the groups vertically instead of wrapping them inline. */
  stacked?: boolean;
}

/**
 * The faceted filter row above a champion roster — rarity, affinity, role, and
 * whatever else a game slices its collection by.
 *
 *   const filters = new FilterBar({
 *     groups: [
 *       { key: 'rarity', label: 'Rarity', options: [{ value: 'epic', label: 'Epic', color: 'var(--fui-rarity-epic)' }] },
 *       { key: 'role', label: 'Role', options: [{ value: 'tank', label: 'Tank', glyph: 'glyph-shield-block' }] },
 *     ],
 *   });
 *   filters.on<Record<string, string[]>>('filter:change', (sel) => roster.apply(sel));
 *
 * Emits the whole selection map on every change, so the consumer filters once
 * rather than tracking each group.
 */
export class FilterBar extends FuiComponent<FilterBarOptions> {
  private selection = new Map<string, Set<string>>();
  private chips = new Map<string, HTMLElement>();
  private clearBtn: HTMLElement | null = null;

  constructor(opts: FilterBarOptions) {
    const root = h('div', { class: 'fui fui-filters' });
    if (opts.stacked) root.classList.add('fui-filters--stacked');
    super(root, opts);

    for (const group of opts.groups) {
      this.selection.set(group.key, new Set(opts.value?.[group.key] ?? []));
      const wrap = h('div', { class: 'fui-filters__group' });
      wrap.appendChild(h('span', { class: 'fui-filters__label fui-label', text: group.label }));
      const chips = h('div', { class: 'fui-filters__chips' });

      for (const option of group.options) {
        const chip = h('button', {
          class: 'fui-filters__chip',
          style: option.color ? { '--fui-filter-ink': option.color } : {},
          attrs: { type: 'button', 'aria-pressed': 'false' },
        });
        if (option.glyph) {
          chip.appendChild(
            h('span', {
              class: 'fui-filters__glyph',
              style: { '--fui-glyph-src': `var(--fui-img-${option.glyph})` },
            }),
          );
        }
        chip.appendChild(h('span', { text: option.label }));
        if (option.count != null) {
          chip.appendChild(h('span', { class: 'fui-filters__count fui-num', text: String(option.count) }));
        }
        chip.addEventListener('click', () => this.toggle(group.key, option.value, group.multi ?? true));
        this.chips.set(`${group.key}:${option.value}`, chip);
        chips.appendChild(chip);
      }
      wrap.appendChild(chips);
      root.appendChild(wrap);
    }

    if (opts.clearable ?? true) {
      this.clearBtn = h('button', {
        class: 'fui-filters__clear',
        text: 'Clear all',
        attrs: { type: 'button' },
      });
      this.clearBtn.addEventListener('click', () => this.clear());
      root.appendChild(this.clearBtn);
    }
    this.paint();
  }

  /** Current selection as a plain object, one array per group key. */
  get(): Record<string, string[]> {
    return Object.fromEntries([...this.selection].map(([k, v]) => [k, [...v]]));
  }

  toggle(group: string, value: string, multi = true): this {
    const set = this.selection.get(group);
    if (!set) return this;
    if (set.has(value)) set.delete(value);
    else {
      if (!multi) set.clear();
      set.add(value);
    }
    this.paint();
    this.emit('filter:change', this.get());
    return this;
  }

  clear(): this {
    for (const set of this.selection.values()) set.clear();
    this.paint();
    this.emit('filter:change', this.get());
    return this;
  }

  /** True when nothing at all is selected. */
  isEmpty(): boolean {
    return [...this.selection.values()].every((s) => s.size === 0);
  }

  private paint(): void {
    for (const [key, chip] of this.chips) {
      const [group, value] = key.split(/:(.*)/s);
      const on = this.selection.get(group)?.has(value) ?? false;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', String(on));
    }
    if (this.clearBtn) this.clearBtn.hidden = this.isEmpty();
  }
}
