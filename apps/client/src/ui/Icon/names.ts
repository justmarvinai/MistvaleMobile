/**
 * Every icon the client may ask for.
 *
 * A hand-written mirror of what `tools/icon-fetch` publishes, and deliberately so: the
 * generated manifest is a build artifact that does not exist until the build runs, and a
 * type that only exists after a build is a type `pnpm typecheck` cannot use.
 *
 * `names.test.ts` fails if this list and the generated set ever disagree, which turns a
 * renamed or dropped icon into a red test rather than an empty square nobody notices.
 */
export const ICON_NAMES = [
  // currency
  'crystals',
  'emblems',
  'energy',
  'essences',
  'medals',
  'sigils',
  'silver',
  'tomes',
  // stat
  'stat-acc',
  'stat-atk',
  'stat-cdmg',
  'stat-crate',
  'stat-def',
  'stat-hp',
  'stat-res',
  'stat-spd',
  // element
  'element-ember',
  'element-mist',
  'element-tide',
  'element-verdant',
  // gear
  'gear-amulet',
  'gear-banner',
  'gear-boots',
  'gear-chest',
  'gear-gauntlets',
  'gear-helmet',
  'gear-ring',
  'gear-shield',
  'gear-weapon',
  // nav
  'nav-arena',
  'nav-battle',
  'nav-bazaar',
  'nav-calendar',
  'nav-campaign',
  'nav-champions',
  'nav-chronicle',
  'nav-depths',
  'nav-events',
  'nav-haven',
  'nav-locked',
  'nav-mail',
  'nav-missions',
  'nav-mistgate',
  'nav-quests',
  'nav-relics',
  'nav-settings',
  'nav-titan',
  'nav-valor',
  // buff
  'buff-ally-protection',
  'buff-atk-up',
  'buff-block-debuffs',
  'buff-continuous-heal',
  'buff-counterattack',
  'buff-crate-up',
  'buff-def-up',
  'buff-reflect',
  'buff-shield',
  'buff-spd-up',
  'buff-strengthen',
  'buff-unkillable',
  'buff-vampiric',
  // debuff
  'debuff-acc-down',
  'debuff-atk-down',
  'debuff-block-buffs',
  'debuff-crate-down',
  'debuff-def-down',
  'debuff-freeze',
  'debuff-heal-reduction',
  'debuff-hp-burn',
  'debuff-leech',
  'debuff-poison',
  'debuff-provoke',
  'debuff-sleep',
  'debuff-spd-down',
  'debuff-stun',
  'debuff-weaken',
  // instant
  'instant-cleanse',
  'instant-cooldown',
  'instant-dispel',
  'instant-extra-turn',
  'instant-heal',
  'instant-revive',
  'instant-tm-down',
  'instant-tm-up',
  // portrait
  'portrait-unknown',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
