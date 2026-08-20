/**
 * Which way a unit's art is pointing, and whether to turn it round.
 *
 * The rule used to be "mirror everything on the enemy side", which is right only if every
 * sprite in the game is drawn facing the same way. It is not: champion art is authored
 * facing right, and the enemy art is authored facing left — already turned toward the party,
 * because that is the direction an enemy is drawn to be seen from. Mirroring it on top of
 * that turned the Sskarn round to face away from the fight, which is what the owner was
 * looking at.
 *
 * So the question is about the *art*, not the side. Both renderers ask this one function, so
 * the Pixi scene and the DOM battlefield cannot drift apart on it again.
 */

/** Where the sprite tree keeps art that is drawn facing right. */
const FACES_RIGHT = 'champions/';

/**
 * Whether this unit's sprite has to be flipped to face the fight.
 *
 * `art` is the published base path — `champions/epic_anuria`, `enemies/teritorial_lizard`.
 * Art that faces right is flipped when it fights on the enemy side; art that already faces
 * left is flipped when it fights on the player's, which is what makes a champion borrowed
 * as an Arena defender look the right way round.
 */
export function mirrored(art: string, side: 'ally' | 'enemy'): boolean {
  const facesRight = art.startsWith(FACES_RIGHT);
  return facesRight ? side === 'enemy' : side === 'ally';
}
