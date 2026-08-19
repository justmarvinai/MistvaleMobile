import type { VaultState } from '@mistvale/shared';
import { StatBar } from '@/fui/components/StatBar.ts';
import { Fui } from '@/fui/react';
import styles from './VaultMeter.module.scss';

/**
 * How much room is left, and what happens when there is none.
 *
 * The vault is a real economy since Q5 — 250 loose relics, bought up fifty at a time on a
 * rising silver curve — and it was showing as the fraction "218 / 250" in a definition
 * list. That is the number, but it is not the *feeling*: a player wants to know at a glance
 * whether tonight's farming is going to start being sold on the road.
 *
 * Mistvale's own, and it has to be: the library's `StatBar` is the meter, but what makes
 * this worth a component is the sentence underneath — three states, each of which changes
 * what a player should do next. A bar alone would say "nearly full" and leave them to
 * work out that a relic which will not fit is sold rather than lost.
 *
 * Equipped relics are deliberately not counted. That is the rule that makes putting gear on
 * a champion a way to clear space, and the copy says so rather than leaving it to be
 * discovered.
 */
export interface VaultMeterProps {
  vault: VaultState;
  className?: string;
}

/** Below this much room left, the meter starts warning rather than reporting. */
const TIGHT = 0.9;

export function VaultMeter({ vault, className }: VaultMeterProps): JSX.Element {
  const fraction = vault.capacity > 0 ? vault.used / vault.capacity : 0;
  const full = vault.used >= vault.capacity;
  const tight = !full && fraction >= TIGHT;

  return (
    <div className={[styles.meter, className ?? ''].filter(Boolean).join(' ')}>
      {/* Keyed on what it draws: `StatBar` animates from its current value, and a bar that
          kept the old one after a sale would tell the player they still have no room. */}
      <Fui
        key={`${vault.used}/${vault.capacity}`}
        of={StatBar}
        options={{
          kind: full ? 'health' : 'stamina',
          value: vault.used,
          max: Math.max(vault.capacity, 1),
          label: 'Loose relics',
          readout: 'ratio',
          width: '100%',
          trail: false,
        }}
        attrs={{ 'aria-label': `${vault.used} of ${vault.capacity} vault slots used` }}
      />

      <p className={styles.note} data-state={full ? 'full' : tight ? 'tight' : 'room'}>
        {full
          ? 'Full. Relics you win are sold on the road for silver until there is room again.'
          : tight
            ? `Room for ${vault.capacity - vault.used} more. Equipping one clears its slot — worn relics do not count.`
            : 'Worn relics do not count, so equipping one clears its slot.'}
      </p>
    </div>
  );
}
