// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions, type Rarity } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface ToastMessage {
  title: string;
  /** Secondary line under the title. */
  text?: string;
  /** Asset id for the leading art — the item you picked up, the quest icon. */
  icon?: string;
  tone?: 'info' | 'success' | 'warn' | 'danger' | 'gold';
  /** Tints the border with a rarity colour — for item drops. */
  rarity?: Rarity;
  /** Milliseconds on screen. Default 3200; pass 0 to require dismissal. */
  duration?: number;
}

export interface ToastStackOptions extends BaseOptions {
  position?: 'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left';
  /** Oldest toasts are dropped past this many. Default 5. */
  max?: number;
}

/**
 * The notification corner: item pickups, quest updates, level-ups, warnings.
 *
 *   const toasts = new ToastStack({ mount: document.body });
 *   toasts.push({ title: 'Emberfang', text: 'Added to inventory',
 *                 icon: 'icon-sword', rarity: 'epic' });
 */
export class ToastStack extends FuiComponent<ToastStackOptions> {
  constructor(opts: ToastStackOptions = {}) {
    const root = h('div', {
      class: 'fui fui-toasts',
      dataset: { position: opts.position ?? 'top-right' },
      attrs: { role: 'status', 'aria-live': 'polite' },
    });
    super(root, opts);
  }

  /** Show a message. Returns a dismiss function. */
  push(msg: ToastMessage): () => void {
    const node = h('div', {
      class: 'fui-toast',
      dataset: { tone: msg.tone ?? 'info', ...(msg.rarity ? { rarity: msg.rarity } : {}) },
    });
    node.appendChild(h('div', { class: 'fui-toast__fill', attrs: { 'aria-hidden': 'true' } }));

    if (msg.icon) {
      node.appendChild(
        h('span', {
          class: 'fui-toast__icon',
          style: { backgroundImage: `var(--fui-img-${msg.icon})` },
        }),
      );
    }
    node.appendChild(
      h(
        'div',
        { class: 'fui-toast__body' },
        h('div', { class: 'fui-toast__title', text: msg.title }),
        msg.text && h('div', { class: 'fui-toast__text', text: msg.text }),
      ),
    );

    const dismiss = () => {
      node.classList.add('is-leaving');
      node.addEventListener('animationend', () => node.remove(), { once: true });
    };
    node.addEventListener('click', dismiss);

    this.el.appendChild(node);

    // Trim the oldest so the corner never fills the screen.
    const max = this.opts.max ?? 5;
    while (this.el.children.length > max) this.el.firstElementChild?.remove();

    const life = msg.duration ?? 3200;
    if (life > 0) {
      const t = setTimeout(dismiss, life);
      node.addEventListener('click', () => clearTimeout(t), { once: true });
    }
    return dismiss;
  }

  /** Convenience wrappers for the common tones. */
  success(title: string, text?: string) {
    return this.push({ title, text, tone: 'success' });
  }
  warn(title: string, text?: string) {
    return this.push({ title, text, tone: 'warn' });
  }
  danger(title: string, text?: string) {
    return this.push({ title, text, tone: 'danger' });
  }

  clear(): this {
    while (this.el.firstChild) this.el.firstChild.remove();
    return this;
  }
}
