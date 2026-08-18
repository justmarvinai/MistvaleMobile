/**
 * The FantasyUIs components Mistvale ships.
 *
 * Named rather than "all 120", because every one carries a stylesheet and some carry art:
 * a library vendored wholesale would put a Minimap, a ChatPanel and a CraftingPanel into a
 * game that has none of those things, and the §9 budgets are measured on a one-core box.
 *
 * The vendor step resolves each of these through the library's own `/r/<Name>.json`
 * record and copies the `copy` list, which is the transitive closure of real import
 * statements — so a component that grows a dependency upstream brings it along on the next
 * `pnpm fui:vendor` without anybody maintaining this list for it.
 *
 * Grouped by what they are for in Mistvale, so the next person can tell at a glance why
 * each one is here.
 */
export const FUI_COMPONENTS: readonly string[] = [
  // ── The kit every screen is built from ────────────────────────────────────
  'Panel',
  'Button',
  'Modal',
  'Toast',
  'Tooltip',
  'Divider',
  'Frame',
  'TintFrame',
  'Banner',
  'Icon',
  'Glyph',
  'Slot',
  'StatBar',
  'StatChip',
  'ProgressRing',
  'Badge',
  'EmptyState',

  // ── The shell: top bar, dock, HUD zones ───────────────────────────────────
  'TopBar',
  'CurrencyBar',
  'EnergyBar',
  'BottomNav',
  'SideNav',
  'HUD',
  'Tabs',
  'SegmentedControl',
  'FilterBar',
  'SortBar',
  'Select',
  'Slider',
  'Toggle',
  'TextInput',
  'NumberStepper',
  'Accordion',
  'LoadingScreen',
  'MainMenu',
  'SettingsScreen',

  // ── Champions and the collection ──────────────────────────────────────────
  'Portrait',
  'ChampionCard',
  'ChampionList',
  'StarRating',
  'AffinityBadge',
  'PowerRating',
  'CharacterSelect',
  'SkillCard',
  'SkillTree',
  'MasteryGrid',
  'StatRadar',
  'StatsPanel',
  'CompareStats',
  'CollectionProgress',
  'CodexEntry',

  // ── Battle ────────────────────────────────────────────────────────────────
  'UnitFrame',
  'PartyFrame',
  'TeamSlots',
  'FormationGrid',
  'TurnMeter',
  'BattleControls',
  'BattleLog',
  'BuffBar',
  'FloatingText',
  'WaveTracker',
  'BossHealthBar',
  'ShieldBar',
  'ResultScreen',
  'LevelUpModal',

  // ── Relics, the forge and the shops ───────────────────────────────────────
  'InventoryGrid',
  'ItemCard',
  'ArtifactCard',
  'ArtifactSet',
  'Paperdoll',
  'UpgradePanel',
  'RankUpPanel',
  'ShopPanel',
  'OfferCard',
  'LootWindow',
  'RewardPopup',

  // ── The Mistgate ──────────────────────────────────────────────────────────
  'SummonResult',
  'PityCounter',
  'BannerCarousel',

  // ── The world and what it owes you ────────────────────────────────────────
  'StageSelect',
  'WorldMap',
  'QuestLog',
  'QuestTracker',
  'RewardTrack',
  'DailyRewards',
  'StreakMeter',
  'EventBanner',
  'CountdownTimer',
  'MailInbox',
  'AchievementList',
  'Ticker',

  // ── The Arena ─────────────────────────────────────────────────────────────
  'ArenaMatchup',
  'TierBadge',
  'Leaderboard',
  'LeaderboardPodium',
  'MatchHistory',

  // ── The tutorial, and the things that say no ──────────────────────────────
  'TutorialTip',
  'ConfirmSlider',
  'ContextMenu',
];

/**
 * Art packs vendored into `public/fui/`.
 *
 * `stone-vine` is the library's other theme and Mistvale does not use it — 3.4 MB of
 * painted stone for a game that chose ember. Left out on purpose; adding it back is one
 * line here and a re-vendor.
 */
export const FUI_PACKS: readonly string[] = [
  'dark-ember', // the theme Mistvale's own theme derives from
  'deco-frames', // 141 ornament frames and dividers, tinted per use
  'line-glyphs', // 41 monochrome SVGs used as CSS masks
  'spell-icons', // 236 painted icons — skills, relics, statuses
];
