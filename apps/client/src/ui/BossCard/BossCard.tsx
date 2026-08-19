import { Badge } from '@/fui/components/Badge.ts';
import { Fui } from '@/fui/react';
import { bossRules, type BossMechanics } from './bossRules';
import styles from './BossCard.module.scss';

/**
 * Who is waiting at the end, and what it does.
 *
 * The campaign's own tagline promises "a warlord waiting at the end of each" chapter and
 * the Depths promise a puzzle on the bottom floor — and neither screen had ever named the
 * one or stated the other. Content has carried both since P6: a stage's last wave names its
 * boss, and the boss carries its mechanics.
 *
 * Mistvale's own, because the library has no component for it and could not: the rules are
 * this game's — Almighty immunity, turn-meter immunity, an enrage clock — and what makes
 * the card worth having is that it says what to *do* about each, not that it lists them.
 */
export interface BossCardProps {
  /** The boss's name, from content. */
  name: string;
  /** Line under the name — what it is the end of. */
  where?: string;
  mechanics: BossMechanics | undefined;
  className?: string;
}

export function BossCard({ name, where, mechanics, className }: BossCardProps): JSX.Element | null {
  const rules = bossRules(mechanics);
  // A boss with no mechanics is an ordinary fight with more health, and saying "no special
  // rules" would be noise on every one of the 252 stages that are exactly that.
  if (rules.length === 0) return null;

  return (
    <section className={[styles.card, className ?? ''].filter(Boolean).join(' ')}>
      <header className={styles.head}>
        <span className={styles.name}>{name}</span>
        {where && <span className={styles.where}>{where}</span>}
      </header>

      <ul className={styles.rules}>
        {rules.map((rule) => (
          <li key={rule.label} className={styles.rule}>
            <Fui
              of={Badge}
              className={styles.chip}
              options={{ text: rule.label, icon: rule.glyph, tone: 'danger', size: 'sm' }}
            />
            <span className={styles.detail}>{rule.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
