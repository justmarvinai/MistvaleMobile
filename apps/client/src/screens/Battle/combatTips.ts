import type { SkillDef, StatusDef } from '@mistvale/shared';
import type { TooltipOptions } from '@/fui/components/Tooltip.ts';
import type { StatusChip } from '@/game/playback';

/**
 * What a skill and a status actually say, as tooltip content.
 *
 * The fight had been asking players to guess. A hotbar slot was an icon; a status was a
 * coloured pip four pixels across. Everything needed to explain both has been in the
 * content bundle since P1 — a skill knows its cooldown and exactly who it hits, a status
 * knows whether it helps or hurts and how long it lasts — and no screen had ever said so.
 *
 * Kept away from React so the wording is testable on its own, which matters more here than
 * usual: these sentences are the game teaching its own rules.
 */

/** The one thing a player must know before spending a turn: who does this land on? */
export function targetLine(targeting: SkillDef['targeting']): string {
  const who = targeting.side === 'self' ? 'self' : targeting.side === 'ally' ? 'ally' : 'enemy';
  switch (targeting.mode) {
    case 'self':
      return 'Self';
    case 'all':
      return who === 'ally' ? 'All allies' : 'All enemies';
    case 'random':
      return `${targeting.count ?? 1} random ${who === 'ally' ? 'allies' : 'enemies'}`;
    case 'lowestHp':
      return who === 'ally' ? 'Lowest-health ally' : 'Lowest-health enemy';
    case 'single':
      return who === 'ally' ? 'One ally' : 'One enemy';
  }
}

/** Whether the player gets to choose who it lands on. */
export function choosable(targeting: SkillDef['targeting']): boolean {
  return targeting.mode === 'single' && targeting.side !== 'self';
}

const SLOT_NAME: Record<SkillDef['slot'], string> = {
  a1: 'Basic attack',
  a2: 'Skill',
  a3: 'Skill',
  a4: 'Ultimate',
  passive: 'Passive',
};

/**
 * A skill, as a tooltip.
 *
 * `ready` is turns remaining on the cooldown — 0 or less means it can be used now. It is
 * shown as its own line rather than folded into the cooldown, because "3 turns" and "ready
 * in 2" answer different questions and a player mid-fight is asking the second one.
 */
export function skillTip(skill: SkillDef, ready = 0): TooltipOptions {
  const stats: NonNullable<TooltipOptions['stats']> = [
    { label: 'Targets', value: targetLine(skill.targeting), tone: 'plain' },
    {
      label: 'Cooldown',
      value: skill.cooldown > 0 ? `${skill.cooldown} turns` : 'None',
      tone: skill.cooldown > 0 ? 'plain' : 'good',
    },
  ];
  if (ready > 0) stats.push({ label: 'Ready in', value: `${ready} turns`, tone: 'bad' });
  if (choosable(skill.targeting)) {
    stats.push({ label: 'Choose target', value: 'Yes', tone: 'magic' });
  }

  return {
    title: skill.name,
    subtitle: SLOT_NAME[skill.slot],
    stats,
    ...(skill.description ? { flavor: skill.description } : {}),
    ...(ready > 0
      ? { requires: [`On cooldown for ${ready} more ${ready === 1 ? 'turn' : 'turns'}`] }
      : {}),
  };
}

/**
 * A status on a unit, as a tooltip.
 *
 * `def` is the published definition — absent only if a fight is running on content that has
 * since been unpublished, which the client must survive rather than crash on. The chip is
 * still worth showing in that case: how long it lasts is the player's business either way.
 */
export function statusTip(chip: StatusChip, def: StatusDef | undefined): TooltipOptions {
  const stats: NonNullable<TooltipOptions['stats']> = [
    {
      label: 'Turns left',
      value: chip.turns,
      tone: chip.kind === 'buff' ? 'good' : 'bad',
    },
  ];
  if (chip.stacks > 1) stats.push({ label: 'Stacks', value: chip.stacks, tone: 'plain' });

  return {
    title: def?.name ?? chip.key,
    subtitle: chip.kind === 'buff' ? 'Buff' : 'Debuff',
    stats,
    ...(def?.description ? { flavor: def.description } : {}),
  };
}
