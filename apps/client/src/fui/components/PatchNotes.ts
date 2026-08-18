// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, append, type Child } from '../core/dom.ts';

export type PatchKind = 'new' | 'buff' | 'nerf' | 'fix' | 'balance' | 'event';

export interface PatchLine {
  kind?: PatchKind;
  text: string;
  /** Who or what it affects — a champion, a mode. */
  subject?: string;
  /** Manifest asset id for the subject's art. */
  art?: string;
}

export interface PatchRelease {
  /** Version string, e.g. "4.2.0". */
  version: string;
  /** Release date, already formatted. */
  date?: string;
  /** Headline for the release. */
  title?: string;
  lines: PatchLine[];
  /** Expanded on first render. */
  open?: boolean;
}

export interface PatchNotesOptions extends BaseOptions {
  releases: PatchRelease[];
  title?: string;
  /** Cap the height in pixels (or any CSS length) and scroll inside. */
  maxHeight?: number | string;
  /** Extra content under the list — a link, a button. */
  footer?: Child | Child[];
}

const KIND_LABEL: Record<PatchKind, string> = {
  new: 'New',
  buff: 'Buff',
  nerf: 'Nerf',
  fix: 'Fix',
  balance: 'Balance',
  event: 'Event',
};

/**
 * The changelog panel a live game shows on login — versions, dates, and each
 * change tagged as a buff, a nerf, a fix or something new.
 *
 *   new PatchNotes({
 *     title: "What's new",
 *     maxHeight: 380,
 *     releases: [
 *       { version: '4.2.0', date: '18 Aug', title: 'Ember Ascendant', open: true, lines: [
 *         { kind: 'new', text: 'Ember Ascendant event runs for two weeks.' },
 *         { kind: 'nerf', subject: 'Vexhollow', art: 'blood-necromancer',
 *           text: 'Grave Tithe healing reduced from 20% to 15%.' },
 *       ] },
 *     ],
 *   });
 *
 * The tag is the useful part: a player scanning for whether their main got hit
 * is looking for the red word, not reading the paragraph.
 */
export class PatchNotes extends FuiComponent<PatchNotesOptions> {
  private sections: HTMLElement[] = [];

  constructor(opts: PatchNotesOptions) {
    const root = h('div', { class: 'fui fui-patch' });
    super(root, opts);

    if (opts.title) {
      root.appendChild(
        h('div', { class: 'fui-patch__head' },
          h('span', { class: 'fui-patch__title fui-label', text: opts.title }),
        ),
      );
    }

    const body = h('div', { class: 'fui-patch__body fui-scroll' });
    if (opts.maxHeight != null) {
      body.style.maxHeight =
        typeof opts.maxHeight === 'number' ? `${opts.maxHeight}px` : opts.maxHeight;
    }

    opts.releases.forEach((release, i) => {
      const section = h('section', { class: 'fui-patch__release' });
      if (release.open ?? i === 0) section.classList.add('is-open');

      const header = h('button', {
        class: 'fui-patch__release-head',
        attrs: { type: 'button', 'aria-expanded': String(release.open ?? i === 0) },
      });
      header.appendChild(h('span', { class: 'fui-patch__version fui-num', text: release.version }));
      if (release.title) {
        header.appendChild(h('span', { class: 'fui-patch__release-title', text: release.title }));
      }
      if (release.date) {
        header.appendChild(h('span', { class: 'fui-patch__date', text: release.date }));
      }
      header.appendChild(h('span', { class: 'fui-patch__caret', attrs: { 'aria-hidden': 'true' } }));
      header.addEventListener('click', () => this.toggle(i));
      section.appendChild(header);

      const list = h('ul', { class: 'fui-patch__lines' });
      for (const line of release.lines) {
        const kind = line.kind ?? 'balance';
        const item = h('li', { class: 'fui-patch__line', dataset: { kind } });
        item.appendChild(h('span', { class: 'fui-patch__tag', text: KIND_LABEL[kind] }));
        if (line.art) {
          item.appendChild(
            h('span', {
              class: 'fui-patch__art',
              style: { backgroundImage: `var(--fui-img-${line.art})` },
            }),
          );
        }
        const text = h('span', { class: 'fui-patch__text' });
        if (line.subject) {
          text.appendChild(h('strong', { class: 'fui-patch__subject', text: line.subject }));
        }
        text.appendChild(h('span', { text: line.text }));
        item.appendChild(text);
        list.appendChild(item);
      }
      section.appendChild(h('div', { class: 'fui-patch__wrap' }, h('div', { class: 'fui-patch__clip' }, list)));

      this.sections.push(section);
      body.appendChild(section);
    });

    root.appendChild(body);

    if (opts.footer) {
      const foot = h('div', { class: 'fui-patch__foot' });
      append(foot, ...(Array.isArray(opts.footer) ? opts.footer : [opts.footer]));
      root.appendChild(foot);
    }
  }

  /** Expand or collapse one release by index. */
  toggle(index: number): this {
    const section = this.sections[index];
    if (!section) return this;
    const next = !section.classList.contains('is-open');
    section.classList.toggle('is-open', next);
    section.querySelector('.fui-patch__release-head')?.setAttribute('aria-expanded', String(next));
    this.emit(next ? 'patch:open' : 'patch:close', this.opts.releases[index]?.version);
    return this;
  }
}
