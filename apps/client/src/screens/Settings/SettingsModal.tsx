import { useState } from 'react';
import { ROUTES, type PlayerSettings } from '@mistvale/shared';
import { Modal } from '@/ui/Modal/Modal';
import { Button } from '@/ui/Button/Button';
import { TextField } from '@/ui/TextField/TextField';
import { usePlayerStore } from '@/state/playerStore';
import { useSessionStore } from '@/state/sessionStore';
import { api, ApiRequestError } from '@/api/client';
import { toast } from '@/state/uiStore';
import styles from './SettingsModal.module.scss';

/**
 * Settings: audio, motion and accessibility preferences, plus the password change.
 *
 * Preferences persist server-side so they follow the player between devices; each
 * control writes immediately rather than hiding behind a Save button.
 */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = usePlayerStore((state) => state.settings);
  const updateSettings = usePlayerStore((state) => state.updateSettings);
  const account = useSessionStore((state) => state.account);

  const [tab, setTab] = useState<'preferences' | 'account'>('preferences');

  async function patch(change: Partial<PlayerSettings>) {
    try {
      await updateSettings(change);
    } catch (error) {
      const message =
        error instanceof ApiRequestError ? error.message : 'Could not save that setting.';
      toast.error(message, error instanceof ApiRequestError ? error.requestId : undefined);
    }
  }

  return (
    <Modal open={open} title="Settings" onClose={onClose} width={520}>
      <div className={styles.tabs} role="tablist" aria-label="Settings sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preferences'}
          className={`${styles.tab} ${tab === 'preferences' ? styles.tabActive : ''}`}
          onClick={() => setTab('preferences')}
        >
          Preferences
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'account'}
          className={`${styles.tab} ${tab === 'account' ? styles.tabActive : ''}`}
          onClick={() => setTab('account')}
        >
          Account
        </button>
      </div>

      {tab === 'preferences' ? (
        <div className={styles.section}>
          {/* This used to say there was no soundtrack, which was true and worth saying while
              the music bus was a fader with nothing behind it. There are two tracks now, so
              the sentence had to go. */}
          <SliderRow
            label="Music"
            description="The soundtrack — one theme for the Vale, another for a fight."
            value={settings.musicVolume}
            onChange={(musicVolume) => void patch({ musicVolume })}
          />
          <SliderRow
            label="Sound effects"
            description="Interface, battle and rewards."
            value={settings.sfxVolume}
            onChange={(sfxVolume) => void patch({ sfxVolume })}
          />
          {/* Its own fader rather than a share of the effects one: a click wants to be
              barely there, a voice telling you what to press wants to be heard over the
              music, and it is the control somebody reaches for the moment a narrator starts
              talking. Under "sound effects" it is the control they never find. */}
          <SliderRow
            label="Voice"
            description="The Wardenmaster, and anyone who speaks after him."
            value={settings.voiceVolume}
            onChange={(voiceVolume) => void patch({ voiceVolume })}
          />

          <ToggleRow
            label="Reduce motion"
            description="Trims interface animation. Champions keep breathing."
            checked={settings.reducedMotion}
            onChange={(reducedMotion) => void patch({ reducedMotion })}
          />
          <ToggleRow
            label="Colour-blind element glyphs"
            description="Adds a shape to every element indicator, not just a colour."
            checked={settings.colorblindGlyphs}
            onChange={(colorblindGlyphs) => void patch({ colorblindGlyphs })}
          />
          <ToggleRow
            label="Simple battlefield"
            description="Draws battles without the graphics card. Turn this on if a fight looks empty or half-drawn."
            checked={settings.simpleBattlefield}
            onChange={(simpleBattlefield) => void patch({ simpleBattlefield })}
          />
          <ToggleRow
            label="Skip result flourishes"
            description="Jumps straight to battle results."
            checked={settings.fastResults}
            onChange={(fastResults) => void patch({ fastResults })}
          />

          <div className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.rowLabel}>Default battle speed</span>
              <span className={styles.rowDescription}>Used when a battle starts.</span>
            </div>
            <div className={styles.speedGroup}>
              {([1, 2] as const).map((speed) => (
                <Button
                  key={speed}
                  size="sm"
                  variant={settings.battleSpeed === speed ? 'primary' : 'secondary'}
                  onClick={() => void patch({ battleSpeed: speed })}
                >
                  ×{speed}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <AccountSection accountName={account?.accountName ?? ''} />
      )}

      <footer className={styles.credits}>
        Icons from game-icons.net (CC BY 3.0). UI frames by Kenney (CC0).
      </footer>
    </Modal>
  );
}

function SliderRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {description && <span className={styles.rowDescription}>{description}</span>}
      </div>
      <div className={styles.sliderWrap}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={styles.slider}
          aria-label={label}
        />
        <span className={styles.sliderValue}>{Math.round(value * 100)}%</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.rowDescription}>{description}</span>
      </div>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function AccountSection({ accountName }: { accountName: string }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(undefined);
    setBusy(true);
    try {
      await api.post(ROUTES.auth.changePassword, { currentPassword, newPassword });
      // Every session was revoked server-side, so a fresh sign-in is required.
      toast.success('Password changed. Please sign in again.');
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Could not change the password.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowLabel}>Account name</span>
          <span className={styles.rowDescription}>{accountName}</span>
        </div>
      </div>

      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        error={error}
        hint="Changing your password signs you out everywhere."
      />
      <Button
        variant="primary"
        onClick={() => void submit()}
        loading={busy}
        disabled={!currentPassword || !newPassword}
      >
        Change password
      </Button>
    </div>
  );
}
