// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, append, type Child } from '../core/dom.ts';
import { Panel, type PanelVariant } from './Panel.ts';
import { Button } from './Button.ts';

export interface ModalAction {
  label: string;
  /** `primary` is the default look; `ghost` reads as a secondary choice. */
  variant?: 'primary' | 'ghost' | 'long';
  icon?: string;
  /** Return `false` to keep the modal open after the click. */
  onClick?: () => boolean | void;
}

export interface ModalOptions extends BaseOptions {
  title?: string;
  subtitle?: string;
  /** Body text; use `content` for richer markup. */
  message?: string;
  content?: Child | Child[];
  actions?: ModalAction[];
  variant?: PanelVariant;
  /** Width in pixels. */
  width?: number;
  closable?: boolean;
  /** Dismiss when the dimmed backdrop is clicked. Default true. */
  dismissOnBackdrop?: boolean;
  /** Dismiss on Escape. Default true. */
  dismissOnEscape?: boolean;
  /** Render the pack's painted backdrop art behind the dim layer. */
  scenic?: boolean;
}

/**
 * A centred window over a dimmed backdrop — confirmations, level-up notices,
 * quest turn-ins, "are you sure you want to abandon?".
 *
 *   const m = new Modal({
 *     title: 'Abandon quest?',
 *     message: 'All progress on this quest will be lost.',
 *     actions: [{ label: 'Abandon' }, { label: 'Keep', variant: 'ghost' }],
 *   });
 *   m.open();
 *   m.on('modal:close', () => m.destroy());
 */
export class Modal extends FuiComponent<ModalOptions> {
  readonly panel: Panel;

  constructor(opts: ModalOptions = {}) {
    const root = h('div', { class: 'fui fui-modal', attrs: { role: 'dialog', 'aria-modal': 'true' } });
    if (opts.scenic) root.classList.add('fui-modal--scenic');
    super(root, opts);

    const backdrop = h('div', { class: 'fui-modal__backdrop' });
    if (opts.dismissOnBackdrop !== false) {
      backdrop.addEventListener('click', () => this.close());
    }
    root.appendChild(backdrop);

    this.panel = new Panel({
      title: opts.title,
      subtitle: opts.subtitle,
      variant: opts.variant ?? 'default',
      width: opts.width ?? 460,
      closable: opts.closable,
      class: 'fui-modal__panel',
    });
    this.panel.on('panel:close', () => this.close());

    if (opts.message) {
      this.panel.add(h('p', { class: 'fui-modal__message fui-body', text: opts.message }));
    }
    if (opts.content) {
      append(this.panel.body, ...(Array.isArray(opts.content) ? opts.content : [opts.content]));
    }

    if (opts.actions?.length) {
      const foot = h('footer', { class: 'fui-modal__actions' });
      for (const action of opts.actions) {
        const btn = new Button({
          label: action.label,
          icon: action.icon,
          variant: action.variant ?? 'primary',
          onClick: () => {
            const keepOpen = action.onClick?.() === false;
            this.emit('modal:action', action.label);
            if (!keepOpen) this.close();
          },
        });
        foot.appendChild(btn.el);
      }
      this.panel.el.appendChild(foot);
    }

    root.appendChild(this.panel.el);

    if (opts.dismissOnEscape !== false) {
      const esc = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape' && root.classList.contains('is-open')) this.close();
      };
      const d = root.ownerDocument;
      d.addEventListener('keydown', esc);
      this.onDestroy(() => d.removeEventListener('keydown', esc));
    }
  }

  /** Append to the document (if not already mounted) and reveal. */
  open(parent?: Element): this {
    if (!this.el.parentNode) (parent ?? this.el.ownerDocument.body).appendChild(this.el);
    // Next frame, so the entrance transition actually runs.
    requestAnimationFrame(() => this.el.classList.add('is-open'));
    this.emit('modal:open');
    return this;
  }

  close(): this {
    this.el.classList.remove('is-open');
    this.emit('modal:close');
    return this;
  }
}
