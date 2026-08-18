// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
/**
 * Tiny DOM helpers shared by every FantasyUIs component.
 *
 * Components never touch the global `document` directly — they go through
 * `doc()`. That keeps the whole library renderable in Node (via linkedom), which
 * is how the website pre-renders every live demo into static HTML so crawlers
 * and AI agents can read the markup without executing JavaScript.
 */

let ambient: Document | null =
  typeof globalThis !== 'undefined' && 'document' in globalThis
    ? (globalThis as { document: Document }).document
    : null;

/** Point the library at a Document. Only needed for server-side rendering. */
export function setDocument(d: Document): void {
  ambient = d;
}

/** The Document components should build into. */
export function doc(): Document {
  if (!ambient) {
    throw new Error(
      '[fui] No document available. In a browser this is automatic; in Node call setDocument(...) first.',
    );
  }
  return ambient;
}

export type Child = Node | string | number | false | null | undefined;

export interface ElProps {
  class?: string;
  text?: string;
  html?: string;
  style?: Partial<CSSStyleDeclaration> | Record<string, string | number>;
  dataset?: Record<string, string>;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Record<string, EventListenerOrEventListenerObject>;
}

/**
 * Create an element.
 *
 *   h('div', { class: 'fui-panel', text: 'Hello' }, child1, child2)
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = doc().createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text != null) el.textContent = props.text;
    if (props.html != null) el.innerHTML = props.html;
    if (props.style) {
      for (const [k, v] of Object.entries(props.style)) {
        if (v == null) continue;
        if (k.startsWith('--')) el.style.setProperty(k, String(v));
        else (el.style as unknown as Record<string, string>)[k] = String(v);
      }
    }
    if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
    if (props.attrs) {
      for (const [k, v] of Object.entries(props.attrs)) {
        if (v == null || v === false) continue;
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (props.on) for (const [k, v] of Object.entries(props.on)) el.addEventListener(k, v);
  }
  append(el, ...children);
  return el;
}

/** Append children, skipping falsy values and coercing primitives to text. */
export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    parent.appendChild(typeof c === 'object' ? c : doc().createTextNode(String(c)));
  }
}

/** Remove every child of a node. */
export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Clamp `n` into the inclusive range [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

/** Format 1234567 as "1.23M" for compact currency / damage readouts. */
export function abbreviate(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (abs >= 1e4) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return String(n);
}

/** Group thousands: 1234567 → "1,234,567". */
export function commas(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Seconds → "1:05" / "12s" / "1h 4m", for cooldowns and buff timers. */
export function duration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.ceil(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}
