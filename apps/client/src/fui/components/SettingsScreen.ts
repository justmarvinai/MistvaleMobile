// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';
import { Tabs } from './Tabs.ts';
import { Toggle } from './Toggle.ts';
import { Slider } from './Slider.ts';
import { Select, type SelectItem } from './Select.ts';
import { Button } from './Button.ts';

export type SettingControl =
  | { kind: 'toggle'; id: string; label: string; hint?: string; value?: boolean }
  | {
      kind: 'slider';
      id: string;
      label: string;
      value?: number;
      min?: number;
      max?: number;
      step?: number;
      format?: 'number' | 'percent';
      icon?: string;
    }
  | { kind: 'select'; id: string; label: string; value?: string; items: SelectItem[] }
  | { kind: 'keybind'; id: string; label: string; value?: string }
  | { kind: 'divider'; id: string; label?: string };

export interface SettingsSection {
  id: string;
  label: string;
  icon?: string;
  controls: SettingControl[];
}

export interface SettingsScreenOptions extends BaseOptions {
  title?: string;
  sections: SettingsSection[];
  /** Width in pixels. */
  width?: number;
  /** Height in pixels. */
  height?: number;
  /** Show Apply / Reset buttons in the footer. Default true. */
  footer?: boolean;
}

/**
 * The options screen: sectioned tabs of toggles, sliders, dropdowns and
 * rebindable keys, wired to a single change stream.
 *
 * Emits `settings:change` with `{ id, value }` for every control, plus
 * `settings:apply`, `settings:reset` and `settings:rebind`.
 *
 *   const settings = new SettingsScreen({ sections: [
 *     { id: 'audio', label: 'Audio', controls: [
 *       { kind: 'slider', id: 'music', label: 'Music', value: 70, format: 'percent' },
 *       { kind: 'toggle', id: 'subs', label: 'Subtitles', value: true },
 *     ]},
 *   ]});
 *   console.log(settings.values());
 */
export class SettingsScreen extends FuiComponent<SettingsScreenOptions> {
  private bodyEl: HTMLElement;
  private state = new Map<string, unknown>();
  private activeSection: string;

  constructor(opts: SettingsScreenOptions) {
    const root = h('div', {
      class: 'fui fui-settings',
      style: {
        width: `${opts.width ?? 620}px`,
        ...(opts.height ? { height: `${opts.height}px` } : {}),
      },
    });
    super(root, opts);
    this.activeSection = opts.sections[0]?.id ?? '';

    root.appendChild(h('div', { class: 'fui-settings__fill', attrs: { 'aria-hidden': 'true' } }));
    root.appendChild(
      h('h2', { class: 'fui-settings__title fui-title', text: opts.title ?? 'Settings' }),
    );

    if (opts.sections.length > 1) {
      const tabs = new Tabs({
        items: opts.sections.map((s) => ({ id: s.id, label: s.label, icon: s.icon })),
        class: 'fui-settings__tabs',
      });
      tabs.on<{ id: string }>('tabs:change', ({ id }) => {
        this.activeSection = id;
        this.renderBody();
      });
      root.appendChild(tabs.el);
    }

    this.bodyEl = h('div', { class: 'fui-settings__body fui-scroll' });
    root.appendChild(this.bodyEl);

    if (opts.footer !== false) {
      const foot = h('footer', { class: 'fui-settings__foot' });
      foot.appendChild(
        new Button({
          label: 'Reset',
          variant: 'ghost',
          size: 'sm',
          onClick: () => this.emit('settings:reset'),
        }).el,
      );
      foot.appendChild(
        new Button({
          label: 'Apply',
          size: 'sm',
          onClick: () => this.emit('settings:apply', this.values()),
        }).el,
      );
      root.appendChild(foot);
    }

    this.renderBody();
  }

  /** Every control's current value, keyed by control id. */
  values(): Record<string, unknown> {
    return Object.fromEntries(this.state);
  }

  get(id: string): unknown {
    return this.state.get(id);
  }

  private change(id: string, value: unknown): void {
    this.state.set(id, value);
    this.emit('settings:change', { id, value });
  }

  private renderBody(): void {
    clear(this.bodyEl);
    const section = this.opts.sections.find((s) => s.id === this.activeSection);
    if (!section) return;

    for (const control of section.controls) {
      if (control.kind === 'divider') {
        this.bodyEl.appendChild(
          h(
            'div',
            { class: 'fui-settings__divider' },
            control.label && h('span', { class: 'fui-label', text: control.label }),
          ),
        );
        continue;
      }

      const row = h('div', { class: 'fui-settings__row' });

      if (control.kind === 'toggle') {
        this.state.set(control.id, control.value ?? false);
        const toggle = new Toggle({
          label: control.label,
          hint: control.hint,
          checked: control.value,
          onChange: (v) => this.change(control.id, v),
        });
        row.appendChild(toggle.el);
      } else if (control.kind === 'slider') {
        this.state.set(control.id, control.value ?? control.min ?? 0);
        const slider = new Slider({
          label: control.label,
          icon: control.icon,
          value: control.value,
          min: control.min,
          max: control.max,
          step: control.step,
          format: control.format,
          width: '100%',
          onInput: (v) => this.change(control.id, v),
        });
        row.appendChild(slider.el);
      } else if (control.kind === 'select') {
        this.state.set(control.id, control.value ?? control.items[0]?.value);
        const select = new Select({
          label: control.label,
          items: control.items,
          value: control.value,
          width: '100%',
          onChange: (v) => this.change(control.id, v),
        });
        row.appendChild(select.el);
      } else {
        // Keybind: click to arm, then the next keypress is captured.
        this.state.set(control.id, control.value ?? '');
        const key = h('button', {
          class: 'fui-settings__keybind',
          attrs: { type: 'button' },
          text: control.value || 'Unbound',
        });
        key.addEventListener('click', () => {
          key.classList.add('is-listening');
          key.textContent = 'Press a key…';
          const capture = (ev: KeyboardEvent) => {
            ev.preventDefault();
            const bind = ev.key === ' ' ? 'Space' : ev.key;
            key.textContent = bind;
            key.classList.remove('is-listening');
            this.change(control.id, bind);
            this.emit('settings:rebind', { id: control.id, key: bind });
            this.el.ownerDocument.removeEventListener('keydown', capture, true);
          };
          this.el.ownerDocument.addEventListener('keydown', capture, true);
        });
        row.appendChild(
          h(
            'div',
            { class: 'fui-settings__keyrow' },
            h('span', { class: 'fui-settings__keylabel', text: control.label }),
            key,
          ),
        );
      }
      this.bodyEl.appendChild(row);
    }
  }
}
