/**
 * The Mistvale icon map — the single source of truth for every icon the client ships.
 *
 * Hard rule (CLAUDE.md): icons come **only** from game-icons.net (CC BY 3.0), never invented.
 * Every `name` below is the basename of a real `.svg` in the `game-icons/icons` GitHub mirror
 * and has been verified to exist; adding a name that does not exist fails the fetch with a
 * non-zero exit, so this file cannot drift into fiction.
 *
 * Sources for the selection:
 *  - `docs/UI_UX_DESIGN.md` §6 — currencies, stats, elements, gear slots, navigation (verbatim)
 *  - `docs/COMBAT_SYSTEM.md` §7 — the 28 shipped statuses (13 buffs + 15 debuffs) and the
 *    instants that need a chip in skill tooltips and the battle log
 *
 * Adding an icon: append an entry here and re-run `pnpm --filter @mistvale/icon-fetch icons`.
 * No other file needs to change — the sprite, the manifest and ATTRIBUTION.md are generated.
 */

/** Which part of the UI an icon belongs to. Drives grouping in the manifest and Credits screen. */
export type IconGroup =
  'currency' | 'stat' | 'element' | 'gear' | 'nav' | 'buff' | 'debuff' | 'instant' | 'portrait';

export interface IconSpec {
  /** Section of the UI this icon serves. */
  readonly group: IconGroup;
  /** Icon basename in the game-icons set, e.g. `two-coins` → `<author>/two-coins.svg`. */
  readonly name: string;
  /** What it means in Mistvale. Shown in the generated attribution table; keeps review honest. */
  readonly use: string;
  /**
   * Author folder pin. Required only when several authors publish an icon under the same name —
   * the resolver refuses to guess. Leave it out and the repo index resolves the folder.
   */
  readonly author?: string;
}

export const ICON_GROUP_LABELS: Readonly<Record<IconGroup, string>> = {
  currency: 'Currencies & resources',
  stat: 'Stats',
  element: 'Elements',
  gear: 'Gear slots',
  nav: 'Navigation & systems',
  buff: 'Buffs',
  debuff: 'Debuffs',
  instant: 'Instants',
  portrait: 'Portraits & placeholders',
};

export const ICONS = {
  // ── Currencies & resources — UI_UX_DESIGN §6, top bar + reward chips ──────────────────
  silver: { group: 'currency', name: 'two-coins', use: 'Silver (soft currency)' },
  crystals: { group: 'currency', name: 'cut-diamond', use: 'Crystals (hard currency)' },
  energy: { group: 'currency', name: 'lightning-arc', use: 'Energy' },
  medals: { group: 'currency', name: 'laurels-trophy', use: 'Valor Medals (Arena)' },
  sigils: { group: 'currency', name: 'rune-stone', use: 'Summon sigils (tinted per sigil)' },
  essences: { group: 'currency', name: 'potion-ball', use: 'Ascension essences' },
  tomes: { group: 'currency', name: 'book-cover', use: 'Skill tomes', author: 'delapouite' },
  emblems: { group: 'currency', name: 'rank-3', use: 'Mastery emblems (Bronze/Silver/Gold tint)' },

  // ── Stats — UI_UX_DESIGN §6 / COMBAT_SYSTEM §1 ───────────────────────────────────────
  'stat-hp': { group: 'stat', name: 'health-normal', use: 'HP' },
  'stat-atk': { group: 'stat', name: 'broadsword', use: 'ATK' },
  'stat-def': { group: 'stat', name: 'shield', use: 'DEF', author: 'sbed' },
  'stat-spd': { group: 'stat', name: 'wingfoot', use: 'SPD' },
  'stat-crate': { group: 'stat', name: 'on-target', use: 'C.RATE (critical rate)' },
  'stat-cdmg': { group: 'stat', name: 'explosion-rays', use: 'C.DMG (critical damage)' },
  'stat-res': { group: 'stat', name: 'magic-shield', use: 'RES (resistance)' },
  'stat-acc': { group: 'stat', name: 'bullseye', use: 'ACC (accuracy)' },

  // ── Elements — UI_UX_DESIGN §6, affinity rings and the element wheel ─────────────────
  'element-ember': { group: 'element', name: 'small-fire', use: 'Ember affinity' },
  'element-tide': { group: 'element', name: 'waves', use: 'Tide affinity' },
  'element-verdant': { group: 'element', name: 'oak-leaf', use: 'Verdant affinity' },
  'element-mist': { group: 'element', name: 'fog', use: 'Mist affinity' },

  // ── Gear slots — UI_UX_DESIGN §6, the 9 relic slots on the champion sheet ────────────
  'gear-weapon': { group: 'gear', name: 'crossed-swords', use: 'Weapon slot' },
  'gear-helmet': { group: 'gear', name: 'visored-helm', use: 'Helmet slot' },
  'gear-shield': { group: 'gear', name: 'round-shield', use: 'Shield slot' },
  'gear-gauntlets': { group: 'gear', name: 'gauntlet', use: 'Gauntlets slot' },
  'gear-chest': { group: 'gear', name: 'breastplate', use: 'Chest slot' },
  'gear-boots': { group: 'gear', name: 'boots', use: 'Boots slot' },
  'gear-ring': { group: 'gear', name: 'ring', use: 'Ring slot' },
  'gear-amulet': { group: 'gear', name: 'gem-pendant', use: 'Amulet slot' },
  'gear-banner': { group: 'gear', name: 'flying-flag', use: 'Banner slot' },

  // ── Navigation & systems — UI_UX_DESIGN §6, bottom dock + Haven stations ────────────
  'nav-haven': { group: 'nav', name: 'castle', use: 'Haven (home)', author: 'delapouite' },
  'nav-campaign': { group: 'nav', name: 'treasure-map', use: 'Campaign' },
  'nav-depths': { group: 'nav', name: 'cave-entrance', use: 'The Depths' },
  'nav-arena': { group: 'nav', name: 'crossed-sabres', use: 'Arena' },
  'nav-titan': { group: 'nav', name: 'sea-serpent', use: 'The Titan' },
  'nav-mistgate': { group: 'nav', name: 'portal', use: 'Mistgate (summoning)' },
  'nav-bazaar': { group: 'nav', name: 'shop', use: 'Bazaar' },
  'nav-quests': { group: 'nav', name: 'scroll-quill', use: 'Quests' },
  'nav-missions': { group: 'nav', name: 'stairs-goal', use: "Missions (Valewarden's Path)" },
  'nav-events': { group: 'nav', name: 'party-popper', use: 'Events' },
  'nav-mail': { group: 'nav', name: 'envelope', use: 'Mail' },
  'nav-settings': { group: 'nav', name: 'cog', use: 'Settings', author: 'lorc' },
  'nav-locked': { group: 'nav', name: 'padlock', use: 'Locked feature / locked champion' },
  // The four the dock needed and the set did not have. Every screen in `app/screens.ts`
  // now names an icon rather than a Unicode glyph — the file's own comment had said
  // "until the game-icons sprite sheet is wired in" since P0.
  'nav-champions': {
    group: 'nav',
    name: 'rally-the-troops',
    use: 'Champions (roster)',
    author: 'lorc',
  },
  'nav-relics': { group: 'nav', name: 'gem-chain', use: 'Relics (gear vault)', author: 'lorc' },
  'nav-calendar': { group: 'nav', name: 'calendar', use: 'Login calendar', author: 'delapouite' },
  'nav-battle': {
    group: 'nav',
    name: 'crossed-swords',
    use: 'Battle (in progress)',
    author: 'lorc',
  },
  'nav-chronicle': { group: 'nav', name: 'open-book', use: 'Chronicle (collection)' },
  'nav-valor': { group: 'nav', name: 'stone-stack', use: 'Hall of Valor' },
  'nav-trials': { group: 'nav', name: 'maze', use: 'Trials' },
  'nav-worldboss': { group: 'nav', name: 'rally-the-troops', use: 'The world boss' },
  'nav-deeprun': { group: 'nav', name: 'stairs-cake', use: 'The Deep Run' },
  'nav-spire': { group: 'nav', name: 'tower-fall', use: 'The Mistspire' },

  // ── Portraits — stand-ins for art that does not exist yet ─────────────────────────────
  //
  // Thirty of the thirty-seven champions are art-pending and share one placeholder asset,
  // and that asset has no avatar file. Until P11 every one of them drew the browser's
  // broken-image glyph on the roster, in the Chronicle and — worst of all — on the card a
  // Mistgate pull turns over. A hooded silhouette says "a warden you have not met yet",
  // which is the truth, and it is the same shape whether the art lands next week or never.
  'portrait-unknown': {
    group: 'portrait',
    name: 'hood',
    use: 'Champion whose portrait has not been drawn yet',
    author: 'lorc',
  },

  // ── Buffs — COMBAT_SYSTEM §7, the 13 shipped buffs (16px chips on unit frames) ───────
  'buff-atk-up': { group: 'buff', name: 'sword-brandish', use: 'ATK Up 25/50%' },
  'buff-def-up': { group: 'buff', name: 'armor-upgrade', use: 'DEF Up 30/60%' },
  'buff-spd-up': { group: 'buff', name: 'sprint', use: 'SPD Up 15/30%' },
  'buff-crate-up': { group: 'buff', name: 'target-arrows', use: 'C.RATE Up 15/30%' },
  'buff-strengthen': { group: 'buff', name: 'metal-scales', use: 'Strengthen 15/25%' },
  'buff-shield': { group: 'buff', name: 'temporary-shield', use: 'Shield (absorbs damage)' },
  'buff-continuous-heal': { group: 'buff', name: 'healing', use: 'Continuous Heal 7.5/15%' },
  'buff-counterattack': { group: 'buff', name: 'sword-clash', use: 'Counterattack (A1 75%)' },
  'buff-ally-protection': { group: 'buff', name: 'surrounded-shield', use: 'Ally Protection' },
  'buff-block-debuffs': { group: 'buff', name: 'checked-shield', use: 'Block Debuffs' },
  'buff-reflect': { group: 'buff', name: 'shield-reflect', use: 'Reflect 15/30%' },
  'buff-vampiric': { group: 'buff', name: 'life-tap', use: 'Vampiric 25% (self lifesteal)' },
  'buff-unkillable': { group: 'buff', name: 'heart-shield', use: 'Unkillable (HP floors at 1)' },

  // ── Debuffs — COMBAT_SYSTEM §7, the 15 shipped debuffs ──────────────────────────────
  'debuff-atk-down': { group: 'debuff', name: 'sword-break', use: 'ATK Down 25/50%' },
  'debuff-def-down': { group: 'debuff', name: 'armor-downgrade', use: 'DEF Down 30/60%' },
  'debuff-spd-down': { group: 'debuff', name: 'snail', use: 'SPD Down 15/30%' },
  'debuff-crate-down': { group: 'debuff', name: 'broken-arrow', use: 'C.RATE Down 15/30%' },
  'debuff-acc-down': { group: 'debuff', name: 'sight-disabled', use: 'ACC Down 25/50 flat' },
  'debuff-weaken': { group: 'debuff', name: 'cracked-shield', use: 'Weaken 15/25%' },
  'debuff-poison': { group: 'debuff', name: 'poison', use: 'Poison 2.5/5% (stacking DoT)' },
  'debuff-hp-burn': { group: 'debuff', name: 'flame', use: 'HP Burn 3% (splashes to allies)' },
  'debuff-heal-reduction': { group: 'debuff', name: 'broken-heart', use: 'Heal Reduction 50/100%' },
  'debuff-leech': { group: 'debuff', name: 'leeching-worm', use: 'Leech (attackers heal)' },
  'debuff-stun': { group: 'debuff', name: 'knocked-out-stars', use: 'Stun' },
  'debuff-freeze': { group: 'debuff', name: 'frozen-block', use: 'Freeze (Stun, Tide-flavored)' },
  'debuff-sleep': { group: 'debuff', name: 'night-sleep', use: 'Sleep (breaks on damage)' },
  'debuff-provoke': { group: 'debuff', name: 'enrage', use: 'Provoke (forced A1 at the provoker)' },
  'debuff-block-buffs': { group: 'debuff', name: 'slashed-shield', use: 'Block Buffs' },

  // ── Instants — COMBAT_SYSTEM §7; no duration, but they need chips in skill tooltips,
  //    the battle log and the Admin skill composer's component picker ────────────────────
  'instant-heal': { group: 'instant', name: 'health-increase', use: 'Instant heal' },
  'instant-tm-up': { group: 'instant', name: 'fast-forward-button', use: 'Turn meter boost' },
  'instant-tm-down': { group: 'instant', name: 'fast-backward-button', use: 'Turn meter deplete' },
  'instant-cleanse': { group: 'instant', name: 'sparkles', use: 'Cleanse (remove debuffs)' },
  'instant-dispel': { group: 'instant', name: 'magic-swirl', use: 'Dispel / steal buffs' },
  'instant-extra-turn': { group: 'instant', name: 'extra-time', use: 'Extra turn' },
  'instant-cooldown': { group: 'instant', name: 'hourglass', use: 'Cooldown increase / decrease' },
  'instant-revive': { group: 'instant', name: 'holy-symbol', use: 'Revive (reserved for EA)' },
} as const satisfies Readonly<Record<string, IconSpec>>;

/** Every semantic icon key the client may reference. */
export type IconKey = keyof typeof ICONS;

/** Stable iteration order: exactly the declaration order above. */
export const ICON_KEYS: readonly IconKey[] = Object.keys(ICONS) as IconKey[];

/** The `<symbol>` id an icon gets inside the generated sprite. */
export function symbolIdFor(key: IconKey): string {
  return `mv-${key}`;
}

export function isIconKey(value: string): value is IconKey {
  return Object.prototype.hasOwnProperty.call(ICONS, value);
}

export function specFor(key: IconKey): IconSpec {
  return ICONS[key];
}
