import type { NewsPostDef } from '@mistvale/shared';

/**
 * The seeded feed (CONTENT_PLAN §170).
 *
 * Two posts: a welcome that never expires, and a patch-note *template* an operator clones
 * rather than composes from nothing. The template ships inactive — it is scaffolding, and a
 * post reading "what changed this week" going live on its own would be worse than no feed
 * at all.
 *
 * Neither carries a window. A post with no `startsAt` is simply always up, which is what a
 * welcome should be; scheduling is for the announcements that come later.
 */
export const NEWS_POSTS: NewsPostDef[] = [
  {
    key: 'news_welcome',
    title: 'Welcome to the Vale',
    body: [
      'The mist took the Vale a long time ago, and it has been giving it back one stage at a time ever since. You are a Valewarden: you gather champions, you take them down into it, and you bring back what it was holding.',
      '**Start with the campaign.** Every stage you clear pays silver, relics and account experience, and the map opens as you go. When a champion stops being able to carry you, feed it, rank it, and put better relics on it — that loop is the whole game, and it does not change shape between chapter 1 and chapter 12.',
      '**Check the calendar and your quests each day.** Both pay for things you were going to do anyway, and the day’s first victory in each mode pays a bonus with nothing to claim.',
      'This is an early build. Numbers will move, and the Vale will get deeper.',
    ].join('\n\n'),
    startsAt: '',
    endsAt: '',
    pinned: true,
    active: true,
    sortOrder: 10,
  },
  {
    key: 'news_patch_template',
    title: 'Patch notes — [version]',
    body: [
      '**Champions.** What changed, and why it changed. Name the champion and the number that moved, not the intent alone — a player who reads "brought in line" learns nothing about whether to keep levelling it.',
      '**Content.** New stages, dungeons, events or shop stock.',
      '**Fixes.** What was broken and now is not. Worth listing even when it was invisible; a fix nobody hears about is a fix nobody trusts happened.',
      '_Clone this post, fill it in, set the window, and turn it on._',
    ].join('\n\n'),
    startsAt: '',
    endsAt: '',
    pinned: false,
    active: false,
    sortOrder: 20,
  },
];
