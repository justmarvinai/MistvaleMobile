// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
/**
 * The base every FantasyUIs component extends.
 *
 * Deliberately tiny: one root element, an options bag, a typed event channel
 * built on native CustomEvents, and a teardown hook. No virtual DOM, no
 * reactivity system, no dependencies — so a component drops into a plain Vite
 * app, a React ref, a Svelte action or a DOM layer over a Phaser canvas without
 * adapters.
 */

export type Theme = 'stone-vine' | 'dark-ember';

/** Options understood by every component. */
export interface BaseOptions {
  /** Extra class names appended to the root element. */
  class?: string;
  /** Force a theme on this subtree instead of inheriting the ancestor's. */
  theme?: Theme;
  /** Inline styles applied to the root element. */
  style?: Record<string, string | number>;
  /** Mount into this element (or CSS selector) immediately on construction. */
  mount?: Element | string;
}

export abstract class FuiComponent<O extends BaseOptions = BaseOptions> {
  /** The component's root element. Append it wherever you like. */
  readonly el: HTMLElement;
  protected opts: O;
  private disposers: Array<() => void> = [];

  protected constructor(el: HTMLElement, opts: O) {
    this.el = el;
    this.opts = opts;
    if (opts.class) el.classList.add(...opts.class.split(/\s+/).filter(Boolean));
    if (opts.theme) el.dataset.fuiTheme = opts.theme;
    if (opts.style) {
      for (const [k, v] of Object.entries(opts.style)) {
        if (k.startsWith('--')) el.style.setProperty(k, String(v));
        else (el.style as unknown as Record<string, string>)[k] = String(v);
      }
    }
    if (opts.mount) this.mount(opts.mount);
  }

  /** Append this component's root into `target`. */
  mount(target: Element | string): this {
    const parent =
      typeof target === 'string' ? this.el.ownerDocument.querySelector(target) : target;
    if (!parent) throw new Error(`[fui] mount target not found: ${String(target)}`);
    parent.appendChild(this.el);
    return this;
  }

  /** Subscribe to a component event. Returns an unsubscribe function. */
  on<T = unknown>(type: string, handler: (detail: T, ev: CustomEvent<T>) => void): () => void {
    const wrapped = (ev: Event) => handler((ev as CustomEvent<T>).detail, ev as CustomEvent<T>);
    this.el.addEventListener(type, wrapped);
    const off = () => this.el.removeEventListener(type, wrapped);
    this.disposers.push(off);
    return off;
  }

  /** Dispatch a bubbling component event. */
  protected emit<T>(type: string, detail?: T): void {
    this.el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }

  /** Register a teardown callback run by `destroy()`. */
  protected onDestroy(fn: () => void): void {
    this.disposers.push(fn);
  }

  /** Detach from the DOM and release every listener, timer and observer. */
  destroy(): void {
    for (const d of this.disposers.splice(0)) d();
    this.el.remove();
  }
}

/** Rarity tiers, using the colour language RPG players already know. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITIES: Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
];

/** The four resource bars nearly every RPG needs, plus a neutral fallback. */
export type StatKind = 'health' | 'mana' | 'stamina' | 'xp' | 'rage' | 'neutral';
