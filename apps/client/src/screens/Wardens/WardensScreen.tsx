import { useEffect, useMemo, useState } from 'react';
import type { ChampionDef, WardenSummary } from '@mistvale/shared';
import { Button } from '@/ui/Button/Button';
import { Empty } from '@/ui/Empty/Empty';
import { Heading } from '@/ui/Heading/Heading';
import { Panel } from '@/ui/Panel/Panel';
import { ScreenInfo } from '@/ui/ScreenInfo/ScreenInfo';
import { TextField } from '@/ui/TextField/TextField';
import { ChampionCard } from '@/ui/ChampionCard/ChampionCard';
import { Modal } from '@/ui/Modal/Modal';
import { championArt, type ChampionArtAsset } from '@/ui/championArt';
import { Portrait } from '@/ui/Portrait/Portrait';
import { useContentStore } from '@/state/contentStore';
import { useRosterStore } from '@/state/rosterStore';
import { useWarbandStore } from '@/state/warbandStore';
import { useProfileStore } from '@/state/profileStore';
import styles from './WardensScreen.module.scss';

/**
 * Wardens — the friends slice of Warbands (C37).
 *
 * The screen has two halves and they are the same idea from opposite ends: **the wardens
 * you keep**, each with the champion they have put forward, and **the champion you put
 * forward** for anybody keeping you. There is no third half, because there is no guild.
 *
 * The list is one-way and nobody is asked, so the screen never says "pending" or "request
 * sent" — a warden is kept the moment their name is typed. What makes that safe is the
 * nomination: nothing can be taken that was not offered, so consent is a thing somebody
 * *did* rather than a thing they were asked.
 *
 * Two facts about the borrow are on the screen rather than behind the **i**, because both
 * change what a player does next: how many borrows are left today, and — on each warden —
 * how much of a champion is actually being offered. A standard-bearer wearing nothing is a
 * row worth reading past.
 */

export function WardensScreen(): JSX.Element {
  const warband = useWarbandStore((store) => store.warband);
  const loading = useWarbandStore((store) => store.loading);
  const loaded = useWarbandStore((store) => store.loaded);
  const load = useWarbandStore((store) => store.load);
  const keep = useWarbandStore((store) => store.keep);
  const release = useWarbandStore((store) => store.release);
  const nominate = useWarbandStore((store) => store.nominate);

  const roster = useRosterStore((store) => store.champions);
  const loadRoster = useRosterStore((store) => store.load);
  const bundle = useContentStore((store) => store.bundle);
  const showProfile = useProfileStore((store) => store.show);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    void load();
    void loadRoster();
  }, [load, loadRoster]);

  const defs = useMemo(
    () => new Map((bundle?.champions ?? []).map((def) => [def.key, def])),
    [bundle],
  );

  const mine = useMemo(
    () => roster.find((champion) => champion.id === warband.standardBearerId) ?? null,
    [roster, warband.standardBearerId],
  );

  const act = async (run: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <Heading
        tagline="Keep other wardens, and lend one champion a day."
        actions={
          <ScreenInfo title="Wardens">
            <p>
              A list of wardens is one-way: you keep whoever you like, and nobody is asked or told.
              What makes that safe is that nothing can be taken which was not offered — each warden
              puts <strong>one champion</strong> forward, and only that one may be borrowed.
            </p>
            <p>
              You may take one warden’s champion into a fight{' '}
              <strong>
                {warband.borrowsPerDay === 1 ? 'once' : `${warband.borrowsPerDay} times`}
              </strong>{' '}
              a day. They fight at their owner’s level, in their owner’s relics, and take one of
              your four slots rather than adding a fifth.
            </p>
            <p>
              Not everywhere: the Arena, the Wurm, the Mistspire, a Titan, a trial and the Sunken
              Stair each ask a question a borrowed champion would answer for you.
            </p>
            <p>Lending pays nothing but the count on your card. That is the design.</p>
          </ScreenInfo>
        }
      >
        Wardens
      </Heading>

      {error && <p className={styles.error}>{error}</p>}

      <Panel title="What you offer">
        <div className={styles.offer}>
          {mine ? (
            <ChampionCard
              champion={mine}
              def={defs.get(mine.championKey)}
              onOpen={() => setChoosing(true)}
              size={132}
            />
          ) : (
            <div className={styles.noOffer}>
              <p>You have put nobody forward.</p>
            </div>
          )}
          <div className={styles.offerText}>
            <p className={styles.lends}>
              Fielded by others <strong>{warband.lends}</strong>{' '}
              {warband.lends === 1 ? 'time' : 'times'}
            </p>
            <p className={styles.note}>
              Anybody keeping you may take this champion into one fight a day. They fight at your
              level, in your relics, with your masteries — so a champion worth borrowing is one you
              have actually built.
            </p>
            <div className={styles.offerActions}>
              <Button onClick={() => setChoosing(true)} disabled={busy || roster.length === 0}>
                {mine ? 'Put somebody else forward' : 'Put a champion forward'}
              </Button>
              {mine && (
                <Button
                  variant="ghost"
                  onClick={() => void act(() => nominate(null))}
                  disabled={busy}
                >
                  Withdraw
                </Button>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Your wardens"
        actions={
          <span className={styles.counts}>
            {warband.wardens.length} of {warband.capacity} · {warband.borrowsLeft} of{' '}
            {warband.borrowsPerDay} {warband.borrowsPerDay === 1 ? 'borrow' : 'borrows'} left today
          </span>
        }
      >
        <form
          className={styles.add}
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            void act(async () => {
              await keep(trimmed);
              setName('');
            });
          }}
        >
          <TextField
            label="Warden’s name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Their profile name"
            maxLength={16}
          />
          <Button type="submit" disabled={busy || name.trim().length === 0}>
            Keep
          </Button>
        </form>

        {loading && !loaded ? (
          <p className={styles.note}>Reading your list…</p>
        ) : warband.wardens.length === 0 ? (
          <Empty
            title="Nobody yet"
            message="Type a warden’s profile name above. You will find names on the Arena ladder and in the Hall of Valor."
          />
        ) : (
          <ul className={styles.list}>
            {warband.wardens.map((warden) => (
              <WardenRow
                key={warden.playerId}
                warden={warden}
                def={
                  warden.standardBearer ? defs.get(warden.standardBearer.championKey) : undefined
                }
                assets={bundle?.assets}
                busy={busy}
                onOpen={() => void showProfile(warden.playerId)}
                onRelease={() => void act(() => release(warden.playerId))}
              />
            ))}
          </ul>
        )}
      </Panel>

      <Modal
        open={choosing}
        onClose={() => setChoosing(false)}
        title="Put a champion forward"
        size="wide"
      >
        <p className={styles.note}>
          Whoever keeps you may take this one into a fight. Food cannot be offered — there is
          nothing to lend.
        </p>
        <div className={styles.picker}>
          {roster
            .filter((champion) => !defs.get(champion.championKey)?.isFood)
            .map((champion) => (
              <ChampionCard
                key={champion.id}
                champion={champion}
                def={defs.get(champion.championKey)}
                selectable
                selected={champion.id === warband.standardBearerId}
                onOpen={() =>
                  void act(async () => {
                    await nominate(champion.id);
                    setChoosing(false);
                  })
                }
                size={132}
              />
            ))}
        </div>
      </Modal>
    </div>
  );
}

function WardenRow({
  warden,
  def,
  assets,
  busy,
  onOpen,
  onRelease,
}: {
  warden: WardenSummary;
  def: ChampionDef | undefined;
  assets: readonly ChampionArtAsset[] | undefined;
  busy: boolean;
  onOpen: () => void;
  onRelease: () => void;
}): JSX.Element {
  const bearer = warden.standardBearer;
  // The same portrait the profile card draws, at row size. Only a real avatar is shown:
  // a painted stand-in belongs on a card, and in a list it would read as art nobody chose.
  const portrait = def ? (championArt(def, assets).portrait ?? null) : null;

  return (
    <li className={styles.row}>
      <button type="button" className={styles.who} onClick={onOpen}>
        <span className={styles.name}>{warden.profileName}</span>
        <span className={styles.level}>Level {warden.level}</span>
        {warden.title && <span className={styles.title}>{warden.title}</span>}
      </button>

      <div className={styles.bearer}>
        {bearer ? (
          <>
            <Portrait src={portrait} name={def?.name ?? bearer.championKey} size={44} />
            <div>
              <p className={styles.bearerName}>{def?.name ?? bearer.championKey}</p>
              <p className={styles.bearerFacts}>
                ★{bearer.rank} · level {bearer.level} · {bearer.power.toLocaleString()} power ·{' '}
                {/* The one figure that says whether a row is worth reading past: a champion
                    offered in nothing is offered at a fraction of what the name suggests. */}
                {bearer.relics} of 9 relics
              </p>
            </div>
          </>
        ) : (
          <p className={styles.bearerFacts}>Has put nobody forward.</p>
        )}
      </div>

      <div className={styles.rowActions}>
        <span className={styles.lendCount}>
          lent {warden.lends} {warden.lends === 1 ? 'time' : 'times'}
        </span>
        <Button variant="ghost" onClick={onRelease} disabled={busy}>
          Let go
        </Button>
      </div>
    </li>
  );
}
