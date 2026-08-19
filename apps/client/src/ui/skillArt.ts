/**
 * The painted icon a skill is drawn with.
 *
 * Skills are content and carry no art field — adding one is a server change, and this
 * rework does not touch the game. So the icon is derived from the key, deterministically:
 * the same skill always gets the same icon, different skills on the same champion get
 * different ones, and a skill added in Admin tomorrow gets one without anybody choosing
 * it. A real icon per skill is a content job for later; this is the honest stand-in and
 * it is stable, which is what a player actually needs from a hotbar.
 */
const SKILL_ART: readonly string[] = [
  'fire-flame-lance',
  'weapon-broadsword',
  'rune-astral-burst',
  'blood-sanguine-blade',
  'earth-stone-blade',
  'fire-flame-burst',
  'rune-radiance',
  'orb-emberstorm',
];

export function skillArt(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return SKILL_ART[hash % SKILL_ART.length] ?? SKILL_ART[0]!;
}
