// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, clear } from '../core/dom.ts';
import { Portrait } from './Portrait.ts';

export interface DialogueChoice {
  id: string;
  text: string;
  /** Grey out and mark as unavailable, e.g. a failed skill check. */
  disabled?: boolean;
  /** Small right-hand tag: `'[Persuade]'`, `'Requires 3 Gold'`. */
  tag?: string;
  /** Marks a choice the player has already picked before. */
  seen?: boolean;
}

export interface DialogueLine {
  speaker?: string;
  text: string;
  /** Portrait image URL. */
  portrait?: string;
  /** Or a manifest asset id. */
  portraitArt?: string;
  choices?: DialogueChoice[];
}

export interface DialogueBoxOptions extends BaseOptions {
  /** Characters revealed per second. Set 0 to disable the typewriter. */
  speed?: number;
  /** Width in pixels, or any CSS length such as `'100%'`. */
  width?: number | string;
  /** Show a blinking "click to continue" chevron when a line finishes. */
  continueHint?: boolean;
  line?: DialogueLine;
}

/**
 * The conversation window: portrait, speaker nameplate, typewriter body text
 * and branching choices.
 *
 * Emits `dialogue:typed` when a line finishes revealing, `dialogue:advance`
 * when the player clicks through, and `dialogue:choice` with the chosen id.
 *
 *   const box = new DialogueBox({ width: 720 });
 *   box.say({ speaker: 'Elder Rowan', text: 'The gate has not opened in an age…',
 *             choices: [{ id: 'ask', text: 'What lies beyond it?' }] });
 */
export class DialogueBox extends FuiComponent<DialogueBoxOptions> {
  private portrait: Portrait;
  private speakerEl: HTMLElement;
  private textEl: HTMLElement;
  private choicesEl: HTMLElement;
  private typing: ReturnType<typeof setInterval> | null = null;
  private fullText = '';

  constructor(opts: DialogueBoxOptions = {}) {
    const root = h('div', {
      class: 'fui fui-dialogue',
      style: {
        width:
          opts.width == null
            ? '680px'
            : typeof opts.width === 'number'
              ? `${opts.width}px`
              : opts.width,
      },
    });
    super(root, opts);

    root.appendChild(h('div', { class: 'fui-dialogue__fill', attrs: { 'aria-hidden': 'true' } }));

    this.portrait = new Portrait({ size: 96, class: 'fui-dialogue__portrait' });
    root.appendChild(this.portrait.el);

    const main = h('div', { class: 'fui-dialogue__main' });
    this.speakerEl = h('div', { class: 'fui-dialogue__speaker fui-title' });
    this.textEl = h('p', { class: 'fui-dialogue__text fui-body' });
    this.choicesEl = h('ul', { class: 'fui-dialogue__choices' });
    main.append(this.speakerEl, this.textEl, this.choicesEl);
    root.appendChild(main);

    if (opts.continueHint !== false) {
      root.appendChild(h('span', { class: 'fui-dialogue__more', attrs: { 'aria-hidden': 'true' } }));
    }

    // A click either fast-forwards the typewriter or advances the line.
    root.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.fui-dialogue__choice')) return;
      if (this.typing) this.skip();
      else if (!this.choicesEl.childElementCount) this.emit('dialogue:advance');
    });

    if (opts.line) this.say(opts.line);
  }

  /** Show a line, replacing whatever was on screen. */
  say(line: DialogueLine): this {
    this.stopTyping();
    this.speakerEl.textContent = line.speaker ?? '';
    this.speakerEl.style.display = line.speaker ? '' : 'none';

    const hasPortrait = !!(line.portrait || line.portraitArt);
    this.el.classList.toggle('fui-dialogue--noportrait', !hasPortrait);
    if (line.portrait) this.portrait.setImage(line.portrait);
    else if (line.portraitArt) {
      this.portrait.el.querySelector<HTMLElement>('.fui-portrait__img')!.style.backgroundImage =
        `var(--fui-img-${line.portraitArt})`;
    }

    clear(this.choicesEl);
    this.fullText = line.text;
    const speed = this.opts.speed ?? 45;

    if (speed <= 0) {
      this.textEl.textContent = line.text;
      this.finish(line);
      return this;
    }

    this.textEl.textContent = '';
    this.el.classList.add('is-typing');
    let i = 0;
    this.typing = setInterval(() => {
      i++;
      this.textEl.textContent = this.fullText.slice(0, i);
      if (i >= this.fullText.length) {
        this.stopTyping();
        this.finish(line);
      }
    }, 1000 / speed);
    this.onDestroy(() => this.stopTyping());
    return this;
  }

  /** Reveal the rest of the line immediately. */
  skip(): this {
    if (!this.typing) return this;
    this.stopTyping();
    this.textEl.textContent = this.fullText;
    this.finish(this.opts.line ?? { text: this.fullText });
    return this;
  }

  private finish(line: DialogueLine): void {
    this.el.classList.remove('is-typing');
    if (line.choices?.length) this.renderChoices(line.choices);
    this.el.classList.toggle('has-choices', !!line.choices?.length);
    this.emit('dialogue:typed', line);
  }

  private renderChoices(choices: DialogueChoice[]): void {
    clear(this.choicesEl);
    choices.forEach((choice, n) => {
      const btn = h('button', {
        class: 'fui-dialogue__choice',
        attrs: { type: 'button', disabled: choice.disabled },
      });
      if (choice.seen) btn.classList.add('is-seen');
      btn.appendChild(h('span', { class: 'fui-dialogue__num fui-num', text: `${n + 1}.` }));
      btn.appendChild(h('span', { class: 'fui-dialogue__choice-text', text: choice.text }));
      if (choice.tag) btn.appendChild(h('span', { class: 'fui-dialogue__tag', text: choice.tag }));
      btn.addEventListener('click', () => this.emit('dialogue:choice', { id: choice.id, choice }));
      this.choicesEl.appendChild(h('li', null, btn));
    });
  }

  private stopTyping(): void {
    if (this.typing) clearInterval(this.typing);
    this.typing = null;
  }
}
