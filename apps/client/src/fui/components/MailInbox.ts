// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear, abbreviate, commas } from '../core/dom.ts';

export interface MailAttachment {
  /** Manifest asset id for the item art. */
  art?: string;
  /** Glyph asset id for a currency. */
  glyph?: string;
  qty?: number;
  name?: string;
}

export interface MailMessage {
  id: string;
  subject: string;
  /** Who sent it — a player, "System", an event name. */
  from?: string;
  /** Body preview. */
  body?: string;
  /** Relative time, e.g. "2h ago". */
  time?: string;
  read?: boolean;
  attachments?: MailAttachment[];
  /** Expiry warning shown in the row, e.g. "Expires in 2d". */
  expires?: string;
}

export interface MailInboxOptions extends BaseOptions {
  messages: MailMessage[];
  /** Cap the height and scroll inside. */
  maxHeight?: number | string;
  /** Show the "Claim all" button. */
  claimAll?: boolean;
  /** Shown when the inbox is empty. */
  emptyText?: string;
  title?: string;
}

/**
 * The mailbox every live game needs: compensation, event payouts, clan gifts,
 * with attachments claimable per message or all at once.
 *
 *   const inbox = new MailInbox({
 *     title: 'Mail', claimAll: true, maxHeight: 380,
 *     messages: [
 *       { id: 'm1', from: 'System', subject: 'Maintenance compensation',
 *         time: '2h ago', attachments: [{ glyph: 'glyph-coin-stack', qty: 50_000 }],
 *         expires: 'Expires in 6d' },
 *     ],
 *   });
 *   inbox.on<string>('mail:claim', (id) => claim(id));
 *   inbox.on('mail:claim-all', () => claimEverything());
 *
 * `remove()` takes a claimed message out without a rebuild, which is what the
 * claim handler calls once the server confirms.
 */
export class MailInbox extends FuiComponent<MailInboxOptions> {
  private body: HTMLElement;
  private messages: MailMessage[];
  private claimBtn: HTMLButtonElement | null = null;
  private countEl: HTMLElement | null = null;

  constructor(opts: MailInboxOptions) {
    const root = h('div', { class: 'fui fui-mail' });
    super(root, opts);
    this.messages = [...opts.messages];

    if (opts.title || opts.claimAll) {
      const head = h('div', { class: 'fui-mail__head' });
      if (opts.title) {
        head.appendChild(h('span', { class: 'fui-mail__title fui-label', text: opts.title }));
      }
      this.countEl = h('span', { class: 'fui-mail__count fui-num' });
      head.appendChild(this.countEl);
      if (opts.claimAll) {
        this.claimBtn = h('button', {
          class: 'fui-mail__claim-all',
          text: 'Claim all',
          attrs: { type: 'button' },
        });
        this.claimBtn.addEventListener('click', () => this.emit('mail:claim-all', this.claimable()));
        head.appendChild(this.claimBtn);
      }
      root.appendChild(head);
    }

    this.body = h('div', { class: 'fui-mail__body fui-scroll' });
    if (opts.maxHeight != null) {
      this.body.style.maxHeight =
        typeof opts.maxHeight === 'number' ? `${opts.maxHeight}px` : opts.maxHeight;
    }
    root.appendChild(this.body);
    this.render();
  }

  /** Ids of every message that still has something attached. */
  claimable(): string[] {
    return this.messages.filter((m) => m.attachments?.length).map((m) => m.id);
  }

  /** Drop a message from the list, e.g. once its claim is confirmed. */
  remove(id: string): this {
    this.messages = this.messages.filter((m) => m.id !== id);
    this.render();
    return this;
  }

  /** Replace the whole list. */
  setMessages(messages: MailMessage[]): this {
    this.messages = [...messages];
    this.render();
    return this;
  }

  private render(): void {
    clear(this.body);

    if (this.messages.length === 0) {
      this.body.appendChild(
        h('p', { class: 'fui-mail__empty', text: this.opts.emptyText ?? 'No mail.' }),
      );
    }

    for (const msg of this.messages) {
      const row = h('div', { class: 'fui-mail__msg', dataset: { id: msg.id } });
      if (!msg.read) row.classList.add('is-unread');

      const head = h('div', { class: 'fui-mail__msg-head' });
      head.appendChild(h('span', { class: 'fui-mail__subject', text: msg.subject }));
      if (msg.time) head.appendChild(h('span', { class: 'fui-mail__time', text: msg.time }));
      row.appendChild(head);

      if (msg.from) row.appendChild(h('span', { class: 'fui-mail__from', text: msg.from }));
      if (msg.body) row.appendChild(h('p', { class: 'fui-mail__preview fui-body', text: msg.body }));

      if (msg.attachments?.length) {
        const atts = h('div', { class: 'fui-mail__atts' });
        for (const att of msg.attachments) {
          const chip = h('span', {
            class: 'fui-mail__att',
            attrs: { title: att.name ?? '' },
          });
          if (att.art) chip.style.backgroundImage = `var(--fui-img-${att.art})`;
          else if (att.glyph) {
            chip.classList.add('is-glyph');
            chip.style.setProperty('--fui-glyph-src', `var(--fui-img-${att.glyph})`);
          }
          if (att.qty != null) {
            // Attachment chips are 34px wide, so a five-figure payout is
            // abbreviated on the badge and spelled out in the tooltip.
            chip.title = `${att.name ?? ''} ×${commas(att.qty)}`.trim();
            chip.appendChild(
              h('span', { class: 'fui-mail__att-qty fui-num', text: abbreviate(att.qty) }),
            );
          }
          atts.appendChild(chip);
        }
        row.appendChild(atts);

        const claim = h('button', {
          class: 'fui-mail__claim',
          text: 'Claim',
          attrs: { type: 'button' },
        });
        claim.addEventListener('click', () => this.emit('mail:claim', msg.id));
        row.appendChild(claim);
      }

      if (msg.expires) {
        row.appendChild(h('span', { class: 'fui-mail__expires', text: msg.expires }));
      }

      row.addEventListener('click', (ev) => {
        // The claim button lives inside the row, so opening must not fire when
        // the click was actually on it.
        if ((ev.target as HTMLElement).closest('.fui-mail__claim')) return;
        msg.read = true;
        row.classList.remove('is-unread');
        this.paintCount();
        this.emit('mail:open', msg.id);
      });
      this.body.appendChild(row);
    }
    this.paintCount();
  }

  private paintCount(): void {
    const unread = this.messages.filter((m) => !m.read).length;
    if (this.countEl) this.countEl.textContent = unread > 0 ? `${unread} unread` : '';
    if (this.claimBtn) this.claimBtn.disabled = this.claimable().length === 0;
  }
}
