import { useEffect, useState, type FormEvent } from 'react';
import {
  ACCOUNT_NAME_MAX,
  ACCOUNT_NAME_MIN,
  PASSWORD_MIN,
  PROFILE_NAME_MAX,
  PROFILE_NAME_MIN,
} from '@mistvale/shared';
import { SegmentedControl } from '@/fui/components/SegmentedControl.ts';
import { Fui } from '@/fui/react';
import { Button } from '@/ui/Button/Button';
import { Panel } from '@/ui/Panel/Panel';
import { TextField } from '@/ui/TextField/TextField';
import { useSessionStore } from '@/state/sessionStore';
import { ApiRequestError } from '@/api/client';
import { toast } from '@/state/uiStore';
import styles from './AuthScreen.module.scss';

type AuthMode = 'login' | 'register';

/**
 * The title screen.
 *
 * It is the first thing anybody sees and for nine phases it was a 420px form floating in a
 * dark brown void — correct, accessible, and unmistakably a web page. What it is now is the
 * shape this genre has settled on for a reason: painted key art across the whole window, the
 * game's name over it at a size that means something, and the form as a small panel low in
 * the composition. The art does the work; the panel just has to be legible on top of it.
 *
 * Three things about how it is built are worth carrying:
 *
 * **The backdrop is a static asset rather than content.** Everything else in Mistvale that
 * a player looks at comes out of the database, and this deliberately does not: it is drawn
 * *before* anybody is signed in, so there is no session, no content bundle and nothing to
 * read a key off. It is published by `pnpm assets` like the sprites are (`/scenery`), which
 * is also what keeps it affordable — the master is 2752×1536 and 2.7 MB, and what ships is
 * 1600px and 244 KB.
 *
 * **The screen owns its own backdrop.** `PixiStage` is mounted once at the root and its
 * wrapper is opaque, so the art has to sit above it rather than behind. That is why the
 * scene is a layer inside this screen rather than a change to the shared stage: the mist
 * belongs to the game and this belongs to the door.
 *
 * **Mistvale has no e-mail**, so the account name is the only handle a returning player
 * has and there is no reset link to fall back on. Hence the two conveniences that would be
 * decoration anywhere else and are not here: the last account name is remembered, and the
 * password can be shown, because typing one blind with no way to recover it is a trap.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [accountName, setAccountName] = useState(() => rememberedAccount());
  const [profileName, setProfileName] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [artLoaded, setArtLoaded] = useState(false);

  const submitting = useSessionStore((state) => state.submitting);
  const login = useSessionStore((state) => state.login);
  const register = useSessionStore((state) => state.register);

  // Faded in rather than popped in. The picture is a quarter of a megabyte, and on a cold
  // visit the difference between "appears" and "arrives" is the whole first impression.
  useEffect(() => {
    const image = new Image();
    image.onload = () => setArtLoaded(true);
    image.src = SCENERY;
    return () => {
      image.onload = null;
    };
  }, []);

  function switchMode(next: AuthMode) {
    setMode(next);
    setFieldErrors({});
    setPassword('');
    setReveal(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});

    try {
      if (mode === 'login') {
        await login({ accountName: accountName.trim(), password });
      } else {
        await register({
          accountName: accountName.trim(),
          profileName: profileName.trim(),
          password,
        });
        toast.success(`Welcome to the vale, ${profileName.trim()}.`);
      }
      rememberAccount(accountName.trim());
    } catch (error) {
      if (!(error instanceof ApiRequestError)) throw error;

      if (error.code === 'VALIDATION') {
        setFieldErrors(error.fieldErrors);
        return;
      }
      if (error.code === 'ALREADY_EXISTS') {
        // The server names the offending field so we can mark it inline.
        const field =
          typeof error.details === 'object' && error.details !== null && 'field' in error.details
            ? String((error.details as { field: unknown }).field)
            : 'accountName';
        setFieldErrors({ [field]: error.message });
        return;
      }
      if (error.code === 'INVALID_CREDENTIALS') {
        setFieldErrors({ password: error.message });
        return;
      }
      toast.error(error.message, error.requestId);
    }
  }

  const isRegister = mode === 'register';

  return (
    <div className={styles.screen}>
      {/* The vale, behind everything. `aria-hidden` because it says nothing a player needs
          read to them, and `role="presentation"` would still leave the alt-less image in
          some trees. */}
      <div className={styles.scene} aria-hidden="true">
        <div
          className={`${styles.art} ${artLoaded ? styles.shown : ''}`}
          style={{ backgroundImage: `url("${SCENERY}")` }}
        />
        <div className={styles.fog} />
        <div className={styles.vignette} />
      </div>

      <div className={styles.stage}>
        <header className={styles.brand}>
          <h1 className={styles.wordmark}>Mistvale</h1>
          <p className={styles.tagline}>The mist keeps what it takes. Call it back.</p>
          <div className={styles.rule} aria-hidden="true">
            <span className={styles.diamond} />
          </div>
        </header>

        <Panel variant="hero" className={styles.card}>
          <Fui
            of={SegmentedControl}
            className={styles.tabs}
            attrs={{ 'aria-label': 'Account' }}
            options={{
              block: true,
              value: mode,
              segments: [
                { value: 'login', label: 'Sign in' },
                { value: 'register', label: 'New warden' },
              ],
            }}
            on={{ 'segment:change': (value) => switchMode(value as AuthMode) }}
          />

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <TextField
              label="Account name"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              autoComplete="username"
              autoFocus
              required
              minLength={ACCOUNT_NAME_MIN}
              maxLength={ACCOUNT_NAME_MAX}
              error={fieldErrors.accountName}
              hint={isRegister ? 'Used to sign in. Letters, numbers, - and _.' : undefined}
            />

            {isRegister && (
              <TextField
                label="Profile name"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                autoComplete="nickname"
                required
                minLength={PROFILE_NAME_MIN}
                maxLength={PROFILE_NAME_MAX}
                error={fieldErrors.profileName}
                hint="The name other wardens see."
              />
            )}

            <TextField
              label="Password"
              type={reveal ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
              onBlur={() => setCapsLock(false)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={isRegister ? PASSWORD_MIN : 1}
              error={fieldErrors.password}
              hint={
                capsLock
                  ? 'Caps Lock is on.'
                  : isRegister
                    ? `At least ${PASSWORD_MIN} characters.`
                    : undefined
              }
              action={
                <button
                  type="button"
                  className={styles.reveal}
                  onClick={() => setReveal((shown) => !shown)}
                  // Worded rather than an eye: the two eye glyphs every site uses mean
                  // opposite things on different sites, and the brief takes icons only from
                  // game-icons.net, where the nearest is a debuff.
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                  aria-pressed={reveal}
                >
                  {reveal ? 'Hide' : 'Show'}
                </button>
              }
            />

            <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
              {isRegister ? 'Take up the lantern' : 'Enter the vale'}
            </Button>
          </form>
        </Panel>
      </div>

      <footer className={styles.foot}>
        <span className={styles.build}>v{__MISTVALE_VERSION__}</span>
        <span className={styles.note}>
          No e-mail, ever. A forgotten password is reset by an admin.
        </span>
      </footer>
    </div>
  );
}

/** Published by `pnpm assets` from `assets/ui/backgrounds/haven_bgs/`. */
const SCENERY = '/scenery/haven_campaign.jpg';

const REMEMBERED = 'mistvale.lastAccount';

/**
 * The account name this browser signed in with last.
 *
 * Only the *name* — never the password, and never a token, both of which belong to the
 * session cookie the server sets. It is a convenience on a game with no e-mail address to
 * fall back on, and it is wrapped because storage throws outright in a browser configured
 * to block it, which must not take the login screen down with it.
 */
function rememberedAccount(): string {
  try {
    return window.localStorage.getItem(REMEMBERED) ?? '';
  } catch {
    return '';
  }
}

function rememberAccount(name: string): void {
  try {
    window.localStorage.setItem(REMEMBERED, name);
  } catch {
    // A browser that will not store it is a browser that types it again. Not an error.
  }
}
