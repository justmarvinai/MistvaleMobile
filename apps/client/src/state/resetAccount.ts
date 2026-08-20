import { useArenaStore } from './arenaStore';
import { useBattleStore } from './battleStore';
import { useDepthsStore } from './depthsStore';
import { useEventStore } from './eventStore';
import { useInventoryStore } from './inventoryStore';
import { useLoadoutStore } from './loadoutStore';
import { useLoginStore } from './loginStore';
import { useMailStore } from './mailStore';
import { useMissionStore } from './missionStore';
import { useNavStore } from './navStore';
import { useNewsStore } from './newsStore';
import { usePlayerStore } from './playerStore';
import { useProfileStore } from './profileStore';
import { useProgressStore } from './progressStore';
import { useQuestStore } from './questStore';
import { useRosterStore } from './rosterStore';
import { useShopStore } from './shopStore';
import { useSummonStore } from './summonStore';
import { useTutorialStore } from './tutorialStore';
import { useUiStore } from './uiStore';
import { useUnlockStore } from './unlockStore';

/**
 * Everything one account left behind, forgotten in one place.
 *
 * Signing out cleared three stores. Eighteen of them hold an account's own data, and the
 * rest kept it: sign out on a shared machine, sign back in as somebody else without
 * reloading, and the first paint of the roster is the previous player's champions, the
 * mailbox is their mail, and `resume()` — which only asks the server when it holds no
 * battle — showed their fight. Every screen re-fetches on mount, so the wrong data was
 * replaced within a second or two, which is precisely why nobody caught it.
 *
 * The battle store also holds the *playback clock*, which is a `setTimeout` chained into
 * the next one for the length of a fight. Left running past a sign-out it went on cloning
 * the view, moving health bars and playing hit cues at somebody looking at the sign-in
 * form.
 *
 * Deliberately one flat list rather than a registry stores opt into: a registry is a
 * thing to remember to join, and forgetting is the whole failure mode here.
 * `resetAccount.test.ts` fails when a store with a `reset` is missing from it.
 */
export function resetAccountState(): void {
  useArenaStore.getState().reset();
  useBattleStore.getState().reset();
  useDepthsStore.getState().reset();
  useEventStore.getState().reset();
  useInventoryStore.getState().reset();
  useLoadoutStore.getState().reset();
  useLoginStore.getState().reset();
  useMailStore.getState().reset();
  useMissionStore.getState().reset();
  useNewsStore.getState().reset();
  usePlayerStore.getState().reset();
  useProfileStore.getState().reset();
  useProgressStore.getState().reset();
  useQuestStore.getState().reset();
  useRosterStore.getState().reset();
  useShopStore.getState().reset();
  useSummonStore.getState().reset();
  useTutorialStore.getState().reset();
  useUnlockStore.getState().reset();

  // Not account data, but just as wrong to carry over: a toast about the last account's
  // empty purse, and a screen the next player did not choose. `contentStore` stays — the
  // game's content is the same game whoever is looking at it — and `sessionStore` is the
  // thing doing the signing out.
  useUiStore.getState().clearToasts();
  useNavStore.getState().setScreen('haven');
}
