import { useCallback, useEffect, useState } from 'react';
import { PixiStage } from '@/game/PixiStage';
import { useAudio } from '@/audio/useAudio';
import { usePreferences } from './usePreferences';
import { ToastHost } from '@/ui/Toast/Toast';
import { AuthScreen } from '@/screens/Auth/AuthScreen';
import { HavenScreen } from '@/screens/Haven/HavenScreen';
import { CampaignScreen } from '@/screens/Campaign/CampaignScreen';
import { BattleScreen } from '@/screens/Battle/BattleScreen';
import { DepthsScreen } from '@/screens/Depths/DepthsScreen';
import { ArenaScreen } from '@/screens/Arena/ArenaScreen';
import { QuestsScreen } from '@/screens/Quests/QuestsScreen';
import { MissionsScreen } from '@/screens/Missions/MissionsScreen';
import { EventsScreen } from '@/screens/Events/EventsScreen';
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
import { DOCK_SCREENS, SCREENS, isScreenUnlocked, type ScreenId } from './screens';
import { useNavStore } from '@/state/navStore';
import { useTutorialStore } from '@/state/tutorialStore';
import { useUnlockStore } from '@/state/unlockStore';
import { TopBar } from './TopBar';
import { TutorialOverlay } from './TutorialOverlay';
import { ErrorBoundary } from './ErrorBoundary';
import { ScreenWipe } from './ScreenWipe';
import { UnlockCelebration } from './UnlockCelebration';
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
  const resetPlayer = usePlayerStore((state) => state.reset);

  const ensureContent = useContentStore((state) => state.ensureLoaded);

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
      resetPlayer();
      // The next account gets its own script, not this one's step 7.
      useTutorialStore.getState().reset();
      useUnlockStore.getState().reset();
    }
  }, [status, refreshPlayer, resetPlayer]);

  // The Pixi stage is mounted once, outside every branch below. It used to appear in
  // each of them, so signing in unmounted one and mounted another — and `PixiStage`'s
  // cleanup destroys the *shared* Application and removes its canvas from the DOM, so
  // every auth transition threw away a WebGL context and built a new one.
  const backdrop = <PixiStage scene="mist" />;

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

/** The signed-in game shell: resource bar, current screen, navigation dock. */
function GameShell() {
  const screen = useNavStore((state) => state.screen);
  const setScreen = useNavStore((state) => state.setScreen);
  const account = useSessionStore((state) => state.account);
  const level = usePlayerStore((state) => state.player?.level ?? null);
  const observeUnlocks = useUnlockStore((state) => state.observe);
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
        <TopBar
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenMail={() => navigate('mail')}
          onOpenNews={() => setNewsOpen(true)}
        />

        <main className={styles.content}>
          {/* Keyed by screen so walking to another room clears a failure rather than
              carrying it. A screen that throws leaves the dock and the top bar alive,
              which is the difference between "this room is broken" and "the game is". */}
          <ErrorBoundary key={screen} area={definition?.label ?? screen}>
            {screen === 'haven' ? (
              <HavenScreen onNavigate={navigate} />
            ) : screen === 'campaign' ? (
              <CampaignScreen />
            ) : screen === 'depths' ? (
              <DepthsScreen />
            ) : screen === 'arena' ? (
              <ArenaScreen />
            ) : screen === 'battle' ? (
              <BattleScreen />
            ) : screen === 'champions' ? (
              <ChampionsScreen />
            ) : screen === 'relics' ? (
              <RelicsScreen />
            ) : screen === 'bazaar' ? (
              <BazaarScreen />
            ) : screen === 'mistgate' ? (
              <MistgateScreen />
            ) : screen === 'chronicle' ? (
              <ChronicleScreen />
            ) : screen === 'quests' ? (
              <QuestsScreen />
            ) : screen === 'missions' ? (
              <MissionsScreen />
            ) : screen === 'events' ? (
              <EventsScreen />
            ) : screen === 'calendar' ? (
              <CalendarScreen />
            ) : screen === 'mail' ? (
              <MailScreen />
            ) : definition ? (
              <PlaceholderScreen screen={definition} />
            ) : null}
          </ErrorBoundary>
        </main>

        {/* A fight takes the whole screen: leaving it is a deliberate act, not a tab away. */}
        {screen !== 'battle' && <Dock current={screen} onNavigate={navigate} />}
      </div>

      {/* Under the modals and over the screens: a wipe belongs to the navigation, not to
          whatever dialog happens to be open across it. */}
      <ScreenWipe />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewsPanel open={newsOpen} onClose={() => setNewsOpen(false)} />
      <ProfilePanel />
      <TutorialOverlay />
      <UnlockCelebration />
    </>
  );
}
