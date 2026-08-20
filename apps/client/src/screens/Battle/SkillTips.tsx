import type { SkillDef } from '@mistvale/shared';
import { useTooltip } from '@/ui/Tooltip/useTooltip';
import { skillTip } from './combatTips';

/**
 * Tooltips on the hotbar.
 *
 * The action bar is the library's, and a library component owns its own DOM — there is no
 * React element per slot to hang a tooltip on. So the slots are found by position inside the
 * bar, which is safe because the bar is built from the same list in the same order: one
 * `SkillTip` per skill, each resolving the nth slot.
 *
 * Rendered as siblings of the bar rather than inside it, and drawing nothing. They exist for
 * the effect they run.
 */
export function SkillTips({
  host,
  skills,
  cooldowns,
}: {
  /** The element the `ActionBar` was mounted into. */
  host: HTMLElement | null;
  skills: readonly SkillDef[];
  /** Turns remaining per skill key; absent or 0 means ready. */
  cooldowns: Readonly<Record<string, number>>;
}): JSX.Element {
  return (
    <>
      {skills.map((skill, index) => (
        <SkillTip
          key={skill.key}
          host={host}
          index={index}
          skill={skill}
          ready={cooldowns[skill.key] ?? 0}
        />
      ))}
    </>
  );
}

function SkillTip({
  host,
  index,
  skill,
  ready,
}: {
  host: HTMLElement | null;
  index: number;
  skill: SkillDef;
  ready: number;
}): null {
  // Read during render, which is safe here and simpler than the alternatives: `host` only
  // becomes non-null through a ref callback, and that is itself a re-render — by which time
  // the library has mounted the bar and the slots exist. Every later change to the skill
  // list re-renders this too, so the query never goes stale.
  const slot = host?.querySelectorAll<HTMLElement>('[role="button"]')[index] ?? null;
  useTooltip(slot, skillTip(skill, ready));
  return null;
}
