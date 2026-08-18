// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h, commas, abbreviate } from '../core/dom.ts';

export interface PodiumEntry {
  name: string;
  /** Avatar asset id. */
  art?: string;
  /** Score, rating or damage. */
  score?: number;
  /** Clan tag or subtitle. */
  tag?: string;
  /** Reward earned for this place. */
  reward?: string;
  /** Highlight this as the local player. */
  you?: boolean;
}

export interface LeaderboardPodiumOptions extends BaseOptions {
  /** First, second and third place, in that order. */
  entries: [PodiumEntry?, PodiumEntry?, PodiumEntry?] | PodiumEntry[];
  /** Heading over the podium. */
  title?: string;
  /** Line under the heading — season, bracket, reset time. */
  subtitle?: string;
  /** Frame shape from the ornament pack used behind each avatar, 1–32. */
  frameShape?: number;
  /** Abbreviate scores: 1240000 becomes "1.24M". */
  compactScores?: boolean;
  /** Winner avatar diameter in pixels. Second and third scale down from it. */
  size?: number;
}

/** Podium colours are fixed by convention — gold, silver, bronze. */
const PLACE_INK = ['#e8c14a', '#c6ccd4', '#c98544'];
const PLACE_LABEL = ['1', '2', '3'];

/**
 * The top-three podium that heads a leaderboard: first place raised in the
 * middle, second and third stepped down either side.
 *
 *   new LeaderboardPodium({
 *     title: 'Clan Boss — Nightmare',
 *     subtitle: 'Season 14 · resets in 2d',
 *     frameShape: 7,
 *     compactScores: true,
 *     entries: [
 *       { name: 'Rhogar', art: 'tech-mech-suit', score: 48_200_000, reward: '1 Void Shard' },
 *       { name: 'Nell', art: 'fire-phoenix-rise', score: 44_100_000, you: true },
 *       { name: 'Sable', art: 'hunt-dire-wolf', score: 39_800_000 },
 *     ],
 *   });
 *
 * Pair it with `Leaderboard` for places four and below — the podium carries the
 * ceremony, the list carries the data.
 */
export class LeaderboardPodium extends FuiComponent<LeaderboardPodiumOptions> {
  constructor(opts: LeaderboardPodiumOptions) {
    const root = h('div', {
      class: 'fui fui-podium',
      style: { '--fui-podium-size': `${opts.size ?? 84}px` },
    });
    super(root, opts);

    if (opts.title || opts.subtitle) {
      const head = h('div', { class: 'fui-podium__head' });
      if (opts.title) {
        head.appendChild(h('p', { class: 'fui-podium__title fui-title', text: opts.title }));
      }
      if (opts.subtitle) {
        head.appendChild(h('p', { class: 'fui-podium__subtitle', text: opts.subtitle }));
      }
      root.appendChild(head);
    }

    // Rendered second, first, third so the winner sits in the middle without
    // anyone having to reorder the data they pass in.
    const stage = h('div', { class: 'fui-podium__stage' });
    for (const place of [1, 0, 2]) {
      const entry = opts.entries[place];
      if (!entry) continue;
      stage.appendChild(this.makePlinth(entry, place, opts));
    }
    root.appendChild(stage);
  }

  private makePlinth(entry: PodiumEntry, place: number, opts: LeaderboardPodiumOptions): HTMLElement {
    const el = h('div', {
      class: 'fui-podium__place',
      dataset: { place: String(place + 1) },
      style: { '--fui-podium-ink': PLACE_INK[place] ?? PLACE_INK[2] },
    });
    if (entry.you) el.classList.add('is-you');

    const avatar = h('div', { class: 'fui-podium__avatar' });
    const art = h('span', { class: 'fui-podium__art' });
    if (entry.art) art.style.backgroundImage = `var(--fui-img-${entry.art})`;
    avatar.appendChild(art);

    if (opts.frameShape) {
      // The ornament is a tinted mask, so the same frame renders gold, silver
      // and bronze from one asset.
      avatar.appendChild(
        h('span', {
          class: 'fui-podium__frame',
          style: {
            '--fui-podium-frame': `var(--fui-img-deco-frame-${String(opts.frameShape).padStart(2, '0')})`,
          },
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }
    if (place === 0) avatar.appendChild(h('span', { class: 'fui-podium__crown', attrs: { 'aria-hidden': 'true' } }));
    el.appendChild(avatar);

    el.appendChild(h('span', { class: 'fui-podium__name', text: entry.name }));
    if (entry.tag) el.appendChild(h('span', { class: 'fui-podium__tag', text: entry.tag }));
    if (entry.score != null) {
      el.appendChild(
        h('span', {
          class: 'fui-podium__score fui-num',
          text: opts.compactScores ? abbreviate(entry.score) : commas(entry.score),
          attrs: { title: commas(entry.score) },
        }),
      );
    }

    const plinth = h('div', { class: 'fui-podium__plinth' });
    plinth.appendChild(
      h('span', { class: 'fui-podium__rank fui-num', text: PLACE_LABEL[place] ?? String(place + 1) }),
    );
    if (entry.reward) {
      plinth.appendChild(h('span', { class: 'fui-podium__reward', text: entry.reward }));
    }
    el.appendChild(plinth);
    return el;
  }
}
