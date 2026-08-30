import { useMemo } from 'react';
import type { EnemyDef, SkillDef } from '@mistvale/shared';
import { BossHealthBar } from '@/fui/components/BossHealthBar.ts';
import { Fui } from '@/fui/react';
import type { VisualUnit } from '../../game/playback';
import { affinityOf } from '../../ui/affinity';
import { skillArt } from '../../ui/skillArt';
import { useTip } from '../../ui/Tooltip/useTooltip';
import { bossRules } from '../../ui/BossCard/bossRules';
import { skillTip } from './combatTips';
import styles from './BossFrame.module.scss';

/**
 * The thing at the end of the chapter, framed as one.
 *
 * A warlord and a wave of bandits were the same four health bars and the same silence about
 * what either could do. The owner's reference (2026-08-29) is the shape this genre uses when
 * the fight is *about* one creature: its health across the whole top of the screen, and what
 * it can do to you down the side.
 *
 * Nothing here is new data. `isBoss` has been on the unit since P3, an enemy's skills have
 * been in the content bundle since P1, and `bossMechanics` since P6 — the mechanics reached
 * the team chooser in D8 and then vanished the moment the fight started, which is precisely
 * when a player needs them. The fight was asking people to remember a card they read two
 * screens ago.
 *
 * **It is drawn from the playback and nothing else** (P10a). Auto resolves several turns in
 * one response, so the server's board is routinely two waves ahead of the animation — the
 * first cut read `isBoss` off the server's state and put a full boss frame over wave one
 * already reading `0 / 235`, which gave away both the creature and the fight. What it can
 * *do* still comes from content, because a creature's skills and mechanics are the same on
 * every turn of every fight and reveal nothing about this one.
 */

/** The boss on the field, as far as the eye knows — the wave the player is watching. */
export function bossOnField(enemies: readonly VisualUnit[]): VisualUnit | null {
  // Alive only: an empty bar left across the top while the escorts fight on is a report on
  // something that is no longer happening, and the playback's own death beat is what says
  // the boss fell.
  return enemies.find((unit) => unit.isBoss && unit.alive) ?? null;
}

export function BossBar({
  boss,
  subtitle,
}: {
  boss: VisualUnit;
  /** Where the fight is — "Wave 3 of 3", the keep's floor, the warlord's title. */
  subtitle: string;
}): JSX.Element {
  const affinity = affinityOf(boss.element);
  return (
    <Fui
      /* `BossHealthBar` takes its name, its ceiling and its colour at construction and
         paints from its own field thereafter. Keyed on exactly what a *different* boss
         changes, so a second one on a later wave gets its own bar and the same one keeps
         the trail it is animating. */
      key={`${boss.defKey}:${boss.ref.slot}:${boss.maxHp}`}
      of={BossHealthBar}
      className={styles.bar}
      options={{
        name: boss.name,
        subtitle,
        value: boss.hp,
        max: Math.max(1, boss.maxHp),
        showNumbers: true,
        ...(affinity ? { color: affinity.color, glyph: affinity.glyph } : {}),
      }}
      /* Silent: this is the fight telling the bar where it got to, not the bar announcing a
         decision. Its own `set` emits `boss:change` and `boss:defeat`, and a defeat event
         fired from a health push would be the HUD claiming an outcome the playback has not
         reached. */
      apply={(bar, next) => bar.set(next.value ?? 0, { silent: true })}
    />
  );
}

/**
 * What the boss can do, down the side.
 *
 * Its skills, hoverable, and above them the mechanics that decide which champions belong in
 * this fight at all — a hit shield is a team-building answer rather than a gear one, and it
 * had been stated in the team chooser and nowhere else.
 *
 * Both come out of **content** rather than off the live unit: "what can this thing do, and
 * how often" is the question a player is asking, and neither answer changes from turn to
 * turn — which is also what keeps this rail off the server's clock.
 */
export function BossSkills({
  name,
  def,
  skills,
}: {
  name: string;
  def: EnemyDef | undefined;
  skills: readonly SkillDef[];
}): JSX.Element | null {
  const rules = useMemo(() => bossRules(def?.bossMechanics), [def]);
  if (skills.length === 0 && rules.length === 0) return null;

  return (
    <aside className={styles.rail} aria-label={`What ${name} can do`}>
      {rules.length > 0 && (
        <ul className={styles.rules}>
          {rules.map((rule) => (
            <Rule key={rule.label} label={rule.label} detail={rule.detail} glyph={rule.glyph} />
          ))}
        </ul>
      )}
      {skills.length > 0 && (
        <ul className={styles.skills}>
          {skills.map((skill) => (
            <Skill key={skill.key} skill={skill} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function Skill({ skill }: { skill: SkillDef }): JSX.Element {
  const ref = useTip(skillTip(skill));
  return (
    <li ref={ref} className={styles.skill} tabIndex={0}>
      <span
        className={styles.icon}
        aria-hidden="true"
        style={{ backgroundImage: `var(--fui-img-${skillArt(skill.key)})` }}
      />
      <span className={styles.name}>{skill.name}</span>
    </li>
  );
}

function Rule({
  label,
  detail,
  glyph,
}: {
  label: string;
  detail: string;
  glyph: string;
}): JSX.Element {
  // `flavor` rather than a stat line: a mechanic is a sentence about what to *do*, and the
  // pack has one slot for a sentence.
  const ref = useTip({ title: label, subtitle: 'Boss mechanic', flavor: detail, width: 280 });
  return (
    <li ref={ref} className={styles.rule} tabIndex={0}>
      {/* A glyph is authored `fill="currentColor"`, so it is used as a *mask* and takes the
          colour around it — loaded as a background it resolves against its own document and
          comes out black (C25). */}
      <span
        className={styles.glyph}
        aria-hidden="true"
        style={{ maskImage: `var(--fui-img-${glyph})` }}
      />
      <span className={styles.name}>{label}</span>
    </li>
  );
}
