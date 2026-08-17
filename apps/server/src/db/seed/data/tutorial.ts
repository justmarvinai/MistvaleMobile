import type { Goal, RelicGrant, TutorialStepDef } from '@mistvale/shared';

/**
 * The scripted opening (CONTENT_PLAN_EA01 §7, GAME_DESIGN §5).
 *
 * The Wardenmaster — a Hollowborn lantern-keeper who has been holding this stretch of the
 * Vale on his own for rather too long — walks a new warden from the first mist to the point
 * where the Valewarden's Path takes over. He does it by *pointing*: almost every step names
 * a screen and a thing on it, and the goal that closes the step is the same `{type, target,
 * filters}` a daily quest uses. Nothing here is a special case in the engine.
 *
 * **The shape of the script.** Fight, then be shown what the fight gave you, then fight
 * again with it. Clear a stage → pull → equip → upgrade → clear the next one. Every system
 * is introduced immediately before it is needed and never more than one at a time.
 *
 * **The levelling is deliberate, not incidental.** Features open on account level, and a
 * step that points at a locked screen is a step nobody can finish, so the XP paid here is
 * sized against `xpForNextLevel` to put the player over each gate *before* the step that
 * needs it:
 *
 * | after step | XP paid | needed | level | opens before          | which step needs it |
 * |------------|---------|--------|-------|-----------------------|---------------------|
 * | 2          | 120     | 120    | 2     | the login calendar    | — (a nicety)        |
 * | 4          | 290     | 257    | 3     | the forge             | 6, upgrade to +1    |
 * | 6          | 440     | 413    | 4     | quests and the Path   | 8, claim a quest    |
 * | 8          | 650     | 591    | 5     | the Bazaar            | 12, buy something   |
 *
 * Campaign clears add their own XP on top, so every margin above is a floor rather than an
 * estimate. If `xpForNextLevel` is retuned, this table is what to re-check — and it is
 * content, so re-cutting it is a draft and a publish rather than a deploy.
 *
 * **Total payout** is about three days of faucets: 51k silver in rewards plus 15k handed
 * over for the steps that spend it, 300 crystals, two Faded and four Gleaming sigils, and
 * one Ironroot weapon so the equip step is never pointing at an empty bag. That is the
 * "generous opening" ECONOMY §11 asks for, and it is all ordinary fields — an operator can
 * halve it in the editor without touching this file.
 *
 * The cold-open battle that GAME_DESIGN §5 opens on — all three starters, borrowed, one
 * scripted near-loss — is a battle mode rather than a script step, and lands with the rest
 * of P9. It becomes step 1 when it does; everything here shifts up by one and no player
 * state has to move, because progress is stored as a position rather than as a key.
 */

const step = (
  number: number,
  key: string,
  screen: string,
  highlight: string,
  title: string,
  body: string,
  options: {
    goal?: Goal;
    rewards?: Record<string, number>;
    grantsBefore?: Record<string, number>;
    grantsRelics?: RelicGrant[];
  } = {},
): TutorialStepDef => ({
  key,
  step: number,
  screen,
  highlight,
  title,
  body,
  ...(options.goal ? { goal: options.goal } : {}),
  rewards: options.rewards ?? {},
  grantsBefore: options.grantsBefore ?? {},
  grantsRelics: options.grantsRelics ?? [],
  active: true,
  sortOrder: number,
});

const goal = (type: Goal['type'], target: number, filters: Goal['filters'] = {}): Goal => ({
  type,
  target,
  filters,
});

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  step(
    1,
    'tut_welcome',
    'haven',
    '',
    'The lantern in the fog',
    'You came out of the mist walking, which is more than most manage. I am the Wardenmaster — the last one, unless somebody is being quiet about it.\n\nThis is the Haven. It is stone, it is dry, and nothing that lives in the fog can cross the wards. Everything else out there is yours to take back.',
    { rewards: { silver: 2_000, playerXp: 60 } },
  ),
  step(
    2,
    'tut_starter',
    'haven',
    'modal:starter-choice',
    'One of them stays',
    'Three answered the lantern. The Gate has only enough left in it to hold **one** of them here — choose, and choose for yourself, because the other two can still be found later and this one will be with you tonight.',
    {
      goal: goal('championObtained', 1),
      rewards: { silver: 3_000, playerXp: 60 },
    },
  ),
  step(
    3,
    'tut_first_stage',
    'campaign',
    'stage:c01_s1_normal',
    'The Sunken Road',
    'The road east of here has not been walked in a year. Whatever has moved onto it is weak, slow, and very surprised to see a warden.\n\nGo and take the first stretch of it back. Energy is what a march costs; it comes back on its own, so spend it.',
    {
      goal: goal('stageClear', 1, { mode: 'campaign', stageKey: 'c01_s1_normal' }),
      rewards: { silver: 4_000, playerXp: 90 },
    },
  ),
  step(
    4,
    'tut_first_summon',
    'mistgate',
    'button:summon-faded',
    'The Mistgate',
    'Here. Two sigils — I have been saving them and I am too old to use them well.\n\nThe Gate takes a sigil and gives back whatever the mist still holds a shape for. A faded one calls the least of it, but the least of it is a second pair of hands, and you have one pair.',
    {
      goal: goal('summon', 1, { poolKey: 'faded' }),
      grantsBefore: { sigil_faded: 2 },
      rewards: { silver: 3_000, playerXp: 80 },
    },
  ),
  step(
    5,
    'tut_equip',
    'relics',
    'panel:relic-list',
    'What the road gave up',
    'The dead out there were carrying things, and I have been keeping this one for whoever walked in next. Relics — old warden kit, mostly, and it still fits.\n\nPut it on somebody. A champion wearing nothing is a champion fighting at half of what they are.',
    {
      goal: goal('gearEquip', 1),
      // Given rather than dropped: chapter 1's trash stages hand over a relic about two
      // runs in five, so four new wardens in ten would arrive at this step with an empty
      // bag. Ironroot is the set chapter 1 drops, so the piece is the start of a set the
      // player can finish on the road they are already walking.
      grantsRelics: [{ setKey: 'ironroot', slot: 'weapon', rank: 2, rarity: 'uncommon' }],
      rewards: { silver: 4_000, playerXp: 60 },
    },
  ),
  step(
    6,
    'tut_upgrade',
    'relics',
    'button:relic-upgrade',
    'The forge',
    'Silver and a hot enough fire will wake a relic up a little further. It does not always take — that is the nature of the thing, and no smith in the Vale has ever managed better.\n\nTake one piece to **+1**. Here is the silver for it; after this you will be finding your own.',
    {
      goal: goal('gearLevel', 1),
      grantsBefore: { silver: 5_000 },
      rewards: { silver: 2_000, playerXp: 90 },
    },
  ),
  step(
    7,
    'tut_second_stage',
    'campaign',
    'stage:c01_s2_normal',
    'Further out',
    'Better armed than you were an hour ago. Go and prove it on the next stretch — and watch what the relics do, because the difference is the whole lesson.',
    {
      goal: goal('stageClear', 1, { mode: 'campaign', stageKey: 'c01_s2_normal' }),
      rewards: { silver: 4_000, playerXp: 90 },
    },
  ),
  step(
    8,
    'tut_quests',
    'quests',
    'panel:quest-daily',
    'The day’s work',
    'A warden keeps a list. Not because anyone is checking — because the fog takes back anything you leave for a week, and a list is how you notice.\n\nThese refresh every morning. Finish one and **claim** it; the ones you leave unclaimed pay nothing.',
    {
      goal: goal('questClaim', 1),
      rewards: { silver: 3_000, crystals: 50, playerXp: 120 },
    },
  ),
  step(
    9,
    'tut_third_stage',
    'campaign',
    'stage:c01_s3_normal',
    'The turning',
    'Third stretch. The road bends north here and the ground gets worse — which is how you know you are getting somewhere.',
    {
      goal: goal('stageClear', 1, { mode: 'campaign', stageKey: 'c01_s3_normal' }),
      rewards: { silver: 4_000, playerXp: 90 },
    },
  ),
  step(
    10,
    'tut_level_champion',
    'champions',
    'button:champion-level',
    'Feeding the fire',
    'The ones the Gate coughs up that are no use in a fight are still use to somebody who is. Feed them to a champion you mean to keep and they hand over what they had.\n\nTake somebody up **three levels**. Rank is the other axis — that costs champions of the same rank, and it is what raises the ceiling rather than the number.',
    {
      goal: goal('championLevelUp', 3),
      grantsBefore: { silver: 6_000 },
      rewards: { silver: 2_000, sigil_gleaming: 1, playerXp: 100 },
    },
  ),
  step(
    11,
    'tut_fourth_stage',
    'campaign',
    'stage:c01_s4_normal',
    'Sigil country',
    'Past the turning the mist starts leaving things behind — sigils, sometimes, if you are the first one down the road that week.',
    {
      goal: goal('stageClear', 1, { mode: 'campaign', stageKey: 'c01_s4_normal' }),
      rewards: { silver: 4_000, playerXp: 100 },
    },
  ),
  step(
    12,
    'tut_bazaar',
    'bazaar',
    'panel:bazaar-offers',
    'The Bazaar',
    'Somebody always sets up in a Haven, and this one restocks on her own schedule and will not tell me what it is.\n\nBuy something. Silver you are holding is silver doing nothing, and the stock rotates whether you shopped or not.',
    {
      goal: goal('shopPurchase', 1, { shopKey: 'bazaar' }),
      grantsBefore: { silver: 4_000 },
      rewards: { silver: 3_000, crystals: 100, playerXp: 120 },
    },
  ),
  step(
    13,
    'tut_warlord',
    'campaign',
    'stage:c01_s7_normal',
    'The thing at the end of the road',
    'The road ends at a warlord. It always ends at a warlord.\n\nThis one is **Vrash the Fenblade**, and the Sskarn have been following him through the treeline since the fog came in. Clear your way to the seventh stretch and put him down — take a full team, because he does not fight the way the road did.',
    {
      goal: goal('stageClear', 1, { mode: 'campaign', stageKey: 'c01_s7_normal' }),
      rewards: { silver: 8_000, crystals: 150, sigil_gleaming: 2, playerXp: 200 },
    },
  ),
  step(
    14,
    'tut_open_road',
    'haven',
    'dock:depths',
    'The Path from here',
    'That is everything I know how to teach standing still.\n\nThere are keeps under the Vale — the **Depths** — and they are shut to you until you are ready, which the fog will tell you about before I do. Until then the **Path** is the list that matters: it runs from here to the far end of the Reclamation, and the last thing on it is not a relic.\n\nGo on. The lantern stays lit.',
    { rewards: { silver: 5_000, sigil_gleaming: 1, playerXp: 150 } },
  ),
];
