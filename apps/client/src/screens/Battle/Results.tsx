import { useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ARENA_TIERS, ARENA_TIER_LABELS, type ArenaTier } from '@mistvale/shared';
import { ResultScreen, type ResultReward, type ResultStat } from '@/fui/components/ResultScreen.ts';
import { useFui, useFuiAttrs } from '@/fui/react';
import { useDialogLayer } from '../../ui/Modal/dialog';
import { rewardArt } from '../../ui/Rewards/art';
import { useRewardName } from '../../ui/Rewards/Rewards';
import { useBattleStore } from '../../state/battleStore';
import { useContentStore } from '../../state/contentStore';
import styles from './Results.module.scss';

/**
 * What the fight paid.
 *
 * Every number here comes off the server's reward summary — the client does not add up
 * loot any more than it adds up damage.
 *
 * Painted by the library since the design rework: the gold headline, the rays behind it,
 * the three stars and the reward chips are `ResultScreen`, which is the shape this genre
 * has used for twenty years and the reason a win feels like one. What stays Mistvale's is
 * the *reading* — which of five outcomes this was, and which lines a player needs to see.
 *
 * It is not a `Modal`, but it joins the same overlay stack (P10b): the screen underneath
 * is still live, an unlock celebration can still open over it, and whichever is on top has
 * to be the one that owns the keyboard.
 */

const DIFFICULTY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  normal: 'Normal',
  hard: 'Hard',
  brutal: 'Brutal',
});

const OUTCOME_TEXT: Readonly<Record<string, string>> = Object.freeze({
  victory: 'Victory',
  defeat: 'Defeat',
  retreat: 'Withdrawn',
  turnLimit: 'The mist closed in',
});

export function Results({ onLeave }: { onLeave: () => void }): JSX.Element {
  const battle = useBattleStore((state) => state.battle);
  const bundle = useContentStore((state) => state.bundle);
  const nameOf = useRewardName();
  const rootRef = useRef<HTMLElement | null>(null);

  // Where this was, under the headline — "Veilwood Fringe 1-3 · Hard" rather than a key.
  // Read off the bundle the client already holds rather than asked of the server: the
  // fight knows which stage it is, and the client knows what that stage is called. A
  // stage carries no name of its own, so it is the chapter's name and the stage's place
  // in it, which is how the campaign screen names it too.
  const stageName = useMemo(() => {
    const stage = bundle?.stages.find((entry) => entry.key === battle?.stageKey);
    if (!stage) return null;
    const chapter = bundle?.campaignChapters.find((entry) => entry.key === stage.parentKey);
    const dungeon = bundle?.dungeons.find((entry) => entry.key === stage.parentKey);
    const place = chapter?.name ?? dungeon?.name ?? null;
    if (!place) return null;
    const where = chapter
      ? `${place} ${chapter.number}-${stage.number}`
      : `${place} · ${stage.number}`;
    return stage.difficulty === 'normal'
      ? where
      : `${where} · ${DIFFICULTY_LABELS[stage.difficulty]}`;
  }, [bundle, battle?.stageKey]);

  const outcome = battle?.outcome ?? 'defeat';
  const rewards = battle?.rewards ?? null;
  const won = outcome === 'victory';
  // A sandbox fight pays nothing on purpose, so a reward table of zeroes would read as a
  // bug rather than as the deal the player took.
  const practice = battle?.mode === 'practice';
  const arena = rewards?.arena ?? null;

  const options = useMemo(() => {
    // The Arena pays in rating and medals and nothing else, and it pays on a loss too — so
    // it reads as its own result rather than as a silver line saying zero.
    if (arena) {
      const stats: ResultStat[] = [
        {
          label: 'Rating',
          value: `${arena.ratingBefore} → ${arena.ratingAfter} (${arena.ratingDelta >= 0 ? '+' : ''}${arena.ratingDelta})`,
          best: arena.ratingDelta > 0,
        },
      ];
      if (arena.medals > 0) {
        stats.push({ label: 'Valor Medals', value: `+${arena.medals}`, best: true });
      }
      if (arena.tierAfter !== arena.tierBefore) {
        stats.push({
          label: isPromotion(arena.tierBefore, arena.tierAfter) ? 'Promoted' : 'Slipped back',
          value: ARENA_TIER_LABELS[arena.tierAfter],
          best: isPromotion(arena.tierBefore, arena.tierAfter),
        });
      }
      return {
        outcome: arena.won ? ('victory' as const) : ('defeat' as const),
        title: arena.won ? 'Victory' : 'Defeat',
        subtitle:
          !arena.won && outcome === 'retreat'
            ? // Walking out of the Arena is a loss, not an escape — the token was already spent.
              `${arena.opponent} — you walked out, and the token stays spent`
            : arena.won
              ? `You beat ${arena.opponent}`
              : `${arena.opponent} held`,
        stats,
        actions: [{ id: 'leave', label: 'Back to the Arena', primary: true }],
      };
    }

    if (practice) {
      return {
        outcome: 'neutral' as const,
        title: 'Practice',
        subtitle: 'No energy spent, nothing earned, nothing recorded — the stars are the answer',
        ...(won && rewards ? { stars: rewards.stars } : {}),
        actions: [{ id: 'leave', label: 'Back to the campaign', primary: true }],
      };
    }

    if (!won || !rewards) {
      return {
        outcome: 'defeat' as const,
        title: OUTCOME_TEXT[outcome] ?? 'The fight ended',
        subtitle:
          outcome === 'retreat'
            ? 'You pulled back. The energy stays spent — that is what makes retreating a decision'
            : 'No loot this time. Level a champion, or bring a wider team',
        actions: [{ id: 'leave', label: 'Back to the campaign', primary: true }],
      };
    }

    const stats: ResultStat[] = [{ label: 'Champion experience', value: rewards.championXp }];
    if (rewards.levelsGained > 0) {
      stats.push({ label: 'Levels gained', value: rewards.levelsGained, best: true });
    }
    if (rewards.firstClear && (rewards.bonus.silver ?? 0) > 0) {
      stats.push({ label: 'First clear', value: `+${rewards.bonus.silver}`, best: true });
    }
    if (rewards.gear.length > 0) {
      stats.push({ label: 'Relics found', value: rewards.gear.length, best: true });
    }
    if (rewards.vaultOverflow.count > 0) {
      // Said out loud rather than left as a drop that quietly never arrived. A relic that
      // will not fit is sold for its worth, which is the kindest reading of a full vault —
      // but only if the player is told it happened.
      stats.push({
        label: `Vault full — ${rewards.vaultOverflow.count} sold on the road`,
        value: `+${rewards.vaultOverflow.silver.toLocaleString()}`,
      });
    }
    if (rewards.chestTiers.length > 0) {
      stats.push({
        label: 'Star chest claimed',
        value: `${rewards.chestTiers.join(' and ')} stars`,
        best: true,
      });
    }

    // The day's first win, as chips rather than folded into the silver line: a player who
    // does not know this exists will not come back tomorrow for it.
    const chips: ResultReward[] = Object.entries(rewards.firstWin)
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => ({ icon: rewardArt(key), label: nameOf(key), qty: amount }));

    return {
      outcome: 'victory' as const,
      title: 'Victory',
      ...(stageName ? { subtitle: stageName } : {}),
      stars: rewards.stars,
      xp: rewards.playerXp,
      gold: rewards.silver,
      stats,
      ...(chips.length > 0 ? { rewards: chips } : {}),
      actions: [{ id: 'leave', label: 'Back to the campaign', primary: true }],
    };
  }, [arena, nameOf, outcome, practice, rewards, stageName, won]);

  const { ref, instance } = useFui(
    ResultScreen,
    { ...options, class: styles.result },
    { 'result:action': () => onLeave() },
  );

  // The element, handed to the dialog hook. Written in a layout effect rather than during
  // render: a ref assigned while rendering is a side effect in a function React is
  // allowed to call twice, and the trap only needs the element before the first keypress.
  useLayoutEffect(() => {
    rootRef.current = instance?.el ?? null;
  }, [instance]);

  // Written to the library's own element, which is the thing that covers the screen.
  // `aria-label` rather than `aria-labelledby`: the headline is the library's markup, and
  // giving it an id from out here would mean reaching into a vendored component.
  useFuiAttrs(instance?.el, {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': options.title,
    tabindex: -1,
  });

  // A full-screen overlay holding the only way forward is a dialog, and has to behave
  // like one: it takes focus, Tab stays inside it, Escape leaves, and it sits at its own
  // depth so an unlock celebration opening on top of a victory lands on top. The cues are
  // off — a victory already has a sound, and the modal's open chime over it reads as two
  // things happening.
  const { depth } = useDialogLayer(rootRef, {
    open: true,
    dismissible: true,
    onClose: onLeave,
    cues: false,
  });
  // The stack offset is written to the element rather than passed at construction: a
  // celebration opening over the result changes the depth, and rebuilding the result for
  // it would restart the star animation and drop focus.
  useLayoutEffect(() => {
    instance?.el.style.setProperty('--mv-layer-depth', String(depth));
  }, [instance, depth]);

  // Portalled to the body, like every other overlay in the game.
  //
  // A `z-index` only competes inside its own stacking context, and the battle screen is
  // one — so a result rendered in place sat *underneath* the tutorial overlay however
  // high its z-index went, and the Wardenmaster's parchment swallowed the only button on
  // the victory screen. The overlay is deliberately below modals so the starter choice
  // can land on top of it; the result has to be up there with the modals to clear it.
  return createPortal(<div ref={ref} style={{ display: 'contents' }} />, document.body);
}

/** Whether a tier change went up the ladder. Read off the canonical order, not the name. */
function isPromotion(before: ArenaTier, after: ArenaTier): boolean {
  return ARENA_TIERS.indexOf(after) > ARENA_TIERS.indexOf(before);
}
