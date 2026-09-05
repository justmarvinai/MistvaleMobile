import type { Readiness } from '@mistvale/shared';
import type { ScreenId } from '@/app/screens';

/**
 * The one live line a hub card carries under its sentence (C45).
 *
 * A card's sentence says what a place is *for*; the line says where this account stands
 * with it — nine champions, a vault at 40 of 250, three tokens waiting. Everything here
 * is read off `readiness`, which rides on the snapshot the shell re-fetches after every
 * action, so the line can never disagree with the screen behind the card and costs the
 * hub no round trip.
 *
 * Null where there is nothing honest to say: below a feature's unlock the count is null,
 * and a place with nothing countable (the campaign, the Mistgate) has no line rather than
 * a made-up one. Pure, so a table can be asked what every card says.
 */
export function liveLine(id: ScreenId, readiness: Readiness): string | null {
  const { holdings } = readiness;
  switch (id) {
    case 'champions':
      return count(holdings.champions, 'champion', 'champions');
    case 'relics':
      return holdings.vault.cap > 0
        ? `${holdings.vault.value.toLocaleString()} of ${holdings.vault.cap.toLocaleString()} in the vault`
        : null;
    case 'chronicle':
      return holdings.chronicle
        ? `${holdings.chronicle.value} of ${holdings.chronicle.cap} met`
        : null;
    case 'wardens':
      return holdings.wardens === null
        ? null
        : holdings.wardens === 0
          ? 'Nobody kept yet'
          : count(holdings.wardens, 'warden kept', 'wardens kept');
    case 'arena':
      return readiness.arenaTokens
        ? `${readiness.arenaTokens.value} of ${readiness.arenaTokens.cap} tokens`
        : null;
    case 'titan':
      return readiness.titanKeys
        ? `${readiness.titanKeys.value} of ${readiness.titanKeys.cap} keys today`
        : null;
    case 'depths':
      return readiness.openSprings.length > 0
        ? count(readiness.openSprings.length, 'spring open today', 'springs open today')
        : null;
    default:
      return null;
  }
}

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
