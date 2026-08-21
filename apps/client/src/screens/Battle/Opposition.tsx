import { useMemo } from 'react';
import type { EnemyDef, StageDef } from '@mistvale/shared';
import { useContentStore } from '@/state/contentStore';
import { Portrait } from '@/ui/Portrait/Portrait';
import { championArt } from '@/ui/championArt';
import { affinityOf } from '@/ui/affinity';
import { useTip } from '@/ui/Tooltip/useTooltip';
import { bossRules } from '@/ui/BossCard/bossRules';
import styles from './Opposition.module.scss';

/**
 * What is on the other side.
 *
 * The team screen asked a player to commit four champions and a fistful of energy against
 * something it never showed them. Content has always known — a stage's waves name every
 * enemy, its level and where it stands — and the only screen that ever read them was the
 * battle itself, by which point the energy is spent and the team is locked.
 *
 * Wave by wave, in the order they arrive, because that is the shape of the decision: a
 * three-wave stage is three fights on one bar of health, and the last wave is the one worth
 * building for. Everything a chip cannot hold — the role, the affinity, what a boss does
 * about being fought — is on the hover.
 */
export function Opposition({ stage }: { stage: StageDef }): JSX.Element | null {
  const bundle = useContentStore((state) => state.bundle);

  const enemies = useMemo(
    () => new Map((bundle?.enemies ?? []).map((enemy) => [enemy.key, enemy])),
    [bundle],
  );

  if (stage.waves.length === 0) return null;

  return (
    <section className={styles.opposition} aria-label="What you will face">
      <h3 className={styles.title}>What is waiting</h3>
      <div className={styles.waves}>
        {stage.waves.map((wave, index) => (
          <div key={index} className={styles.wave}>
            <span className={styles.waveLabel}>
              Wave {index + 1}
              {index === stage.waves.length - 1 && stage.waves.length > 1 ? ' · last' : ''}
            </span>
            <div className={styles.units}>
              {[...wave]
                .sort((a, b) => a.slot - b.slot)
                .map((unit, slot) => (
                  <Unit
                    key={`${unit.enemyKey}-${unit.slot}-${slot}`}
                    def={enemies.get(unit.enemyKey)}
                    fallbackKey={unit.enemyKey}
                    level={unit.level}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * One enemy in a wave.
 *
 * A component because a tooltip is a hook and a stage holds up to twelve of these.
 */
function Unit({
  def,
  fallbackKey,
  level,
}: {
  def: EnemyDef | undefined;
  fallbackKey: string;
  level: number;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const affinity = def?.element ? affinityOf(def.element) : undefined;
  const art = championArt(def, bundle?.assets);
  const rules = bossRules(def?.bossMechanics);

  const ref = useTip({
    title: def?.name ?? fallbackKey,
    subtitle: def?.isBoss ? 'Boss' : (def?.archetype ?? 'Enemy'),
    stats: [
      { label: 'Level', value: `${level}`, tone: 'plain' },
      ...(affinity ? [{ label: 'Affinity', value: affinity.label, tone: 'plain' as const }] : []),
      ...(def?.role ? [{ label: 'Role', value: titleCase(def.role), tone: 'plain' as const }] : []),
    ],
    ...(rules.length > 0
      ? { requires: rules.map((rule) => `${rule.label} — ${rule.detail}`) }
      : {}),
  });

  return (
    <span ref={ref} className={styles.unit} data-boss={def?.isBoss === true}>
      <span className={styles.portrait}>
        <Portrait src={art.portrait ?? null} name={def?.name} size={44} />
        {affinity && (
          <span
            className={styles.affinity}
            style={{ '--mv-affinity': affinity.color } as React.CSSProperties}
            aria-hidden="true"
          />
        )}
      </span>
      <span className={styles.name}>{def?.name ?? fallbackKey}</span>
      <span className={styles.level}>Lv {level}</span>
    </span>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
