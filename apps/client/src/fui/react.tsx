import { useCallback, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BaseOptions } from './core/component.ts';

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
  on<T = unknown>(type: string, handler: (detail: T, event: CustomEvent<T>) => void): () => void;
}

/**
 * A component class as `useFui` needs to see it: `new Ctor(options)`.
 *
 * Both parameters are inferred at the call site — the options bag from the constructor's
 * parameter, the instance from its return — so `useFui(FuiButton, …)` types the returned
 * instance as a real `Button` with `setLabel` and `setDisabled` on it, rather than as a
 * bare `FuiComponent`. Erasing that was what made the first draft's `apply` untypeable.
 */
export type FuiCtor<T extends Instance = Instance, O extends FuiOptionsOf = FuiOptionsOf> = new (
  options: O,
) => T;

/**
 * The options constraint, and it has to admit `undefined`.
 *
 * The library declares two constructor shapes. Most components default their bag —
 * `constructor(opts: XOptions = {})`, typed `new (o?: XOptions) => X` — while the ones with
 * a genuinely required field, like `SegmentedControl`'s `segments`, do not. Against a
 * required parameter the first shape infers `O` as `XOptions | undefined`; against an
 * optional one the second shape is not assignable at all, because the target could be
 * called with no arguments and the source needs one. Neither single shape covers both.
 *
 * So the parameter stays required — which both shapes satisfy — and the constraint widens
 * to admit the `| undefined` that the defaulted shape drags in. Callers never see it: the
 * `options` argument is typed `NonNullable<O>`, so it is always the real bag.
 */
export type FuiOptionsOf = BaseOptions | undefined;

/** Handlers by event name — `{ 'panel:close': () => … }`. Names are the library's `ns:verb`. */
export type FuiHandlers = Record<string, (detail: never) => void>;

/**
 * How a wrapper pushes changed props into a live component.
 *
 * Called whenever any field of `options` differs from the last render, with the instance
 * and the new options. A wrapper calls the component's own setters:
 *
 * ```ts
 * (button, next) => button.setDisabled(next.disabled ?? false)
 * ```
 *
 * Anything not applied here simply does not change after construction — which is correct
 * for a variant or a size, and wrong for a value, so each primitive says which is which.
 */
export type FuiApply<T extends Instance, O extends FuiOptionsOf> = (
  instance: T,
  options: NonNullable<O>,
) => void;

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
export function useFui<T extends Instance, O extends FuiOptionsOf>(
  Ctor: FuiCtor<T, O>,
  options: NoInfer<NonNullable<O>>,
  handlers?: FuiHandlers,
  apply?: FuiApply<T, NoInfer<O>>,
): { ref: (node: HTMLDivElement | null) => void; instance: T | null } {
  const hostRef = useRef<HTMLElement | null>(null);
  const instanceRef = useRef<T | null>(null);
  const optionsRef = useRef<NonNullable<O>>(options);
  // Handlers are read through a ref so a new arrow function per render does not re-subscribe.
  // Refreshed in a layout effect rather than during render: an effect with no dependency
  // array runs after every render and before paint, which is soon enough for any event a
  // user could fire and is the only place React allows a ref to be written.
  const handlersRef = useRef<FuiHandlers | undefined>(handlers);
  const applyRef = useRef<FuiApply<T, O> | undefined>(apply);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
    applyRef.current = apply;
    // **Every render, unconditionally**, and that is the whole point of this line.
    //
    // `liveCallbacks` wraps every function in `options` so the component calls whatever is
    // in this ref *now* rather than whatever was here when it was built — which is what
    // makes an `onClick` closing over React state work at all. That only holds if the ref
    // actually tracks the renders.
    //
    // It used to be assigned in the effect below, which is keyed on `shallowKey(options)`
    // — and `shallowKey` deliberately skips functions. So a render that changed *only* a
    // closure never reached this line, and the component kept calling a handler from an
    // older render with older state. The food picker is where it surfaced: the Feed
    // button's `onClick` closes over the selection and its only other prop is `disabled`,
    // which moves once, on the *first* pick. Every later pick left the handler behind, so
    // choosing four champions and pressing Feed sent one — the one that had been chosen
    // when the button stopped being disabled. It looked like a broken feed and was a
    // broken bridge, under every painted control in the game.
    optionsRef.current = options;
  });
  // The instance is *also* state, not only a ref: a caller reading it during render must
  // read a value React knows about, and must be re-rendered when it appears. The ref is
  // what the callback and the effects use, where reading during render is not a question.
  const [instance, setInstance] = useState<T | null>(null);

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

    const created = new Ctor(liveCallbacks(optionsRef));
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

  // Options are **construction-time only**, and that is the library's design rather than
  // an omission: one component of the ninety-nine has a generic `update(options)`. The
  // rest expose named setters — `setLabel`, `setDisabled`, `setContent`, `set(value)` —
  // because a component that knows which field moved can animate it, and one handed a
  // whole options bag cannot tell a changed health value from a re-render.
  //
  // So the *wrapper* applies changes, through `apply`, which receives the live instance
  // whenever anything in `options` differs. Each Mistvale primitive knows which setter its
  // props map to; nothing here has to guess.
  useLayoutEffect(() => {
    const instance = instanceRef.current;
    if (instance) applyRef.current?.(instance, options);
    // Every field is compared, not the object identity — callers pass literals. Handlers
    // are *not* part of that comparison and must not be: `apply` pushes visible state in
    // through setters, and a new arrow function per render is not a change to any of it.
    // Keeping them live is the effect above's job.
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
export function Fui<T extends Instance, O extends FuiOptionsOf>({
  of,
  options,
  on,
  apply,
  className,
  attrs,
  ...rest
}: {
  of: FuiCtor<T, O>;
  /**
   * `NoInfer` on purpose: an options *literal* is a candidate TypeScript would otherwise
   * weigh against the constructor when deciding what `O` is — and the literal wins, so
   * `{ variant: 'alt' }` inferred `O` as `{ variant: string }` and then failed its own
   * constraint. Only the component decides its options type.
   */
  options: NoInfer<NonNullable<O>>;
  on?: FuiHandlers;
  /**
   * Pushes changed props into the live component through its own setters.
   *
   * Without one, options are construction-time only — which is right for a variant and
   * wrong for a value, and is why several call sites remount on a key digest instead.
   * Where the component has a setter for what moved, use this: it keeps the element, its
   * focus and its animations.
   */
  apply?: FuiApply<T, NoInfer<O>>;
  className?: string;
  /** Written to the component's own element — see `useFuiAttrs`. */
  attrs?: FuiAttrs;
} & Omit<JSX.IntrinsicElements['div'], 'className' | 'children'>): JSX.Element {
  const { ref, instance } = useFui(of, withClass(options, className), on, apply);
  useFuiAttrs(instance?.el, attrs);
  return <div {...rest} ref={ref} style={CONTENTS} />;
}

/**
 * The wrapper is a React implementation detail and must not be a layout box.
 *
 * `display: contents` takes it out of the box tree entirely, so the library's own root —
 * the `<button>`, the panel, the card — becomes the flex or grid item its parent expects.
 * Without this every wrapped component gains a phantom `<div>` between itself and the
 * layout that positions it, and a row of buttons stops honouring its `gap`.
 */
const CONTENTS = { display: 'contents' } as const;

/**
 * Mistvale's class names go on the *component's* root, not on the wrapper.
 *
 * `BaseOptions.class` is the library's own hook for exactly this. Putting them on a
 * `display: contents` wrapper would style an element that has no box; putting them on the
 * component's root is what a caller writing `className` meant.
 */
export type FuiAttrs = Readonly<Record<string, string | number | boolean | undefined>>;

/**
 * Attributes that must land on the *component's* element rather than on the wrapper.
 *
 * The wrapper is `display: contents`, so it has no box and is not in the accessibility
 * tree: an `aria-label` written there labels nothing, and the tutorial's highlight — which
 * measures `getBoundingClientRect()` of whatever carries `data-mv-highlight` — would
 * measure a zero-sized rectangle and draw its hole in the top-left corner.
 *
 * Runs on every render rather than on a dependency list, because the values are small
 * strings and the alternative is a stale `aria-selected` that a screen reader believes.
 */
export function useFuiAttrs(el: HTMLElement | null | undefined, attrs?: FuiAttrs): void {
  useLayoutEffect(() => {
    if (!el || !attrs) return;
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === false) el.removeAttribute(key);
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  });
}

function withClass<O extends FuiOptionsOf>(
  options: NonNullable<O>,
  className?: string,
): NonNullable<O> {
  if (!className) return options;
  return { ...options, class: [options.class, className].filter(Boolean).join(' ') };
}

/**
 * Options with every callback replaced by one that reads the current render's.
 *
 * The library binds `onClick`, `onInput` and friends **once, at construction** — so a
 * React callback handed straight in is frozen at the first render, and a handler that
 * changes with state (which is most of them) never fires the new one. The starter dialog
 * found this: its "Stand together" button kept calling the first render's handler, so
 * choosing a champion did nothing.
 *
 * Each function is swapped for a stable shim that looks the live one up through the ref
 * at call time. Non-functions pass through untouched. Doing it here rather than in each
 * wrapper means no primitive has to remember, which is the same reason the sound lives in
 * `Button` rather than in forty screens.
 */
function liveCallbacks<O extends BaseOptions>(ref: { current: O }): O {
  const out = { ...ref.current } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (typeof out[key] !== 'function') continue;
    out[key] = (...args: unknown[]) => {
      const live = (ref.current as Record<string, unknown>)[key];
      if (typeof live === 'function') (live as (...a: unknown[]) => unknown)(...args);
    };
  }
  return out as O;
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
export function FuiSlotted<T extends Instance, O extends FuiOptionsOf>({
  of,
  options,
  on,
  apply,
  slot,
  className,
  attrs,
  children,
  ...rest
}: {
  of: FuiCtor<T, O>;
  /** See the note on `Fui` — the component decides `O`, never the literal. */
  options: NoInfer<NonNullable<O>>;
  on?: FuiHandlers;
  /** See `Fui` — pushes changed props in through the component's own setters. */
  apply?: FuiApply<T, NoInfer<O>>;
  /**
   * CSS selector for the element inside the component that receives the children.
   * Omit to render them into the component's own root — which is what a Button wants,
   * where the label is the content and there is no separate body.
   */
  slot?: string;
  className?: string;
  /** Written to the component's own element — see `useFuiAttrs`. */
  attrs?: FuiAttrs;
  children?: ReactNode;
} & Omit<JSX.IntrinsicElements['div'], 'className' | 'children'>): JSX.Element {
  const { ref, instance } = useFui(of, withClass(options, className), on, apply);
  useFuiAttrs(instance?.el, attrs);
  // Null until the component is constructed, which is one render. Rendering the children
  // into nothing for that render is correct rather than a flash: the chrome is already on
  // screen, and the body fills in the same frame the portal target appears.
  const target = instance
    ? slot
      ? instance.el.querySelector<HTMLElement>(slot)
      : instance.el
    : null;
  return (
    <div {...rest} ref={ref} style={CONTENTS}>
      {target ? createPortal(children, target) : null}
    </div>
  );
}
