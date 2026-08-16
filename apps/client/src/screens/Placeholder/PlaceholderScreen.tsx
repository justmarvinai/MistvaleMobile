import { Panel } from '@/ui/Panel/Panel';
import { useContentStore } from '@/state/contentStore';
import type { ScreenDefinition } from '@/app/screens';
import styles from './PlaceholderScreen.module.scss';

/**
 * The "coming in a later phase" screen.
 *
 * Every destination in the dock resolves to a real screen from day one, so navigation is
 * never a dead end. Each states which phase builds it, which doubles as an in-app
 * roadmap during early access.
 *
 * Where content already exists for a system, the screen reports it from the live bundle
 * — so a publish is visible here immediately, without a redeploy.
 */

const PHASE_NOTES: Record<string, { phase: string; blurb: string }> = {
  campaign: {
    phase: 'Phase P3',
    blurb:
      'Twelve chapters across three difficulties, three-wave battles, and the star ratings that gate the chapter chests.',
  },
  depths: {
    phase: 'Phase P6',
    blurb:
      'Four relic dungeons, the Proving Grounds, and the Essence Springs on their weekday rotation.',
  },
  arena: {
    phase: 'Phase P7',
    blurb:
      'Asynchronous four-versus-four against other wardens’ defence teams, with the Hall of Valor behind it.',
  },
  champions: {
    phase: 'Phase P4',
    blurb:
      'Your roster: levelling, rank-ups, ascension, skill tomes, masteries and the nine relic slots.',
  },
  mistgate: {
    phase: 'Phase P5',
    blurb: 'The summoning portal — four sigil types, visible mercy counters, and the Chronicle.',
  },
  bazaar: {
    phase: 'Phase P4',
    blurb: 'Rotating stock for silver, plus the crystal shop for energy and roster space.',
  },
  quests: {
    phase: 'Phase P8',
    blurb: 'Daily, weekly and monthly ladders, the mission chain, and the events framework.',
  },
  events: {
    phase: 'Phase P8',
    blurb: 'Timed point-accrual events with milestone tracks, scheduled from the Admin Suite.',
  },
};

export function PlaceholderScreen({ screen }: { screen: ScreenDefinition }) {
  const note = PHASE_NOTES[screen.id];
  const bundle = useContentStore((state) => state.bundle);

  const readiness = bundle ? describeContent(screen.id, bundle) : null;

  return (
    <div className={styles.screen}>
      <Panel variant="hero" className={styles.card}>
        <div className={styles.glyph} aria-hidden="true">
          {screen.glyph}
        </div>
        <h1 className={styles.title}>{screen.label}</h1>
        <p className={styles.blurb}>{note?.blurb ?? 'This part of the vale is still forming.'}</p>

        {readiness && (
          <div className={styles.readiness}>
            <span className={styles.readinessLabel}>Content ready</span>
            <p className={styles.readinessText}>{readiness}</p>
            <span className={styles.rev}>Revision {bundle?.rev}</span>
          </div>
        )}

        {note && <span className={styles.phase}>Screen arrives in {note.phase}</span>}
      </Panel>
    </div>
  );
}

/** What the live content already holds for a system that has no screen yet. */
function describeContent(
  screenId: string,
  bundle: NonNullable<ReturnType<typeof useContentStore.getState>['bundle']>,
): string | null {
  switch (screenId) {
    case 'champions':
    case 'mistgate': {
      const collectible = bundle.champions.filter((champion) => !champion.isFood);
      const byRarity = collectible.reduce<Record<string, number>>((counts, champion) => {
        counts[champion.rarity] = (counts[champion.rarity] ?? 0) + 1;
        return counts;
      }, {});
      const parts = (['legendary', 'epic', 'rare', 'uncommon'] as const)
        .filter((rarity) => byRarity[rarity])
        .map((rarity) => `${byRarity[rarity]} ${rarity}`);
      return `${collectible.length} champions waiting in the mist — ${parts.join(', ')}.`;
    }
    case 'campaign': {
      const chapters = bundle.campaignChapters.length;
      const stages = bundle.stages.filter((stage) => stage.mode === 'campaign').length;
      if (chapters === 0) return null;
      const first = bundle.campaignChapters[0];
      return `${stages} stages across ${chapters} chapter${chapters === 1 ? '' : 's'}, beginning at ${first?.name}.`;
    }
    case 'depths':
      return bundle.gearSets.length > 0
        ? `${bundle.gearSets.length} relic sets are forged and waiting to drop.`
        : null;
    case 'bazaar':
      return bundle.items.length > 0 ? `${bundle.items.length} goods catalogued.` : null;
    default:
      return null;
  }
}
