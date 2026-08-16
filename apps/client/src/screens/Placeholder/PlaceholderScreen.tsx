import { Panel } from '@/ui/Panel/Panel';
import type { ScreenDefinition } from '@/app/screens';
import styles from './PlaceholderScreen.module.scss';

/**
 * The "coming in a later phase" screen.
 *
 * Every destination in the dock resolves to a real screen from day one, so navigation
 * is never a dead end. Each entry states which phase builds it, which doubles as an
 * in-app roadmap while the game is in early access.
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

  return (
    <div className={styles.screen}>
      <Panel variant="hero" className={styles.card}>
        <div className={styles.glyph} aria-hidden="true">
          {screen.glyph}
        </div>
        <h1 className={styles.title}>{screen.label}</h1>
        <p className={styles.blurb}>{note?.blurb ?? 'This part of the vale is still forming.'}</p>
        {note && <span className={styles.phase}>Arrives in {note.phase}</span>}
      </Panel>
    </div>
  );
}
