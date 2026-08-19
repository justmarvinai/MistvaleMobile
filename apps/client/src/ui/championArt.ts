import type { ChampionDef } from '@mistvale/shared';
import { avatarPath } from '../game/sprites';

/**
 * What a champion looks like on a card.
 *
 * Drawn art when there is some, a painted stand-in when there is not — and the gate is the
 * asset's `avatarPath`, not the mere existence of an asset record. Nearly every champion in
 * the game points at `enemy_lizard`, the shared art-pending model, so "has an asset" is true
 * for all of them and answers nothing. `avatarPath` is content: an operator who uploads a
 * face through the Admin Suite fills it in and the card changes with no code involved. It is
 * also the only signal the client can trust, since the published sprite tree is a build
 * artifact whose shape the client cannot see.
 *
 * The stand-in matters more than it sounds. The library's `ChampionCard` takes an image *or*
 * an asset id and draws **nothing** when the image it is handed fails to load, so the ten
 * Sskarn Broodlings of a ×10 pull came back as ten empty frames — worse than a silhouette,
 * and much worse than the placeholder Mistvale's own `Portrait` draws.
 *
 * Faction before role, because a faceless champion has exactly one slot in which to say
 * anything and its house is the more interesting half: the Hollowborn read as Hollowborn at
 * a glance, and thirty-six art-pending champions become eight recognisable groups rather
 * than four. Role is the fallback for a faction the map does not know — content can add a
 * ninth house without a code change, and it lands on something sensible.
 *
 * All of this is placeholder art with a shelf life. Every one of these disappears the moment
 * `assets/champions/<unit>/` gains an avatar and the asset declares it.
 */
const FACTION_STANDIN: Readonly<Record<string, string>> = Object.freeze({
  vale_sentinels: 'hero-vanguard',
  emberclan: 'hero-emberknight',
  wayfarers: 'hero-lone-wanderer',
  hollowborn: 'hero-voidguard',
  sskarn: 'hero-brute',
  thornweald: 'hero-green-sorceress',
  runebound: 'hero-stone-golem',
  drowned_choir: 'hero-blue-cultist',
});

/** What a champion *does*, when its house is unknown. */
const ROLE_STANDIN: Readonly<Record<string, string>> = Object.freeze({
  attack: 'hero-duelist',
  defense: 'hero-vanguard',
  hp: 'hero-stone-golem',
  support: 'hero-green-sorceress',
});

/** The generic one, for a champion that is neither. */
const FALLBACK = 'hero-lone-wanderer';

export interface ChampionArt {
  /** A real avatar URL, when the champion has drawn art. */
  portrait?: string;
  /** A painted stand-in asset id, when it does not. */
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
  def: ChampionDef | undefined,
  assets: readonly ChampionArtAsset[] | undefined,
): ChampionArt {
  const asset = assets?.find((entry) => entry.key === def?.assetKey);
  if (asset?.avatarPath) return { portrait: avatarPath(asset.basePath) };
  return {
    art:
      (def?.factionKey ? FACTION_STANDIN[def.factionKey] : undefined) ??
      (def?.role ? ROLE_STANDIN[def.role] : undefined) ??
      FALLBACK,
  };
}
