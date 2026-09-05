import { useEffect, useMemo, useState } from 'react';
import type { DeepRunDoor, DeepRunState } from '@mistvale/shared';
import { Button } from '@/ui/Button/Button';
import { Empty } from '@/ui/Empty/Empty';
import { Heading } from '@/ui/Heading/Heading';
import { Modal } from '@/ui/Modal/Modal';
import { Panel } from '@/ui/Panel/Panel';
import { Portrait } from '@/ui/Portrait/Portrait';
import { Rewards } from '@/ui/Rewards/Rewards';
import { ScreenInfo } from '@/ui/ScreenInfo/ScreenInfo';
import { ChampionCard } from '@/ui/ChampionCard/ChampionCard';
import { championArt } from '@/ui/championArt';
import { Hero } from '@/ui/Hero/Hero';
import { Ladder } from '@/ui/Ladder/Ladder';
import { SCREENS } from '@/app/screens';
import { useContentStore } from '@/state/contentStore';
import { useDeepRunStore } from '@/state/deepRunStore';
import { useNavStore } from '@/state/navStore';
import { usePlayerStore } from '@/state/playerStore';
import { useRosterStore } from '@/state/rosterStore';
import styles from './DeepRunScreen.module.scss';

const MAX_PARTY = 4;

/** The Stair's painting — the one its card on the Battle hub wears, read off the registry. */
const STAIR_ART = SCREENS.find((screen) => screen.id === 'deepRun')?.art ?? 'hero-voidguard';

/**
 * The Sunken Stair.
 *
 * The screen is a drawing of a small state machine, and it draws exactly one state at a
 * time — the doors, or the boons, or the fight. What is always on it is the *cost*: who is
 * still standing and how hurt they are, because damage carrying between floors is the rule
 * the whole mode turns on and a party's health is the only thing a player is really
 * spending.
 *
 * The phase comes from the server rather than being inferred from which arrays are empty:
 * three near-identical emptiness checks on the client is how two of them end up disagreeing.
 */
export function DeepRunScreen(): JSX.Element {
  const view = useDeepRunStore((store) => store.view);
  const loaded = useDeepRunStore((store) => store.loaded);
  const loading = useDeepRunStore((store) => store.loading);
  const load = useDeepRunStore((store) => store.load);
  const begin = useDeepRunStore((store) => store.begin);
  const enter = useDeepRunStore((store) => store.enter);
  const takeBoon = useDeepRunStore((store) => store.takeBoon);
  const retire = useDeepRunStore((store) => store.retire);
  const outcome = useDeepRunStore((store) => store.outcome);
  const clearOutcome = useDeepRunStore((store) => store.clearOutcome);
  const refreshPlayer = usePlayerStore((store) => store.refresh);
  const goTo = useNavStore((store) => store.setScreen);
  const enterFrom = useNavStore((store) => store.enterFrom);

  const [picking, setPicking] = useState<DeepRunState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-read on mount: a descent survives a reload, and the floor the player left off on is
  // the thing they came back for.
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (run: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Stair would not have it.');
    } finally {
      setBusy(false);
    }
  };

  if (loaded && view.runs.length === 0) {
    return (
      <div className={styles.screen}>
        <Heading tagline="Twelve floors down, and your relics stay at the top of them.">
          The Sunken Stair
        </Heading>
        <Empty
          glyph="glyph-broken-shackle"
          title="The Stair is shut"
          message={
            loading
              ? 'Listening at the top step…'
              : 'No descent is open to you. The Stair takes wardens of level 20 and above.'
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <Heading
        tagline="Twelve floors down, and your relics stay at the top of them."
        actions={
          <ScreenInfo title="The Sunken Stair">
            {/* The Stair's own words first (C46) — they opened the panel as a paragraph
                above the way down, and the way down is the thing. */}
            {view.runs.map((run) => (
              <p key={run.runKey} className={styles.lore}>
                {run.lore}
              </p>
            ))}
            <Panel title="Nothing comes down with you">
              <p className={styles.note}>
                Your champions go down at their own levels and ranks, with{' '}
                <strong>none of their relics</strong>. What carries a party is the boons the Stair
                offers on the way — one after each room, chosen from three.
              </p>
            </Panel>
            <Panel title="What it costs">
              <p className={styles.note}>
                <strong>Damage carries between floors.</strong> A fight won badly is still a wound,
                which is what makes a quiet landing worth as much as a reliquary.
              </p>
              <p className={styles.note}>
                <strong>A champion who falls stays fallen</strong> for the rest of the descent.
                Nothing is lost outside it — your roster is untouched — but the party thins, and the
                last floors are fought with whatever is still standing.
              </p>
            </Panel>
            <Panel title="Walking out">
              <p className={styles.note}>
                A descent pays for the <strong>depth it reached</strong>, once, however it ended —
                carried out or walked out. Retiring on floor nine is worth exactly as much as dying
                on floor nine, so there is never a reason to throw a party away.
              </p>
            </Panel>
          </ScreenInfo>
        }
      >
        The Sunken Stair
      </Heading>

      {error && <p className={styles.error}>{error}</p>}

      {view.runs.map((run) =>
        run.phase === null ? (
          // Named only when there is more than one. The screen is a list and its title is
          // the registry's label, which today is the name of the only descent published —
          // so the panel said "The Sunken Stair" a hundred pixels under "THE SUNKEN STAIR",
          // with the identical sentence under both. The room stands in the frame with no
          // panel around it (C46): a frame inside the frame is the shape the audit named.
          <div key={run.runKey} className={styles.idle}>
            {/* The Stair as a place (C46): its painting, with the descents left and the way
                  down at its foot, and what each depth is worth as a ladder of tiles beside
                  it. It was a lore paragraph over a 1,300px-wide button. */}
            <Hero
              art={STAIR_ART}
              title={view.runs.length > 1 ? run.name : undefined}
              tagline={view.runs.length > 1 ? run.tagline : undefined}
              label={run.name}
              className={styles.hero}
            >
              <div className={styles.entry}>
                <dl className={styles.facts}>
                  <div>
                    <dt>Descents left today</dt>
                    <dd>
                      {run.runsLeft} / {run.runsPerDay}
                    </dd>
                  </div>
                  <div>
                    <dt>Floors</dt>
                    <dd>{run.floors}</dd>
                  </div>
                </dl>
                {run.blockedReason ? (
                  <p className={styles.blocked}>{run.blockedReason}</p>
                ) : (
                  <Button onClick={() => setPicking(run)} disabled={busy}>
                    Go down
                  </Button>
                )}
              </div>
            </Hero>

            <div className={styles.beside}>
              <LastDescent run={run} />
              <DepthLadder run={run} />
            </div>
          </div>
        ) : (
          <Panel
            key={run.runKey}
            {...(view.runs.length > 1 ? { title: run.name } : {})}
            variant="hero"
            className={styles.run}
          >
            {view.runs.length > 1 && <p className={styles.tagline}>{run.tagline}</p>}
            <div className={styles.descent}>
              <FloorHeader run={run} />
              <Party run={run} />
              <Held run={run} />

              {run.phase === 'choosingDoor' && (
                <section className={styles.doors} aria-label="The way down">
                  {run.doors.map((door) => (
                    <Door
                      key={door.roomKey}
                      door={door}
                      busy={busy}
                      onEnter={() =>
                        void act(async () => {
                          const battle = await enter(run.runKey, door.roomKey);
                          await refreshPlayer();
                          if (battle) {
                            enterFrom('battle', 'deepRun');
                            goTo('battle');
                          }
                        })
                      }
                    />
                  ))}
                </section>
              )}

              {run.phase === 'choosingBoon' && run.boonOffer.length > 0 && (
                <section className={styles.boons} aria-label="What the Stair offers">
                  <h3 className={styles.sectionTitle}>The Stair offers</h3>
                  <div className={styles.boonRow}>
                    {run.boonOffer.map((boon) => (
                      <button
                        key={boon.key}
                        type="button"
                        className={styles.boonCard}
                        data-rarity={boon.rarity}
                        disabled={busy}
                        onClick={() => void act(() => takeBoon(run.runKey, boon.key))}
                      >
                        <span className={styles.boonName}>{boon.name}</span>
                        <span className={styles.boonRarity}>{boon.rarity}</span>
                        <span className={styles.boonText}>{boon.description}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {run.phase === 'choosingBoon' && run.boonOffer.length === 0 && (
                <p className={styles.note}>
                  There is no thirteenth step. Walk out and take what the descent was worth.
                </p>
              )}

              {run.phase === 'inBattle' && (
                <div className={styles.resume}>
                  <p className={styles.note}>A fight is under way on this floor.</p>
                  <Button
                    onClick={() => {
                      enterFrom('battle', 'deepRun');
                      goTo('battle');
                    }}
                  >
                    Back to the fight
                  </Button>
                </div>
              )}

              <div className={styles.retire}>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await retire(run.runKey);
                      await refreshPlayer();
                    })
                  }
                >
                  Walk out
                </Button>
                <span className={styles.retireNote}>
                  Paid for the depth reached, exactly as being carried out would be.
                </span>
              </div>

              <DepthLadder run={run} />
            </div>
          </Panel>
        ),
      )}

      {picking && (
        <PartyPicker
          run={picking}
          onClose={() => setPicking(null)}
          onSend={(ids) =>
            void act(async () => {
              await begin(picking.runKey, ids);
              setPicking(null);
            })
          }
        />
      )}

      {outcome && (
        <Modal open title="Back up the Stair" onClose={clearOutcome}>
          <div className={styles.outcome}>
            <p className={styles.outcomeFloor}>
              {outcome.completed
                ? 'The bottom step, and back up again.'
                : `As far as floor ${outcome.floor}.`}
            </p>
            {outcome.tierName && <p className={styles.outcomeTier}>{outcome.tierName}</p>}
            {Object.keys(outcome.rewards).length > 0 ? (
              <Rewards rewards={outcome.rewards} signed />
            ) : (
              <p className={styles.note}>Not deep enough for the Stair to pay anything.</p>
            )}
            <Button onClick={clearOutcome}>Done</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FloorHeader({ run }: { run: DeepRunState }): JSX.Element {
  return (
    <div className={styles.floor}>
      <span className={styles.floorNumber}>
        Floor {run.floor} <span className={styles.floorOf}>of {run.floors}</span>
      </span>
      <div className={styles.floorTrack} aria-hidden="true">
        <div
          className={styles.floorFill}
          style={{ width: `${Math.min(100, (run.floor / run.floors) * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Who is still standing, and how hurt. The only running cost the mode has. */
function Party({ run }: { run: DeepRunState }): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  return (
    <ul className={styles.party} aria-label="The party">
      {run.party.map((member) => {
        const def = bundle?.champions.find((entry) => entry.key === member.championKey);
        return (
          <li
            key={member.championId}
            className={styles.member}
            data-down={member.alive ? 'no' : 'yes'}
          >
            <Portrait
              src={def ? (championArt(def, bundle?.assets).portrait ?? null) : null}
              name={member.name}
              size={40}
            />
            <span className={styles.memberName}>{member.name}</span>
            {member.alive ? (
              <span className={styles.memberBar} aria-label={`${Math.round(member.hpPct)}% health`}>
                <span className={styles.memberFill} style={{ width: `${member.hpPct}%` }} />
              </span>
            ) : (
              <span className={styles.memberDown}>Fallen</span>
            )}
            {member.alive && <span className={styles.memberPct}>{Math.round(member.hpPct)}%</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** The build so far — the whole point of the descent, so it is always on screen. */
function Held({ run }: { run: DeepRunState }): JSX.Element | null {
  if (run.boons.length === 0) return null;
  return (
    <div className={styles.held}>
      <span className={styles.heldLabel}>Carried</span>
      <ul className={styles.heldList}>
        {run.boons.map((boon) => (
          <li key={boon.key} data-rarity={boon.rarity} title={boon.description}>
            {boon.name}
            {boon.count > 1 ? ` ×${boon.count}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Door({
  door,
  busy,
  onEnter,
}: {
  door: DeepRunDoor;
  busy: boolean;
  onEnter: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const enemyName = (key: string) =>
    bundle?.enemies.find((entry) => entry.key === key)?.name ?? key;

  return (
    <button
      type="button"
      className={styles.door}
      data-kind={door.kind}
      disabled={busy}
      onClick={onEnter}
    >
      <span className={styles.doorKind}>{door.kind}</span>
      <span className={styles.doorName}>{door.name}</span>
      <span className={styles.doorText}>{door.description}</span>

      {door.waves.length > 0 && (
        <span className={styles.doorWaves}>
          {door.waves.map((wave, index) => (
            <span key={index} className={styles.doorWave}>
              {wave.map(enemyName).join(' · ')}
            </span>
          ))}
        </span>
      )}
      {door.healPct > 0 && (
        <span className={styles.doorGain}>Mends {door.healPct}% to everyone standing</span>
      )}
      {Object.keys(door.rewards).length > 0 && <Rewards rewards={door.rewards} signed />}
    </button>
  );
}

/**
 * What each depth is worth, as the shared ladder's tiles (C46). Drawn beside the way down
 * before a descent and under the party during one; nothing on it is pressed, since a
 * descent pays its deepest floor once, on the way out — so a reached floor wears the tick
 * and the rung's own name is on the tile's tooltip. `Floor 6` stands in for the score,
 * because a floor is the score.
 */
/**
 * What the last descent came back with (C46) — the Titan's "what you managed" for the
 * Stair. A mode scored on how deep you get is measured against the last time you went, and
 * the rung its tick lands on is the floor to beat; it had been one figure in the facts row.
 */
function LastDescent({ run }: { run: DeepRunState }): JSX.Element {
  const none = run.lastRunFloor === 0 && Object.keys(run.lastRunRewards).length === 0;
  return (
    <Panel title="Your last descent" className={styles.record}>
      {none ? (
        <p className={styles.none}>
          Nothing on record yet. The first descent is the one every one after it is measured
          against.
        </p>
      ) : (
        <div className={styles.lastRun}>
          <p className={styles.lastFloor}>
            Reached <strong>floor {run.lastRunFloor}</strong> of {run.floors}
          </p>
          <Rewards rewards={run.lastRunRewards} signed />
        </div>
      )}
    </Panel>
  );
}

function DepthLadder({ run }: { run: DeepRunState }): JSX.Element | null {
  if (run.depthTiers.length === 0) return null;
  return (
    <Panel title="What depth is worth" className={styles.ladderPanel}>
      <Ladder
        rows={[
          {
            key: 'depth',
            title: 'Depth',
            subtitle: 'Paid once, at the deepest floor a descent reaches',
          },
        ]}
        tiers={run.depthTiers.map((tier, index) => ({
          index,
          points: tier.floor,
          label: `Floor ${tier.floor}`,
          name: tier.name,
          reached: tier.reached,
          tiles: [{ rewards: tier.rewards, claimed: tier.reached, barred: false }],
        }))}
        scrollKey={run.runKey}
        busy={false}
        label={`${run.name} depth ladder`}
        onClaim={() => undefined}
      />
    </Panel>
  );
}

/** Who goes down. Four at most, and they go without a single relic. */
function PartyPicker({
  run,
  onClose,
  onSend,
}: {
  run: DeepRunState;
  onClose: () => void;
  onSend: (ids: string[]) => void;
}): JSX.Element {
  const roster = useRosterStore((state) => state.champions);
  const loadRoster = useRosterStore((state) => state.load);
  const bundle = useContentStore((state) => state.bundle);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const defs = useMemo(
    () => new Map((bundle?.champions ?? []).map((def) => [def.key, def])),
    [bundle],
  );
  const available = roster.filter((champion) => !defs.get(champion.championKey)?.isFood);

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= MAX_PARTY
          ? current
          : [...current, id],
    );

  return (
    <Modal open title={`Down ${run.name}`} onClose={onClose} size="wide">
      <div className={styles.picker}>
        <p className={styles.note}>
          Four at most, and <strong>none of them takes a relic down</strong>. Their levels, ranks
          and masteries come with them; everything they are wearing stays at the top.
        </p>
        <div className={styles.pickerGrid}>
          {available.map((champion) => (
            <ChampionCard
              key={champion.id}
              champion={champion}
              def={defs.get(champion.championKey)}
              selectable
              selected={picked.includes(champion.id)}
              onOpen={() => toggle(champion.id)}
            />
          ))}
        </div>
        <div className={styles.pickerActions}>
          <span className={styles.note}>
            {picked.length} of {MAX_PARTY} chosen
          </span>
          <Button onClick={() => onSend(picked)} disabled={picked.length === 0}>
            Down the Stair
          </Button>
        </div>
      </div>
    </Modal>
  );
}
