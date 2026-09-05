import { useCallback, useEffect, useState } from 'react';
import { PixiStage } from '@/game/PixiStage';
import { useAudio } from '@/audio/useAudio';
import { usePreferences } from './usePreferences';
import { ToastHost } from '@/ui/Toast/Toast';
import { AuthScreen } from '@/screens/Auth/AuthScreen';
import { HavenScreen } from '@/screens/Haven/HavenScreen';
import { HubScreen } from '@/screens/Hub/HubScreen';
import { CampaignScreen } from '@/screens/Campaign/CampaignScreen';
import { BattleScreen } from '@/screens/Battle/BattleScreen';
import { DepthsScreen } from '@/screens/Depths/DepthsScreen';
import { ExpeditionsScreen } from '../screens/Expeditions/ExpeditionsScreen';
import { WardensScreen } from '../screens/Wardens/WardensScreen';
import { TrialsScreen } from '../screens/Trials/TrialsScreen';
import { WorldBossScreen } from '../screens/WorldBoss/WorldBossScreen';
import { DeepRunScreen } from '../screens/DeepRun/DeepRunScreen';
import { SpireScreen } from '../screens/Spire/SpireScreen';
import { TitanScreen } from '@/screens/Titan/TitanScreen';
import { ArenaScreen } from '@/screens/Arena/ArenaScreen';
import { QuestsScreen } from '@/screens/Quests/QuestsScreen';
import { MissionsScreen } from '@/screens/Missions/MissionsScreen';
import { EventsScreen } from '@/screens/Events/EventsScreen';
import { PassScreen } from '../screens/Pass/PassScreen';
import { CalendarScreen } from '@/screens/Calendar/CalendarScreen';
import { MailScreen } from '@/screens/Mail/MailScreen';
import { NewsPanel } from '@/screens/News/NewsPanel';
import { ProfilePanel } from '@/screens/Profile/ProfilePanel';
import { ChampionsScreen } from '@/screens/Champions/ChampionsScreen';
import { RelicsScreen } from '@/screens/Relics/RelicsScreen';
import { BazaarScreen } from '@/screens/Bazaar/BazaarScreen';
import { MistgateScreen } from '@/screens/Mistgate/MistgateScreen';
import { ChronicleScreen } from '@/screens/Chronicle/ChronicleScreen';
import { PlaceholderScreen } from '@/screens/Placeholder/PlaceholderScreen';
import { SettingsModal } from '@/screens/Settings/SettingsModal';
import { useSessionStore } from '@/state/sessionStore';
import { usePlayerStore } from '@/state/playerStore';
import { useContentStore } from '@/state/contentStore';
import {
  DOCK_SCREENS,
  SCREENS,
  dockSlotFor,
  isHub,
  isScreenUnlocked,
  type ScreenId,
} from './screens';
import { useNavStore } from '@/state/navStore';
import { tabScenery } from '@/ui/tabScenery';
import { useTutorialStore } from '@/state/tutorialStore';
import { useLoadoutStore } from '@/state/loadoutStore';
import { useBattleStore } from '@/state/battleStore';
import { useUnlockStore } from '@/state/unlockStore';
import { resetAccountState } from '@/state/resetAccount';
import { TopBar } from './TopBar';
import { TutorialOverlay } from './TutorialOverlay';
import { ErrorBoundary } from './ErrorBoundary';
import { ScreenWipe } from './ScreenWipe';
import { UnlockBanner } from './UnlockBanner';
import { Dock } from './Dock';
import { BootScreen } from './BootScreen';
import styles from './App.module.scss';

/**
 * The application root.
 *
 * Owns session restoration and the top-level choice between the auth screen and the
 * game shell. Navigation state lives inside `GameShell`, which is keyed by account so a
 * new sign-in always starts fresh without any state-resetting effects.
 */
export function App() {
  // The mixer wants the published cue catalogue, the player's volumes, and a gesture it is
  // allowed to start on. Mounted here so all three exist for the whole session.
  useAudio();
  // And the preferences that belong to the document rather than to a component.
  usePreferences();

  const status = useSessionStore((state) => state.status);
  const account = useSessionStore((state) => state.account);
  const restore = useSessionStore((state) => state.restore);
  const player = usePlayerStore((state) => state.player);
  const refreshPlayer = usePlayerStore((state) => state.refresh);

  const ensureContent = useContentStore((state) => state.ensureLoaded);
  // Which tab the shell is standing in, so the backdrop can be that tab's. Read here
  // rather than inside `GameShell` because the stage is mounted out here, once, and a
  // stage that moved into the shell would be destroyed and rebuilt on every sign-in.
  const screen = useNavStore((state) => state.screen);

  const [bootError, setBootError] = useState<string>();

  // Ask the server once whether the cookie we may be holding is still a live session.
  useEffect(() => {
    void restore().catch(() => {
      setBootError('Could not reach the server. It may be restarting — try again shortly.');
    });
  }, [restore]);

  // Content is public and needed by every screen, so it loads alongside the session
  // rather than after it.
  useEffect(() => {
    void ensureContent().catch(() => {
      setBootError('Could not load game content. The server may be mid-deploy.');
    });
  }, [ensureContent]);

  // Pull the full snapshot once signed in; drop it on sign-out.
  useEffect(() => {
    if (status === 'authenticated') {
      void refreshPlayer()
        .then(() => {
          // The snapshot's envelope carries the live revision; if a publish happened
          // while we were away, pick the new content up without a reload.
          void useContentStore.getState().refreshIfStale();
        })
        .catch(() => {
          setBootError('Signed in, but the player snapshot could not be loaded.');
        });
    } else if (status === 'anonymous') {
      // Everything one account left behind, in one call — the next account gets its own
      // script rather than this one's step 7, its own roster rather than a first paint of
      // somebody else's, and no playback clock still ticking from a fight it never fought.
      resetAccountState();
    }
  }, [status, refreshPlayer]);

  // The Pixi stage is mounted once, outside every branch below. It used to appear in
  // each of them, so signing in unmounted one and mounted another — and `PixiStage`'s
  // cleanup destroys the *shared* Application and removes its canvas from the DOM, so
  // every auth transition threw away a WebGL context and built a new one.
  //
  // The tab's painting comes with it (C23), and only once there is a player: the title
  // screen paints its own key art full-bleed (C18) and the boot screen is a lantern in the
  // dark, so a wallpaper under either would be a second picture nobody asked for.
  // `dockSlotFor` maps every screen in the game to the tab it lives in, so the Depths and
  // the Mistspire share the Combat painting rather than each needing one.
  const scenery = tabScenery(status === 'authenticated' && player ? dockSlotFor(screen) : null);
  const backdrop = (
    <PixiStage
      scene="mist"
      wallpaper={scenery.wallpaper}
      smoke={scenery.smoke}
      wash={scenery.wash}
    />
  );

  if (status === 'unknown') {
    return (
      <>
        {backdrop}
        <BootScreen error={bootError} onRetry={() => window.location.reload()} />
      </>
    );
  }

  if (status === 'anonymous') {
    return (
      <>
        {backdrop}
        <AuthScreen />
        <ToastHost />
      </>
    );
  }

  // Authenticated, but the first snapshot has not landed yet.
  if (!player) {
    return (
      <>
        {backdrop}
        <BootScreen
          message="Lighting the lanterns…"
          error={bootError}
          onRetry={() => window.location.reload()}
        />
        <ToastHost />
      </>
    );
  }

  return (
    <>
      {backdrop}
      {/* Keyed by account: signing in as someone else rebuilds the shell from scratch. */}
      <GameShell key={account?.id ?? 'session'} />
      <ToastHost />
    </>
  );
}

/**
 * The room a fight belongs to, for a battle resumed without any navigation behind it.
 *
 * The practice sandbox is reached from the campaign, and the tutorial's cold open is fought
 * before there is anywhere else to be — so both land where a player would expect to be put
 * down rather than where the fight was technically opened.
 */
function screenForMode(mode: string): ScreenId {
  switch (mode) {
    case 'arena':
      return 'arena';
    case 'dungeon':
    case 'springs':
    case 'proving':
      return 'depths';
    case 'titan':
      return 'titan';
    case 'trial':
      return 'trials';
    case 'worldBoss':
      return 'worldBoss';
    case 'deepRun':
      return 'deepRun';
    case 'spire':
      return 'spire';
    case 'tutorial':
      return 'haven';
    default:
      return 'campaign';
  }
}

/**
 * Which screen is on, as a lookup rather than a chain of twenty ternaries.
 *
 * It *was* the chain, and it was the thing the "add more stuff must stay cheap" rule was
 * written against: every mode C10 and C11 added meant one more `: screen === 'x' ? (` in
 * the middle of the shell, and a screen registered but not branched showed the placeholder
 * — which is exactly how `settings` sat in the registry for nine phases unreachable.
 *
 * The three hubs share one component and are matched by `isHub`, so a fourth hub is a
 * registry entry and nothing here.
 */
const SCREEN_VIEWS: Partial<Record<ScreenId, () => JSX.Element>> = {
  campaign: CampaignScreen,
  depths: DepthsScreen,
  titan: TitanScreen,
  worldBoss: WorldBossScreen,
  deepRun: DeepRunScreen,
  spire: SpireScreen,
  trials: TrialsScreen,
  expeditions: ExpeditionsScreen,
  wardens: WardensScreen,
  arena: ArenaScreen,
  battle: BattleScreen,
  champions: ChampionsScreen,
  relics: RelicsScreen,
  bazaar: BazaarScreen,
  mistgate: MistgateScreen,
  chronicle: ChronicleScreen,
  quests: QuestsScreen,
  missions: MissionsScreen,
  events: EventsScreen,
  valePass: PassScreen,
  calendar: CalendarScreen,
  mail: MailScreen,
};

function ScreenView({
  screen,
  onNavigate,
}: {
  screen: ScreenId;
  onNavigate: (id: ScreenId) => void;
}): JSX.Element | null {
  if (screen === 'haven') return <HavenScreen onNavigate={onNavigate} />;
  if (isHub(screen)) return <HubScreen hub={screen} onNavigate={onNavigate} />;
  const View = SCREEN_VIEWS[screen];
  if (View) return <View />;
  const definition = SCREENS.find((entry) => entry.id === screen);
  return definition ? <PlaceholderScreen screen={definition} /> : null;
}

/** The signed-in game shell: resource bar, current screen, navigation dock. */
function GameShell() {
  const screen = useNavStore((state) => state.screen);
  const setScreen = useNavStore((state) => state.setScreen);
  const account = useSessionStore((state) => state.account);
  const level = usePlayerStore((state) => state.player?.level ?? null);
  const observeUnlocks = useUnlockStore((state) => state.observe);
  const adoptLoadout = useLoadoutStore((state) => state.adopt);
  const loadTutorial = useTutorialStore((state) => state.load);
  const refreshTutorial = useTutorialStore((state) => state.refresh);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);

  const navigate = useCallback((id: ScreenId) => setScreen(id), [setScreen]);

  useEffect(() => {
    void loadTutorial();
  }, [loadTutorial]);

  // Every gate the account has crossed since this browser last looked. The shell re-reads
  // the player snapshot after every action, so a level-up lands here within a request of
  // happening — and the store seeds silently the first time it sees an account, because
  // somebody returning at level 30 is not owed a parade for last month's unlocks.
  useEffect(() => {
    if (account && level !== null) observeUnlocks(account.id, level);
  }, [account, level, observeUnlocks]);

  // The team this account last sent, and how it likes to watch a fight. Read once per
  // sign-in rather than per battle, so the first stage of the evening opens already filled.
  useEffect(() => {
    if (account) adoptLoadout(account.id);
  }, [account, adoptLoadout]);

  /**
   * A fight that is still open, picked back up.
   *
   * This is the one piece of navigation the shell does on the player's behalf, and it is
   * here because of how badly the alternative failed. Which screen you are on is a value in
   * a store, not a URL — so a reload always lands on the Haven. `BattleScreen` asks to
   * resume when it mounts, but after a reload it never mounts, so nothing ever asked. The
   * session stayed `active` forever and every later start answered "You are already in a
   * battle", about a fight the player had no way to reach, finish or retreat from. It took
   * an operator resetting the account.
   *
   * Resuming rather than discarding, because the fight is real: the energy is spent, the
   * board is stored, and the server can hand back exactly where it stopped. Losing it would
   * be charging somebody for a battle and then deleting it.
   *
   * Once per sign-in, and only from a resting screen — `setScreen` is a no-op onto the
   * screen you are already on, but reading the guard out loud is what stops this ever
   * yanking somebody out of what they are doing.
   */
  const resumeBattle = useBattleStore((state) => state.resume);
  const enterFrom = useNavStore((state) => state.enterFrom);
  useEffect(() => {
    if (!account) return;
    void resumeBattle().then(() => {
      const { battle } = useBattleStore.getState();
      if (battle?.status !== 'active') return;
      if (useNavStore.getState().screen !== 'haven') return;
      // Entered *from* the room the fight belongs to, so the results panel's "Back to the
      // campaign" goes to the campaign. A reload has no history to remember, and the fight
      // itself is the only thing that knows where it came from.
      enterFrom('battle', screenForMode(battle.mode));
    });
  }, [account, resumeBattle, enterFrom]);

  // A step's goal is completed by *doing the thing*, and the module that did it reports to
  // the server rather than to the overlay. Re-reading on every screen change is what turns
  // "you cleared the stage" into a Continue button lighting up, and it is cheap: one small
  // GET at the moment the player has just finished doing something.
  useEffect(() => {
    void refreshTutorial();
  }, [screen, refreshTutorial]);

  // Number keys jump between dock slots.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      const slot = Number.parseInt(event.key, 10);
      if (!Number.isInteger(slot) || slot < 1 || slot > DOCK_SCREENS.length) return;

      const destination = DOCK_SCREENS[slot - 1];
      if (destination && isScreenUnlocked(destination, usePlayerStore.getState().unlocks)) {
        setScreen(destination.id);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setScreen]);

  const definition = SCREENS.find((entry) => entry.id === screen);

  return (
    <>
      <div className={styles.shell}>
        {/* The bar reads the same roster the screens do — C5 gave it the account's power,
            which is the four strongest champions added together — so it needs the same net.
            Without one it sat outside the screen's boundary and a single malformed roster
            response took the whole frame down, dock included, which is the exact failure the
            boundary below was added to prevent. Reset rather than keyed, so walking to
            another room clears it without rebuilding the bar on every navigation. */}
        <ErrorBoundary area="top bar" variant="quiet" resetKey={screen}>
          <TopBar
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenMail={() => navigate('mail')}
            onOpenNews={() => setNewsOpen(true)}
          />
        </ErrorBoundary>

        {/* The width the screen asks for, off the registry — see `App.module.scss`. A
            screen that says nothing gets the everyday column. */}
        <main className={styles.content} data-width={definition?.width ?? 'default'}>
          {/* Keyed by screen so walking to another room clears a failure rather than
              carrying it. A screen that throws leaves the dock and the top bar alive,
              which is the difference between "this room is broken" and "the game is". */}
          <ErrorBoundary key={screen} area={definition?.label ?? screen}>
            <ScreenView screen={screen} onNavigate={navigate} />
          </ErrorBoundary>
        </main>

        {/* Inside the frame rather than over the viewport, which is the whole of how it
            knows where to sit: it hangs from the top of the content box, so it clears the
            top bar at whatever height the bar happens to be — and the bar's height is
            content, since the player chip grew with C15 and would again. */}
        <UnlockBanner />

        {/* A fight takes the whole screen: leaving it is a deliberate act, not a tab away. */}
        {screen !== 'battle' && <Dock current={dockSlotFor(screen)} onNavigate={navigate} />}
      </div>

      {/* Under the modals and over the screens: a wipe belongs to the navigation, not to
          whatever dialog happens to be open across it. */}
      <ScreenWipe />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewsPanel open={newsOpen} onClose={() => setNewsOpen(false)} />
      <ProfilePanel />
      <TutorialOverlay />
    </>
  );
}
