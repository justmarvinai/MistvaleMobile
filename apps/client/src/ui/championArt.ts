import { avatarPath } from '../game/sprites';

/**
 * What a champion looks like on a card.
 *
 * Drawn art when there is some, and **one** stand-in when there is not — and the gate is the
 * asset's `avatarPath`, not the mere existence of an asset record. Nearly every champion in
 * the game points at `enemy_lizard`, the shared art-pending model, so "has an asset" is true
 * for all of them and answers nothing. `avatarPath` is content: an operator who uploads a
 * face through the Admin Suite fills it in and the card changes with no code involved. It is
 * also the only signal the client can trust, since the published sprite tree is a build
 * artifact whose shape the client cannot see.
 *
 * **Why one stand-in and not eight.** This used to pick a different painted FantasyUIs hero
 * per faction — an emberknight for the Emberclan, a brute for the Sskarn — on the theory
 * that eight recognisable groups beat thirty-six identical blanks. In practice it read as
 * what it was: unrelated art borrowed from a component library and handed out at random, so
 * a roster looked like eight different games. The owner's call (2026-08-20) is one
 * placeholder for everyone, and it is the right one: a silhouette says *art pending* and
 * says nothing false, where a borrowed emberknight quietly claims to be a portrait.
 *
 * The stand-in matters more than it sounds. The library's `ChampionCard` takes an image *or*
 * an asset id and draws **nothing** when the image it is handed fails to load, so the ten
 * Sskarn Broodlings of a ×10 pull came back as ten empty frames — worse than a silhouette,
 * and much worse than the placeholder Mistvale's own `Portrait` draws.
 *
 * All of this is placeholder art with a shelf life. Every one of these disappears the moment
 * `assets/champions/<unit>/` gains an avatar and the asset declares it.
 */

/**
 * The one stand-in, for every champion whose face has not been drawn yet.
 *
 * A hooded figure from the library's own art, and the same one `game/sprites` puts on the
 * battlefield — so a champion reads the same on its card and in the fight it is sent to.
 */
export const CHAMPION_PLACEHOLDER = 'silhouette-warrior-m';

export interface ChampionArt {
  /** A real avatar URL, when the champion has drawn art. */
  portrait?: string;
  /** The painted stand-in's asset id, when it does not. */
  art?: string;
}

/** Only the fields this needs, so a test does not have to build a whole `AssetDef`. */
export interface ChampionArtAsset {
  key: string;
  basePath: string;
  avatarPath: string;
}

/**
 * The art options for one champion, ready to spread into a `ChampionCard`.
 *
 * Returns exactly one of the two keys, so spreading it can never hand the component both.
 */
export function championArt(
  // Structurally an asset key and nothing else, because an *enemy* is a unit with art too
  // — the team screen's line-up draws the waves it is about to send four champions into,
  // and the lookup is identical. Narrowing this to `ChampionDef` would have meant a second
  // copy of the same six lines under a different name.
  def: { assetKey?: string } | undefined,
  assets: readonly ChampionArtAsset[] | undefined,
): ChampionArt {
  const asset = assets?.find((entry) => entry.key === def?.assetKey);
  if (asset?.avatarPath) return { portrait: avatarPath(asset.basePath) };
  return { art: CHAMPION_PLACEHOLDER };
}
