import { useState, type FormEvent } from 'react';
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
import { Heading } from '@/ui/Heading/Heading';
import { Panel } from '@/ui/Panel/Panel';
import { TextField } from '@/ui/TextField/TextField';
import { useSessionStore } from '@/state/sessionStore';
import { ApiRequestError } from '@/api/client';
import { toast } from '@/state/uiStore';
import styles from './AuthScreen.module.scss';

type AuthMode = 'login' | 'register';

/**
 * Sign in / create account.
 *
 * Mistvale has no e-mail anywhere: an account is a name, a password, and the profile
 * name other players see. Password recovery is handled by an admin, which the form
 * states plainly so nobody waits for a reset mail that will never come.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [accountName, setAccountName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submitting = useSessionStore((state) => state.submitting);
  const login = useSessionStore((state) => state.login);
  const register = useSessionStore((state) => state.register);

  function switchMode(next: AuthMode) {
    setMode(next);
    setFieldErrors({});
    setPassword('');
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
      <Heading tagline="The mist keeps what it takes. Call it back.">Mistvale</Heading>

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
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
            minLength={isRegister ? PASSWORD_MIN : 1}
            error={fieldErrors.password}
            hint={isRegister ? `At least ${PASSWORD_MIN} characters.` : undefined}
          />

          <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
            {isRegister ? 'Take up the lantern' : 'Enter the vale'}
          </Button>
        </form>

        <p className={styles.note}>
          Mistvale never asks for an e-mail address. If you lose your password, an admin can reset
          it for you.
        </p>
      </Panel>
    </div>
  );
}
