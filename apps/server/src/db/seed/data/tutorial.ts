import type { Goal, RelicGrant, StageDefInput, TutorialStepDef } from '@mistvale/shared';

/**
 * The scripted opening (CONTENT_PLAN_EA01 §7, GAME_DESIGN §5).
 *
 * The Wardenmaster — a Hollowborn lantern-keeper who has been holding this stretch of the
 * Vale on his own for rather too long — walks a new warden from the first mist to the point
 * where the Valewarden's Path takes over. He does it by *pointing*: almost every step names
 * a screen and a thing on it, and the goal that closes the step is the same `{type, target,
 * filters}` a daily quest uses. Nothing here is a special case in the engine.
 *
 * **The shape of the script.** Open on a fight nobody earned — three borrowed starters
 * against an ambush, so the first ninety seconds answer "what is this game" — then hand
 * over one of the three and start again from nothing. After that: fight, be shown what the
 * fight gave you, fight again with it. Clear a stage → pull → equip → upgrade → clear the
 * next one. Every system is introduced immediately before it is needed, never more than one
 * at a time.
 *
 * **The levelling is deliberate, not incidental.** Features open on account level, and a
 * step that points at a locked screen is a step nobody can finish, so the XP paid here is
 * sized against `xpForNextLevel` to put the player over each gate *before* the step that
 * needs it:
 *
 * | after step | XP paid | needed | level | opens before          | which step needs it |
 * |------------|---------|--------|-------|-----------------------|---------------------|
 * | 3          | 120     | 120    | 2     | the login calendar    | — (a nicety)        |
 * | 5          | 290     | 257    | 3     | the forge             | 7, upgrade to +1    |
 * | 7          | 440     | 413    | 4     | quests and the Path   | 9, claim a quest    |
 * | 9          | 650     | 591    | 5     | the Bazaar            | 13, buy something   |
 *
 * (Step 1, the cold open, pays nothing — it is borrowed, and so is everything in it.)
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
 * The cold open is step 1 and `TUTORIAL_STAGES` below is the fight it points at — a
 * `tutorial`-mode stage carrying its own team, so nothing is minted into a roster that is
 * about to keep only one of the three.
 */

/**
 * The Wardenmaster's face, beside every line he says.
 *
 * One image for the whole script, but a field on each step rather than a constant, because
 * the speaker is a property of the line — the day a second voice is worth having it is an
 * edit in Admin and not a deploy. Published by `pnpm assets` from `assets/ui/misc_avatars/`;
 * if the file is not there the overlay draws the lantern mark it drew before there was art.
 */
const WARDENMASTER = 'portraits/wardenmaster_avatar.jpg';

/**
 * Where a step's spoken line lives, by step number.
 *
 * Convention rather than configuration: the owner's recordings are named for the step they
 * belong to, so the path is derivable and every step gets one. **Three of the fifteen have
 * no recording, and that is the design** — the client asks once, gets nothing, and the beat
 * is read instead of heard. Recording one later is dropping a file into
 * `assets/music_and_sounds/tutorial_sounds/` with the right number on it; nothing here
 * changes.
 */
const spoken = (number: number): string => `audio/tutorial/tutorial_step_${number}.mp3`;

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
  portrait: WARDENMASTER,
  sound: spoken(number),
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
    'tut_cold_open',
    'battle',
    '',
    'Something on the road',
    'A Sskarn ambush has held the Sunken Road for a week. I can hold three champions here — borrowed, and only for as long as this takes.\n\n**What to do:** win this fight. Everyone acts in turn order and the fast ones act more often. Pick a skill, then pick the enemy you want it to land on.',
    {
      goal: goal('stageClear', 1, { mode: 'tutorial', stageKey: 'tut_cold_open' }),
    },
  ),
  step(
    2,
    'tut_welcome',
    'haven',
    '',
    'The lantern in the fog',
    'You came out of the mist walking, which is more than most manage. I am the Wardenmaster — the last one, unless somebody is being quiet about it. This is the Haven: stone, dry, and nothing in the fog can cross the wards.\n\n**What to do:** press **Continue**. Then I will show you the Gate.',
    { rewards: { silver: 2_000, playerXp: 60 } },
  ),
  step(
    3,
    'tut_starter',
    'haven',
    'modal:starter-choice',
    'One of them stays',
    'Three answered the lantern, and the Gate has only enough left in it to keep **one** of them here. The other two can be found again later; this one is with you tonight.\n\n**What to do:** pick one of the three champions, then confirm the choice.',
    {
      goal: goal('championObtained', 1),
      rewards: { silver: 3_000, playerXp: 60 },
    },
  ),
  step(
    4,
    'tut_first_stage',
    'campaign',
    'stage:c01_s1_normal',
    'The Sunken Road',
    'The road east has not been walked in a year. Whatever moved onto it is weak, slow, and very surprised to see a warden.\n\n**What to do:** open stage **1-1** on the campaign map, send your champion in, and win. A march costs energy — it refills on its own, so spend it.',
    {
      goal: goal('stageClear', 1, { mode: 'campaign', stageKey: 'c01_s1_normal' }),
      rewards: { silver: 4_000, playerXp: 90 },
    },
  ),
  step(
    5,
    'tut_first_summon',
    'mistgate',
    'button:summon-faded',
    'The Mistgate',
    'Two Faded Sigils. I have been saving them and I am too old to use them well. The Gate takes a sigil and gives back whatever the mist still holds a shape for.\n\n**What to do:** at the Mistgate, choose the **Faded Sigil** and press **Summon ×1**.',
    {
      goal: goal('summon', 1, { poolKey: 'faded' }),
      grantsBefore: { sigil_faded: 2 },
      rewards: { silver: 3_000, playerXp: 80 },
    },
  ),
  step(
    6,
    'tut_equip',
    'relics',
    'panel:relic-list',
    'What the road gave up',
    'The dead out there were carrying things — old warden kit, mostly, and it still fits. I kept this one for whoever walked in next. This is the vault; everything you find lands here.\n\n**What to do:** a relic goes on from the champion, not from the shelf. Open **Champions**, choose one, and press an empty relic slot to fit the weapon. A champion wearing nothing fights at half of what they are.',
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
    7,
    'tut_upgrade',
    'relics',
    'button:relic-upgrade',
    'The forge',
    'Silver and a hot enough fire will wake a relic up a little further. It does not always take; no smith in the Vale has ever managed better.\n\n**What to do:** choose a relic in the vault and press **Forge** until it reaches **+1**. The silver for it is on me.',
    {
      goal: goal('gearLevel', 1),
      grantsBefore: { silver: 5_000 },
      rewards: { silver: 2_000, playerXp: 90 },
    },
  ),
  step(
    8,
    'tut_second_stage',
    'campaign',
    'stage:c01_s2_normal',
    'Further out',
    'Better armed than you were an hour ago. Go and prove it on the next stretch.\n\n**What to do:** clear campaign stage **1-2**. Watch what the relic changed — that difference is the whole lesson.',
    {
      goal: goal('stageClear', 1, { mode: 'campaign', stageKey: 'c01_s2_normal' }),
      rewards: { silver: 4_000, playerXp: 90 },
    },
  ),
  step(
    9,
    'tut_quests',
    'quests',
    'panel:quest-daily',
    'The day’s work',
    'A warden keeps a list. Not because anyone is checking, but because the fog takes back anything you leave for a week, and a list is how you notice.\n\n**What to do:** finish any one daily quest, then press **Claim** on it. A quest you leave unclaimed pays nothing.',
    {
      goal: goal('questClaim', 1),
      rewards: { silver: 3_000, crystals: 50, playerXp: 120 },
    },
  ),
  step(
    10,
    'tut_third_stage',
    'campaign',
    'stage:c01_s3_normal',
    'The turning',
    'Third stretch. The road bends north here and the ground gets worse — which is how you know you are getting somewhere.\n\n**What to do:** clear campaign stage **1-3**.',
    {
      goal: goal('stageClear', 1, { mode: 'campaign', stageKey: 'c01_s3_normal' }),
      rewards: { silver: 4_000, playerXp: 90 },
    },
  ),
  step(
    11,
    'tut_level_champion',
    'champions',
    'button:champion-level',
    'Feeding the fire',
    'The ones the Gate coughs up that are no use in a fight are still use to somebody who is. Feed them to a champion you mean to keep, and they hand over what they had.\n\n**What to do:** open a champion, press **Feed for experience**, choose the champions to spend, and take them up **three levels**.',
    {
      goal: goal('championLevelUp', 3),
      grantsBefore: { silver: 6_000 },
      rewards: { silver: 2_000, sigil_gleaming: 1, playerXp: 100 },
    },
  ),
  step(
    12,
    'tut_fourth_stage',
    'campaign',
    'stage:c01_s4_normal',
    'Sigil country',
    'Past the turning the mist starts leaving things behind — sigils, sometimes, if you are the first one down the road that week.\n\n**What to do:** clear campaign stage **1-4**.',
    {
      goal: goal('stageClear', 1, { mode: 'campaign', stageKey: 'c01_s4_normal' }),
      rewards: { silver: 4_000, playerXp: 100 },
    },
  ),
  step(
    13,
    'tut_bazaar',
    'bazaar',
    'panel:bazaar-offers',
    'The Bazaar',
    'Somebody always sets up in a Haven. This one restocks on her own schedule and will not tell me what it is.\n\n**What to do:** buy any one thing at the Bazaar. Silver you are holding is silver doing nothing, and the stock rotates whether you shopped or not.',
    {
      goal: goal('shopPurchase', 1, { shopKey: 'bazaar' }),
      grantsBefore: { silver: 4_000 },
      rewards: { silver: 3_000, crystals: 100, playerXp: 120 },
    },
  ),
  step(
    14,
    'tut_warlord',
    'campaign',
    'stage:c01_s7_normal',
    'The thing at the end of the road',
    'The road ends at a warlord. It always ends at a warlord. This one is **Vrash the Fenblade**, and the Sskarn have been following him through the treeline since the fog came in.\n\n**What to do:** clear your way to campaign stage **1-7** and put him down. Take a full team of four — he does not fight the way the road did.',
    {
      goal: goal('stageClear', 1, { mode: 'campaign', stageKey: 'c01_s7_normal' }),
      rewards: { silver: 8_000, crystals: 150, sigil_gleaming: 2, playerXp: 200 },
    },
  ),
  step(
    15,
    'tut_open_road',
    'haven',
    'dock:depths',
    'The Path from here',
    "That is everything I know how to teach standing still. There are keeps under the Vale — the **Depths** — and they stay shut until you are ready for them.\n\n**What to do:** press **Continue**. Then open **Missions** and start the Valewarden's Path: it runs from here to the far end of the Reclamation, and the last thing on it is not a relic.\n\nGo on. The lantern stays lit.",
    { rewards: { silver: 5_000, sigil_gleaming: 1, playerXp: 150 } },
  ),
];

// ── The cold open ───────────────────────────────────────────────────────────

/**
 * The first fight, borrowed (GAME_DESIGN §9.4).
 *
 * Three starters the account does not own, at a strength it will not reach for weeks,
 * against a Sskarn ambush on the Sunken Road. It exists to answer "what is this game" in
 * ninety seconds, and the answer is: a turn-based fight where positioning a team and
 * spending cooldowns decides it.
 *
 * **Fought with the stage's own team**, not the player's — that is what `presetTeam` is
 * for. Nothing is minted into the roster, so nothing has to be confiscated when the
 * Mistgate flickers a minute later and only one of the three stays.
 *
 * **The near-loss is authored, not scripted.** No outcome is forced anywhere in the
 * engine; the third wave is simply built to hurt — a Warcaller and a Brute five levels
 * above the two that came before — so a team this size wins it at low health. The relics
 * are rolled from the stage key rather than the battle seed, so the fight is the same one
 * for everybody and a beat tuned once stays tuned.
 *
 * It pays nothing, costs nothing and records no clear: `settle` treats `tutorial` the way
 * it treats `practice`, because there is nobody on the field for champion XP to land on.
 * The reward for it is the tutorial step that owns it.
 */
const ambush = (enemyKey: string, level: number, stars: number, slot: number) => ({
  enemyKey,
  level,
  stars,
  slot,
});

/** A borrowed champion's kit: one weapon, one cuirass, one pair of boots. */
const borrowedKit = (setKey: string): RelicGrant[] => [
  { setKey, slot: 'weapon', rank: 3, rarity: 'rare' },
  { setKey, slot: 'cuirass', rank: 3, rarity: 'rare' },
  { setKey, slot: 'boots', rank: 3, rarity: 'rare' },
];

export const TUTORIAL_STAGES: StageDefInput[] = [
  {
    key: 'tut_cold_open',
    sortOrder: 0,
    mode: 'tutorial',
    // Narratively and mechanically the first stretch of the Sunken Road. The campaign map
    // filters on `mode`, so naming chapter 1 as the parent groups it without listing it.
    parentKey: 'chapter_01',
    number: 1,
    difficulty: 'normal',
    energyCost: 0,
    waves: [
      [ambush('sskarn_skirmisher', 12, 3, 0), ambush('sskarn_spearguard', 12, 3, 1)],
      [
        ambush('sskarn_venomspitter', 18, 3, 0),
        ambush('sskarn_skirmisher', 18, 3, 1),
        ambush('sskarn_warcaller', 18, 3, 2),
      ],
      // The beat. Gorrakh the Broodtyrant is a chapter-3 warlord and has no business this
      // far west — which is the point of the scene, and the reason the road has been shut.
      // Two spitters flank him so the damage arrives from three directions at once.
      //
      // These three levels are **measured, not guessed**: `pnpm sim` fights this stage with
      // the borrowed team three thousand times and gates on both halves of the beat — that
      // it is never lost (3000/3000 at these numbers, and 35 is the highest that holds) and
      // that somebody is driven to about 57% health doing it. One notch harder and one
      // account in two thousand loses the opening fight of the game, which is not a risk
      // worth a slightly better story.
      [
        ambush('boss_gorrakh_broodtyrant', 35, 5, 0),
        ambush('sskarn_venomspitter', 31, 4, 1),
        ambush('sskarn_venomspitter', 31, 4, 2),
      ],
    ],
    // Nothing is paid for it; `settle` never reaches these. Present because the schema
    // requires a rewards block, and zeros say plainly what the mode already enforces.
    rewards: { silverMin: 0, silverMax: 0, playerXp: 0, championXp: 0 },
    starRules: { noDeaths: false, maxTurns: 60 },
    firstClearRewards: {},
    unlock: {},
    presetTeam: [
      { championKey: 'thordakk', level: 24, rank: 3, ascension: 1, relics: borrowedKit('reaver') },
      { championKey: 'anuria', level: 24, rank: 3, ascension: 1, relics: borrowedKit('swiftwind') },
      { championKey: 'maruan', level: 24, rank: 3, ascension: 1, relics: borrowedKit('ironroot') },
    ],
  },
];
