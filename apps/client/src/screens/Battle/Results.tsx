import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ARENA_TIERS,
  ARENA_TIER_LABELS,
  type ArenaResult,
  type ArenaTier,
  type GearInstance,
  type StageDef,
  type TitanRun,
} from '@mistvale/shared';
import type { BattleRewards } from '../../api/game';
import { ResultScreen } from '@/fui/components/ResultScreen.ts';
import { useFui, useFuiAttrs } from '@/fui/react';
import { Button } from '../../ui/Button/Button';
import { useDialogLayer } from '../../ui/Modal/dialog';
import { Rewards } from '../../ui/Rewards/Rewards';
import { Icon } from '../../ui/Icon/Icon';
import { useBattleStore } from '../../state/battleStore';
import { useContentStore } from '../../state/contentStore';
import { usePlayerStore } from '../../state/playerStore';
import { useProgressStore } from '../../state/progressStore';
import { RelicCard } from '../Relics/RelicCard';
import { ResultParty } from './ResultParty';
import { TeamSelect } from './TeamSelect';
import { canRefight, energyCost, nextStage } from './nextStage';
import styles from './Results.module.scss';

/**
 * What the fight did, and what to do next.
 *
 * Every number here comes off the server's reward summary — the client does not add up
 * loot any more than it adds up damage.
 *
 * Laid out to the owner's reference (2026-08-29): where you were and how long it took in
 * the top corner, the stars and the headline in the middle of the light, what the account
 * has left to spend in the other corner, then the spoils as one strip, then a card per
 * champion, then the ways on. The composition is the one this genre settled on because it
 * answers the three questions a player has in the order they have them — *did I win, what
 * did I get, can I go again*.
 *
 * The library still paints the ground: `ResultScreen` is the backdrop, the turning rays,
 * the gold headline and the three stars, which is chrome and holds no state React drives.
 * Everything below it is Mistvale's, portalled into the library's own root so the two are
 * laid out by one box — the design rework's rule as written, and the reason the stat list
 * and the reward chips the pack draws are no longer asked for: what the game has to say
 * after a fight is a strip, a party and a footer, and none of those is a `dl`.
 *
 * It is not a `Modal`, but it joins the same overlay stack (P10b): the screen underneath
 * is still live, a banner can still land over it, and whichever is on top has to be the
 * one that owns the keyboard.
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

/** One line of "why", under the spoils. Ours rather than the library's `ResultStat`. */
interface Note {
  label: string;
  value: string | number;
  /** The standout line — a record, a first clear, a boost that paid. */
  best?: boolean;
}

export function Results({ onLeave }: { onLeave: () => void }): JSX.Element {
  const battle = useBattleStore((state) => state.battle);
  const startBattle = useBattleStore((state) => state.startBattle);
  const busy = useBattleStore((state) => state.busy);
  const bundle = useContentStore((state) => state.bundle);
  const energy = usePlayerStore((state) => state.player?.energy ?? null);
  const standings = useProgressStore((state) => state.stages);
  const rootRef = useRef<HTMLElement | null>(null);
  const [again, setAgain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = battle?.mode ?? '';
  const stage = bundle?.stages.find((entry) => entry.key === battle?.stageKey);

  /**
   * Where this was, under the headline — "Veilwood Fringe 1-3 · Hard" rather than a key.
   *
   * Read off the bundle the client already holds rather than asked of the server: the
   * fight knows which stage it is, and the client knows what that stage is called. A stage
   * carries no name of its own, so it is the chapter's name and the stage's place in it,
   * which is how the campaign screen names it too.
   */
  const stageName = useMemo(() => {
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
  }, [bundle, stage]);

  const outcome = battle?.outcome ?? 'defeat';
  const rewards = battle?.rewards ?? null;
  // Every mode, won or lost or walked away from — the owner's rule. The server sends it
  // only on a finished fight, so an empty list is the honest "nothing to report yet".
  const contributions = battle?.contributions ?? [];
  const won = outcome === 'victory';
  // A sandbox fight pays nothing on purpose, so a reward strip of zeroes would read as a
  // bug rather than as the deal the player took.
  const practice = mode === 'practice';
  const arena = rewards?.arena ?? null;
  const titan = rewards?.titan ?? null;

  const report = useMemo(
    () => buildReport({ arena, titan, practice, won, outcome, rewards }),
    [arena, titan, practice, won, outcome, rewards],
  );

  const { ref, instance } = useFui(
    ResultScreen,
    {
      outcome: report.tone,
      title: report.title,
      // The place is named in the corner, so the headline does not say it again — C12c's
      // rule, which this screen would otherwise break on every campaign clear.
      ...(report.subtitle ? { subtitle: report.subtitle } : {}),
      ...(report.stars !== null ? { stars: report.stars } : {}),
      // The pack defaults to a lone "Continue" when this is missing, and the ways on are
      // Mistvale's row at the foot of the composition rather than a button in its card.
      actions: [],
      class: styles.result,
    },
    {},
  );

  // The element, handed to the dialog hook. Written in a layout effect rather than during
  // render: a ref assigned while rendering is a side effect in a function React is allowed
  // to call twice, and the trap only needs the element before the first keypress.
  useLayoutEffect(() => {
    rootRef.current = instance?.el ?? null;
  }, [instance]);

  // Written to the library's own element, which is the thing that covers the screen.
  // `aria-label` rather than `aria-labelledby`: the headline is the library's markup, and
  // giving it an id from out here would mean reaching into a vendored component.
  useFuiAttrs(instance?.el, {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': report.title,
    tabindex: -1,
  });

  // A full-screen overlay holding the only way forward is a dialog, and has to behave like
  // one: it takes focus, Tab stays inside it, Escape leaves, and it sits at its own depth
  // so anything opening on top of a victory lands on top. The cues are off — a victory
  // already has a sound, and the modal's open chime over it reads as two things happening.
  const { depth } = useDialogLayer(rootRef, {
    open: true,
    dismissible: true,
    onClose: onLeave,
    cues: false,
  });
  // The stack offset is written to the element rather than passed at construction: anything
  // opening over the result changes the depth, and rebuilding the result for it would
  // restart the star animation and drop focus.
  useLayoutEffect(() => {
    instance?.el.style.setProperty('--mv-layer-depth', String(depth));
  }, [instance, depth]);

  /**
   * The ways on, and what each of them costs.
   *
   * Offered only where pressing one can actually work: a stage this fight can simply be had
   * again on, and — for **Next** — a stage after it that the server has already said is
   * open. Everything else is refused at the door anyway, and a button that is drawn and
   * then refused is worse than one that was never there.
   */
  const repeatable = canRefight(stage, mode);
  const cost = repeatable ? energyCost(stage, mode) : 0;
  const affordable = (energy?.value ?? 0) >= cost;
  const following = repeatable && won ? nextStage(stage, bundle?.stages ?? [], standings) : null;
  const team = battle?.team ?? [];

  /**
   * Again, and Next: the same four, no borrowed warden.
   *
   * `team` is the account's own copies — a borrowed champion is never in it (C37) — and
   * that is right rather than a gap: the day's one borrow was spent on the fight that
   * just finished, so offering to bring them again would be offering something the
   * server has already refused.
   */
  const fight = async (target: StageDef): Promise<void> => {
    setError(null);
    try {
      await startBattle({ mode, stageKey: target.key, team: [...team] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That fight could not be started.');
    }
  };

  // Portalled to the body, like every other overlay in the game.
  //
  // A `z-index` only competes inside its own stacking context, and the battle screen is one
  // — so a result rendered in place sat *underneath* the tutorial overlay however high its
  // z-index went, and the Wardenmaster's parchment swallowed the only button on the victory
  // screen. The overlay is deliberately below modals so the starter choice can land on top
  // of it; the result has to be up there with the modals to clear it.
  return createPortal(
    <>
      <div ref={ref} style={{ display: 'contents' }} />
      {instance
        ? createPortal(
            <>
              <div className={styles.corner} data-side="left">
                {stageName && <p className={styles.where}>{stageName}</p>}
                <Clock turns={rewards?.turns ?? 0} best={rewards?.previousBest ?? null} />
              </div>

              {energy && (
                <p className={styles.corner} data-side="right">
                  <Icon name="energy" size={18} />
                  <span className={styles.energy}>
                    {energy.value.toLocaleString()}
                    <span className={styles.cap}>/{energy.cap}</span>
                  </span>
                </p>
              )}

              <div className={styles.body}>
                <Spoils rewards={report.spoils} relics={report.relics} />
                {report.notes.length > 0 && (
                  <dl className={styles.notes}>
                    {report.notes.map((note) => (
                      <div key={note.label} className={styles.note} data-best={note.best === true}>
                        <dt>{note.label}</dt>
                        <dd>
                          {typeof note.value === 'number'
                            ? note.value.toLocaleString()
                            : note.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <ResultParty
                  rows={contributions}
                  team={team}
                  borrowedFrom={battle?.borrowedFrom ?? null}
                />

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.ways}>
                  {repeatable && (
                    <Button
                      variant="secondary"
                      disabled={busy || !affordable || team.length === 0}
                      onClick={() => void fight(stage)}
                    >
                      {cost > 0 ? `Again · ${cost} energy` : 'Again'}
                    </Button>
                  )}
                  {repeatable && (
                    <Button variant="ghost" disabled={busy} onClick={() => setAgain(true)}>
                      Change team
                    </Button>
                  )}
                  {following && (
                    <Button
                      variant="secondary"
                      disabled={busy || !affordable || team.length === 0}
                      onClick={() => void fight(following)}
                    >
                      {cost > 0 ? `Next · ${cost} energy` : 'Next'}
                    </Button>
                  )}
                  <Button variant="primary" onClick={onLeave}>
                    {report.leave}
                  </Button>
                </div>
              </div>
            </>,
            instance.el,
          )
        : null}
      {/* The picker, over the result. It owns every economy this screen deliberately does
          not — the farm allowance, the sandbox, a ward — so "change team" costs nothing
          here beyond naming the stage. */}
      {again && stage && (
        <TeamSelect
          stage={stage}
          // Named the way the corner names it. Without a title the picker falls back to
          // "Stage 1", which is the stage's number inside a chapter it does not mention.
          {...(stageName ? { title: stageName } : {})}
          onClose={() => setAgain(false)}
        />
      )}
    </>,
    document.body,
  );
}

/**
 * How long it took, against how long it has ever taken.
 *
 * **Turns rather than a clock**, which is the one place this screen deliberately departs
 * from its reference: Mistvale is turn-based and playback runs at ×1, ×2 or ×4, so a
 * wall-clock reading would measure how fast somebody chose to watch rather than how well
 * they fought. Turns is the figure the game already records, already scores Trials on, and
 * already shows on a chapter's stage rows.
 *
 * The record is the one held **before** this run (`previousBest`), so the run that breaks
 * it can say so — a best read after the clear has already had this fight folded into it
 * and would print the same number twice.
 */
function Clock({ turns, best }: { turns: number; best: number | null }): JSX.Element | null {
  if (turns <= 0) return null;
  const record = best === null || turns < best;
  return (
    <p className={styles.clock}>
      <span>
        Turns <b>{turns}</b>
      </span>
      {best !== null && (
        <span>
          Best <b>{Math.min(best, turns)}</b>
        </span>
      )}
      {record && <span className={styles.record}>a new best</span>}
    </p>
  );
}

/**
 * What the fight paid, as one strip.
 *
 * Currencies, experience and items are one map because that is how content pays and how
 * every other screen in the game already draws a payout (`ui/Rewards`, with its icons and
 * its tooltips). Relics are beside it rather than in it: a relic is an instance rather than
 * a count, and "Relics found · 2" was the results screen telling a player to go and look in
 * the vault.
 */
function Spoils({
  rewards,
  relics,
}: {
  rewards: Readonly<Record<string, number>>;
  relics: readonly GearInstance[];
}): JSX.Element | null {
  if (Object.keys(rewards).length === 0 && relics.length === 0) return null;
  return (
    <section className={styles.spoils} aria-label="What the fight paid">
      <Rewards rewards={rewards} signed size="lg" className={styles.strip} />
      {relics.length > 0 && (
        <ul className={styles.relics}>
          {relics.map((relic) => (
            <li key={relic.id} className={styles.relic}>
              {/* The card the vault draws, compact: the set, the slot and the main stat,
                  with the whole piece under the tooltip. "Relics found · 2" was the results
                  screen telling a player to go and look somewhere else. */}
              <RelicCard relic={relic} compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Which of five results this was, and what each one has to say.
 *
 * Pure, and split out of the component, because it is the whole of the screen's reading:
 * an Arena fight, a Titan run, a sandbox, a loss and a win are five different reports about
 * the same shape of data, and having them in one place is what stops the sixth from being
 * written somewhere else.
 */
function buildReport(input: {
  arena: ArenaResult | null;
  titan: TitanRun | null;
  practice: boolean;
  won: boolean;
  outcome: string;
  rewards: BattleRewards | null;
}): {
  tone: 'victory' | 'defeat' | 'neutral';
  title: string;
  subtitle: string | null;
  stars: number | null;
  notes: Note[];
  spoils: Record<string, number>;
  relics: readonly GearInstance[];
  leave: string;
} {
  const { arena, titan, practice, won, outcome, rewards } = input;

  // The Arena pays in rating and medals and nothing else, and it pays on a loss too — so it
  // reads as its own result rather than as a silver line saying zero.
  if (arena) {
    const notes: Note[] = [
      {
        label: 'Rating',
        value: `${arena.ratingBefore} → ${arena.ratingAfter} (${arena.ratingDelta >= 0 ? '+' : ''}${arena.ratingDelta})`,
        best: arena.ratingDelta > 0,
      },
    ];
    if (arena.tierAfter !== arena.tierBefore) {
      notes.push({
        label: isPromotion(arena.tierBefore, arena.tierAfter) ? 'Promoted' : 'Slipped back',
        value: ARENA_TIER_LABELS[arena.tierAfter],
        best: isPromotion(arena.tierBefore, arena.tierAfter),
      });
    }
    return {
      tone: arena.won ? 'victory' : 'defeat',
      title: arena.won ? 'Victory' : 'Defeat',
      subtitle:
        !arena.won && outcome === 'retreat'
          ? // Walking out of the Arena is a loss, not an escape — the token was already spent.
            `${arena.opponent} — you walked out, and the token stays spent`
          : arena.won
            ? `You beat ${arena.opponent}`
            : `${arena.opponent} held`,
      stars: null,
      notes,
      spoils: arena.medals > 0 ? { valorMedals: arena.medals } : {},
      relics: [],
      leave: 'Back to the Arena',
    };
  }

  // A Titan run has no victory to report and does not need one. What it has is a number,
  // the rung that number reached, and whether it beat the last one — which is the whole
  // feedback loop of the mode and is worth more than "Defeat" in large letters.
  if (titan) {
    const notes: Note[] = [
      { label: 'Damage dealt', value: titan.damage.toLocaleString(), best: titan.personalBest },
    ];
    if (titan.previousBest > 0) {
      notes.push({
        label: titan.personalBest ? 'Previous best' : 'Your best',
        value: titan.previousBest.toLocaleString(),
      });
    }
    notes.push({ label: 'Keys left today', value: titan.keysLeft });
    return {
      // Neutral rather than defeat: nobody was supposed to win, and calling a good run a
      // loss is the screen arguing with the mode.
      tone: titan.personalBest ? 'victory' : 'neutral',
      title: titan.personalBest ? 'A new best' : 'Measured',
      subtitle: titan.tierName
        ? `${titan.damage.toLocaleString()} damage — ${titan.tierName}`
        : `${titan.damage.toLocaleString()} damage — not enough for the first rung yet`,
      stars: null,
      notes,
      spoils: positive(titan.rewards),
      relics: [],
      leave: 'Back to the Valewurm',
    };
  }

  if (practice) {
    return {
      tone: 'neutral',
      title: 'Practice',
      subtitle: 'No energy spent, nothing earned, nothing recorded — the stars are the answer',
      stars: won && rewards ? rewards.stars : null,
      notes: [],
      spoils: {},
      relics: [],
      leave: 'Back to the campaign',
    };
  }

  if (!won || !rewards) {
    return {
      tone: 'defeat',
      title: OUTCOME_TEXT[outcome] ?? 'The fight ended',
      subtitle:
        outcome === 'retreat'
          ? 'You pulled back. The energy stays spent — that is what makes retreating a decision'
          : 'No loot this time. Level a champion, or bring a wider team',
      stars: null,
      notes: [],
      spoils: {},
      relics: [],
      leave: 'Back to the campaign',
    };
  }

  const notes: Note[] = [];
  // The boost is named on the line it changed rather than left for a player to notice in an
  // arithmetic they cannot do: the figure in the strip is already the boosted one, so
  // without this a boosted fight and a lucky one look identical. `xpBoost` is the multiplier
  // the *server* actually paid at, which is why it is read from the result rather than from
  // the badge's clock — a fight that outlasted its own boost paid the plain figure, and
  // this line has to agree with the payout rather than with the timer.
  if (rewards.xpBoost > 1) {
    notes.push({
      label: 'Champion experience',
      value: `+${Math.round((rewards.xpBoost - 1) * 100)}% boost`,
      best: true,
    });
  }
  if (rewards.levelsGained > 0) {
    notes.push({ label: 'Levels gained', value: rewards.levelsGained, best: true });
  }
  // A fact with nothing to quantify is the label alone: "First clear · paid once" is a
  // value invented so the shape would have one.
  if (rewards.firstClear) {
    notes.push({ label: 'First clear', value: '', best: true });
  }
  if (rewards.beatPar) {
    // The sentence the whole mode exists for (C10d), and until now the results screen had
    // never said it — the par bonus arrived inside `bonus` and read as ordinary loot.
    notes.push({ label: 'Par beaten', value: '', best: true });
  }
  if (rewards.chestTiers.length > 0) {
    notes.push({
      label: 'Star chest claimed',
      value: `${rewards.chestTiers.join(' and ')} stars`,
      best: true,
    });
  }
  if (rewards.vaultOverflow.count > 0) {
    // Said out loud rather than left as a drop that quietly never arrived. A relic that
    // will not fit is sold for its worth, which is the kindest reading of a full vault —
    // but only if the player is told it happened.
    notes.push({
      label: `Vault full — ${rewards.vaultOverflow.count} sold on the road`,
      value: `+${rewards.vaultOverflow.silver.toLocaleString()}`,
    });
  }

  // One strip rather than four. The stage's pay, the day's first win, the first-clear bonus
  // and any star chest are all `{key: amount}` and all arrived in the same instant; which
  // of them a chip came from is what the notes above are for.
  const spoils = merge(
    { silver: rewards.silver, playerXp: rewards.playerXp, championXp: rewards.championXp },
    rewards.items,
    rewards.bonus,
    rewards.firstWin,
  );

  return {
    tone: 'victory',
    title: 'Victory',
    subtitle: null,
    stars: rewards.stars,
    notes,
    spoils,
    relics: rewards.gear,
    leave: 'Back to the campaign',
  };
}

/** Sums any number of reward maps into one, dropping anything that came to nothing. */
function merge(...maps: readonly Readonly<Record<string, number>>[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const map of maps) {
    for (const [key, amount] of Object.entries(map)) {
      total[key] = (total[key] ?? 0) + amount;
    }
  }
  return positive(total);
}

function positive(map: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(map).filter(([, amount]) => amount > 0));
}

/** Whether a tier change went up the ladder. Read off the canonical order, not the name. */
function isPromotion(before: ArenaTier, after: ArenaTier): boolean {
  return ARENA_TIERS.indexOf(after) > ARENA_TIERS.indexOf(before);
}
