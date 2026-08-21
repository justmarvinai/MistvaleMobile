import type {
  CampaignChapterDef,
  GearSetDef,
  GearSlotDef,
  StageDef,
  StageStanding,
} from '@mistvale/shared';

/**
 * What a chapter page has to say about itself.
 *
 * The page is the campaign's second step since the rework — twelve chapters on a map, one
 * chapter's seven stages on a page of its own, then the team. All the arithmetic that page
 * needs is here: what a row says, what a chapter drops, and which chest is next. Pure and
 * separate because it is the part worth testing, and because "what does 1-4 drop" is a
 * question content answers rather than a component.
 */

/** Three stars on seven stages: what a chapter is worth on one difficulty. */
export const STARS_PER_CHAPTER_DIFFICULTY = 21;

export interface StageRow {
  stage: StageDef;
  /** `1-4`, the number a player says out loud. */
  label: string;
  stars: number;
  clears: number;
  bestTurns: number | null;
  open: boolean;
  /** Why it is shut, when it is. */
  lockedReason: string | null;
  /** The warlord's stage: the last one in the chapter. */
  boss: boolean;
  /** True for the first stage still short of three stars — where the player is. */
  next: boolean;
}

/**
 * The chapter's stages, in order, each with what the player has done to it.
 *
 * Defaults are deliberately hopeful: before the progress request lands, a map that shows
 * everything shut flickers the whole chapter closed and then open again. The server is the
 * authority either way — a stage drawn open that is not will be refused at the door.
 */
export function stageRows(
  chapter: CampaignChapterDef,
  stages: readonly StageDef[],
  standings: ReadonlyMap<string, StageStanding>,
): StageRow[] {
  const ordered = [...stages].sort((a, b) => a.number - b.number);
  const rows = ordered.map((stage, index) => {
    const standing = standings.get(stage.key);
    return {
      stage,
      label: `${chapter.number}-${stage.number}`,
      stars: standing?.stars ?? 0,
      clears: standing?.clears ?? 0,
      bestTurns: standing?.bestTurns ?? null,
      open: standing?.open ?? true,
      lockedReason: standing?.lockedReason ?? null,
      boss: index === ordered.length - 1,
      next: false,
    };
  });
  // Exactly one "you are here", and it is the first open stage not yet three-starred —
  // the same rule the map uses to pick which chapter to open on.
  const here = rows.find((row) => row.open && row.stars < 3);
  if (here) here.next = true;
  return rows;
}

export interface DropLine {
  /** The relic set the whole chapter farms, when content names one. */
  setName: string | null;
  /** Which slots this particular stage can drop, in content's order. */
  slotNames: string[];
  /** Roughly how often a piece falls, as a percentage. */
  gearChancePct: number;
}

/**
 * What farming this stage is *for*.
 *
 * The set comes from the chapter and the slot from the stage, which is the arrangement
 * that makes a chapter a farm for something specific rather than a lottery — and it is
 * the single most useful thing a stage row can say. The battle service rolls exactly
 * this: a stage that names its own sets wins, otherwise the chapter's one applies.
 */
export function dropLine(
  stage: StageDef,
  chapter: CampaignChapterDef,
  sets: readonly GearSetDef[],
  slots: readonly GearSlotDef[],
): DropLine {
  const band = stage.rewards.drops;
  const setKeys =
    band.gearSetKeys.length > 0 ? band.gearSetKeys : chapter.setKey ? [chapter.setKey] : [];
  const setNames = setKeys
    .map((key) => sets.find((entry) => entry.key === key)?.name)
    .filter((name): name is string => Boolean(name));
  const slotNames = band.gearSlots.map(
    (slot) => slots.find((entry) => entry.key === slot)?.name ?? titleCase(slot),
  );
  return {
    setName: setNames.length > 0 ? setNames.join(' · ') : null,
    slotNames,
    gearChancePct: Math.round(band.gearChance * 100),
  };
}

export interface ChestTier {
  stars: number;
  claimed: boolean;
}

/**
 * The chapter's star chests, and which of them are paid.
 *
 * Stars count across all three difficulties — that is what `parentStars` is — so the track
 * belongs to the chapter rather than to the difficulty being looked at.
 */
export function chestTiers(
  chapter: CampaignChapterDef,
  claimed: Record<string, number[]>,
): ChestTier[] {
  const paid = new Set(claimed[chapter.key] ?? []);
  return [...chapter.starRewards]
    .sort((a, b) => a.stars - b.stars)
    .map((tier) => ({ stars: tier.stars, claimed: paid.has(tier.stars) }));
}

/** The next chest tier a chapter still owes at this star count, or null once they are done. */
export function nextChest(
  chapter: CampaignChapterDef,
  stars: number,
  claimed: Record<string, number[]>,
): ChestTier | null {
  return chestTiers(chapter, claimed).find((tier) => !tier.claimed && tier.stars > stars) ?? null;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
