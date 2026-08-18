// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, append, type Child } from '../core/dom.ts';

export type HudZone =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const HUD_ZONES: HudZone[] = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export interface HUDOptions extends BaseOptions {
  /** Cover the viewport. Set false to render inside a sized container. */
  fullscreen?: boolean;
  /** Pass-through pointer events except on the widgets themselves. Default true. */
  passThrough?: boolean;
  /** Padding from the screen edges. */
  inset?: number | string;
}

/**
 * The heads-up display frame: a nine-zone overlay you drop widgets into, so a
 * game HUD is composed rather than hand-positioned.
 *
 * Pointer events pass through the empty space by default, so the HUD never
 * eats clicks meant for the game canvas underneath.
 *
 *   const hud = new HUD({ mount: document.body });
 *   hud.add('top-left', playerFrame.el, buffBar.el);
 *   hud.add('bottom-center', actionBar.el);
 *   hud.add('top-right', minimap.el);
 *   hud.toggle();   // hide for a screenshot
 */
export class HUD extends FuiComponent<HUDOptions> {
  private zones = new Map<HudZone, HTMLElement>();

  constructor(opts: HUDOptions = {}) {
    const root = h('div', {
      class: 'fui fui-hud',
      style:
        opts.inset != null
          ? { '--fui-hud-inset': typeof opts.inset === 'number' ? `${opts.inset}px` : opts.inset }
          : undefined,
    });
    if (opts.fullscreen !== false) root.classList.add('fui-hud--fullscreen');
    if (opts.passThrough === false) root.classList.add('fui-hud--solid');
    super(root, opts);

    for (const zone of HUD_ZONES) {
      const el = h('div', { class: 'fui-hud__zone', dataset: { zone } });
      this.zones.set(zone, el);
      root.appendChild(el);
    }
  }

  /** The container element for a zone, if you want to manage it yourself. */
  zone(zone: HudZone): HTMLElement {
    return this.zones.get(zone)!;
  }

  /** Drop widgets into a zone. */
  add(zone: HudZone, ...children: Child[]): this {
    append(this.zone(zone), ...children);
    return this;
  }

  /** Empty a zone. */
  clearZone(zone: HudZone): this {
    const el = this.zone(zone);
    while (el.firstChild) el.firstChild.remove();
    return this;
  }

  /** Hide or show the whole HUD — cinematics, photo mode, cutscenes. */
  setVisible(visible: boolean): this {
    this.el.classList.toggle('is-hidden', !visible);
    return this;
  }

  toggle(): this {
    this.el.classList.toggle('is-hidden');
    return this;
  }
}
