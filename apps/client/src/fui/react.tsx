import { useCallback, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BaseOptions, FuiComponent } from './core/component.ts';

/**
 * The seam between React and FantasyUIs.
 *
 * The library is deliberately dependency-free: a component is a class that owns one DOM
 * element, exposes it as `.el`, emits `ns:verb` CustomEvents and tears itself down through
 * `destroy()`. Its own notes name "a React ref" as a supported host, and this is that host
 * — one file, so ninety-nine components need no adapters of their own.
 *
 * **Why not rewrite them as React components.** Because they would stop being the
 * library. `pnpm fui:vendor` overwrites `src/fui/` byte-for-byte from upstream, which is
 * what keeps a newer version a clean `git diff` instead of a merge; a React port would
 * have to be redone by hand every time. The cost is this file, and it is small.
 *
 * The contract in three rules:
 *   1. A component is constructed **once** and kept for the life of the element.
 *   2. Changing `options` calls the component's own `update()` — never a rebuild, because
 *      a rebuild would restart every animation and drop focus mid-interaction.
 *   3. `destroy()` runs on unmount, which is what stops the library's timers and
 *      ResizeObservers. The library's audit fails a component that forgets one, so this
 *      only has to remember to call it.
 */

/** What every FantasyUIs component offers once constructed. */
interface Instance {
  readonly el: HTMLElement;
  destroy(): void;
  update?: (options: Record<string, unknown>) => unknown;
  on<T = unknown>(type: string, handler: (detail: T, event: CustomEvent<T>) => void): () => void;
}

/** A component class as `useFui` needs to see it: `new Ctor(options)`. */
export type FuiCtor<O extends BaseOptions> = new (options: O) => FuiComponent<O> & Instance;

/** Handlers by event name — `{ 'panel:close': () => … }`. Names are the library's `ns:verb`. */
export type FuiHandlers = Record<string, (detail: never) => void>;

/**
 * Mounts a FantasyUIs component into a React-owned element.
 *
 * ```tsx
 * const { ref } = useFui(Panel, { title: 'The vault' }, { 'panel:close': onClose });
 * return <div ref={ref} />;
 * ```
 *
 * `options` may be a fresh object every render — the hook diffs it shallowly and only
 * calls `update()` when something actually changed, so an inline literal costs nothing.
 */
export function useFui<O extends BaseOptions>(
  Ctor: FuiCtor<O>,
  options: O,
  handlers?: FuiHandlers,
): { ref: (node: HTMLDivElement | null) => void; instance: (FuiComponent<O> & Instance) | null } {
  const hostRef = useRef<HTMLElement | null>(null);
  const instanceRef = useRef<(FuiComponent<O> & Instance) | null>(null);
  const optionsRef = useRef<O>(options);
  // Handlers are read through a ref so a new arrow function per render does not re-subscribe.
  // Refreshed in a layout effect rather than during render: an effect with no dependency
  // array runs after every render and before paint, which is soon enough for any event a
  // user could fire and is the only place React allows a ref to be written.
  const handlersRef = useRef<FuiHandlers | undefined>(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });
  // The instance is *also* state, not only a ref: a caller reading it during render must
  // read a value React knows about, and must be re-rendered when it appears. The ref is
  // what the callback and the effects use, where reading during render is not a question.
  const [instance, setInstance] = useState<(FuiComponent<O> & Instance) | null>(null);

  // A callback ref rather than `useRef` + effect: it fires the moment React attaches the
  // node, which is before paint, so the component's art is on screen in the same frame
  // rather than one after it.
  //
  // **Stable, and that is not a nicety.** React re-runs a callback ref whose *identity*
  // changed — once with `null`, once with the node — so an inline arrow would tear the
  // component down and rebuild it on every render, and rebuilding calls `setInstance`,
  // which renders again. That is an infinite loop, and it is what the first draft of this
  // file did. Everything the callback reads it reads through a ref, so an empty dependency
  // list is correct rather than a suppression.
  const ref = useCallback((node: HTMLDivElement | null): void => {
    if (node === hostRef.current) return;
    hostRef.current = node;
    if (instanceRef.current) {
      instanceRef.current.destroy();
      instanceRef.current = null;
    }
    if (!node) return;

    const created = new Ctor(optionsRef.current);
    instanceRef.current = created;
    node.replaceChildren(created.el);

    // One listener per event name, dispatching through the ref, so handlers can change
    // freely without the subscription churning.
    for (const type of Object.keys(handlersRef.current ?? {})) {
      created.on(type, (detail: never) => handlersRef.current?.[type]?.(detail));
    }
    setInstance(created);
    // Ctor is a component class, constant for the life of a call site; the rest is refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Options → `update()`. Layout effect rather than effect: a value that changed this
  // render must be on screen in this paint, or a health bar lags the number beside it.
  useLayoutEffect(() => {
    const instance = instanceRef.current;
    optionsRef.current = options;
    if (!instance || typeof instance.update !== 'function') return;
    instance.update(options as unknown as Record<string, unknown>);
    // Every field is compared, not the object identity — callers pass literals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shallowKey(options as unknown as Record<string, unknown>)]);

  // **Teardown belongs to the ref alone.** An effect cleanup doing it as well looks like
  // belt and braces and is actually a bug: StrictMode mounts, runs the cleanup, and mounts
  // again to catch exactly this class of mistake — so the cleanup destroyed the component
  // and removed its element, while the ref (which React does not re-run in React 18) never
  // rebuilt it. The result was a panel that constructed successfully and then vanished, on
  // every screen, in development only. React guarantees a callback ref is called with
  // `null` when the element goes away, which is the whole of what is needed.

  return { ref, instance };
}

/**
 * A component as a React element, for the common case that needs no imperative handle.
 *
 * ```tsx
 * <Fui of={StatBar} options={{ value: hp, max: maxHp, kind: 'health' }} />
 * ```
 */
export function Fui<O extends BaseOptions>({
  of,
  options,
  on,
  className,
  ...rest
}: {
  of: FuiCtor<O>;
  options: O;
  on?: FuiHandlers;
  className?: string;
} & Omit<JSX.IntrinsicElements['div'], 'className' | 'children'>): JSX.Element {
  const { ref } = useFui(of, options, on);
  return <div {...rest} ref={ref} className={className} />;
}

/**
 * A stable key for a shallow options bag.
 *
 * Options are plain data — strings, numbers, booleans, small arrays of those — so
 * stringifying is both cheap and exactly the comparison wanted. Functions and elements
 * are skipped rather than serialised: they are identity-compared by nothing here, and a
 * component that takes one takes it once, at construction.
 */
function shallowKey(options: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of Object.keys(options).sort()) {
    const value = options[key];
    if (typeof value === 'function' || value instanceof Element) continue;
    parts.push(`${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
  }
  return parts.join('&');
}

/**
 * A library component with React children inside it.
 *
 * Most FantasyUIs components that hold content take it as DOM nodes — `content: Child |
 * Child[]` — which React cannot supply. So the chrome is built by the library and the
 * content is *portalled* into the slot it left: the panel draws its own 9-sliced fill,
 * ornament frame, title bar and footer, and React owns everything between them.
 *
 * This is the shape every "container" component in this game uses. It costs one portal
 * per panel, which React reconciles as ordinary children.
 *
 * ```tsx
 * <FuiSlotted of={Panel} options={{ title: 'The vault' }} slot=".fui-panel__body">
 *   {relics.map((relic) => <RelicRow key={relic.id} relic={relic} />)}
 * </FuiSlotted>
 * ```
 */
export function FuiSlotted<O extends BaseOptions>({
  of,
  options,
  on,
  slot,
  className,
  children,
  ...rest
}: {
  of: FuiCtor<O>;
  options: O;
  on?: FuiHandlers;
  /** CSS selector for the element inside the component that receives the children. */
  slot: string;
  className?: string;
  children?: ReactNode;
} & Omit<JSX.IntrinsicElements['div'], 'className' | 'children'>): JSX.Element {
  const { ref, instance } = useFui(of, options, on);
  // Null until the component is constructed, which is one render. Rendering the children
  // into nothing for that render is correct rather than a flash: the chrome is already on
  // screen, and the body fills in the same frame the portal target appears.
  const target = instance?.el.querySelector<HTMLElement>(slot) ?? null;
  return (
    <div {...rest} ref={ref} className={className}>
      {target ? createPortal(children, target) : null}
    </div>
  );
}
