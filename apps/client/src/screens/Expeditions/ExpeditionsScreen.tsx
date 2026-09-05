import { useEffect, useMemo, useState } from 'react';
import {
  expeditionYield,
  favourMet,
  minutesLeft,
  type ChampionDef,
  type ExpeditionOffer,
  type ExpeditionRun,
  type FavourCandidate,
  type RosterChampion,
} from '@mistvale/shared';
import { Button } from '@/ui/Button/Button';
import { Empty } from '@/ui/Empty/Empty';
import { Heading } from '@/ui/Heading/Heading';
import { Panel } from '@/ui/Panel/Panel';
import { Rewards } from '@/ui/Rewards/Rewards';
import { ScreenInfo } from '@/ui/ScreenInfo/ScreenInfo';
import { ChampionCard } from '@/ui/ChampionCard/ChampionCard';
import { Modal } from '@/ui/Modal/Modal';
import { useContentStore } from '@/state/contentStore';
import { useExpeditionStore } from '@/state/expeditionStore';
import { usePlayerStore } from '@/state/playerStore';
import { useRosterStore } from '@/state/rosterStore';
import { expeditionArt } from '../../ui/expeditionArt';
import styles from './ExpeditionsScreen.module.scss';

/**
 * Expeditions — champions sent somewhere that is not a fight.
 *
 * The screen's one job beyond "press send" is to make the **cost** legible, because the
 * cost is the feature: a party that leaves cannot be fielded for four, eight or twelve
 * hours. So the picker greys what is already away, the running cards say who is out, and
 * nothing here pretends a champion can be in two places at once.
 *
 * The **favour preview** is the other half. Which favours a party meets decides the yield,
 * and a player choosing blind is a player pressing a timer — so the picker prices the party
 * as it is being chosen, with `favourMet` and `expeditionYield`, the same two pure functions
 * the server dispatches with. One rule read twice, exactly as `planLoadout` does for relics.
 */

export function ExpeditionsScreen(): JSX.Element {
  const state = useExpeditionStore((store) => store.state);
  const loading = useExpeditionStore((store) => store.loading);
  const loaded = useExpeditionStore((store) => store.loaded);
  const load = useExpeditionStore((store) => store.load);
  const claim = useExpeditionStore((store) => store.claim);
  const recall = useExpeditionStore((store) => store.recall);
  const refreshPlayer = usePlayerStore((store) => store.refresh);
  const bundle = useContentStore((store) => store.bundle);

  const [sending, setSending] = useState<ExpeditionOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Ticked so "3h 12m to go" does not sit still. The *ready* flag is always the server's —
  // a clock a player can set must never open a chest.
  const [, setTick] = useState(0);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((count) => count + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const names = useMemo(
    () => new Map((bundle?.expeditions ?? []).map((def) => [def.key, def.name])),
    [bundle],
  );

  const act = async (run: () => Promise<void>, said: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await run();
      setNotice(said);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be done.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <Heading
        tagline="Work that is not a fight, for champions who are not fighting today."
        actions={
          <ScreenInfo title="Expeditions">
            <Panel title="What it costs">
              <p className={styles.note}>
                A party that leaves cannot be sent into a battle, set as an arena defence, fed away
                or released until it is back. That is the whole cost — and the reason a wide roster
                is worth having.
              </p>
              <p className={styles.note}>
                They can still be levelled, ranked and re-geared while they are gone. They are
                working, not lost.
              </p>
            </Panel>
            <Panel title="Favours">
              <p className={styles.note}>
                Each expedition asks for something — a faction, a breath, a role, a rarity. Every
                favour the party meets raises the whole yield, and the party that meets the most is
                rarely the party you would field.
              </p>
            </Panel>
          </ScreenInfo>
        }
      >
        Expeditions
      </Heading>

      {notice && <p className={styles.notice}>{notice}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <p className={styles.slots}>
        <strong>{state.slotsUsed}</strong> of <strong>{state.slots}</strong>{' '}
        {state.slots === 1 ? 'party' : 'parties'} out
      </p>

      {state.running.length > 0 && (
        <section className={styles.running} aria-label="Out now">
          {state.running.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              name={names.get(run.expeditionKey) ?? run.expeditionKey}
              busy={busy}
              onClaim={() =>
                void act(async () => {
                  await claim(run.id);
                  await refreshPlayer();
                }, 'They are back, and they brought it.')
              }
              onRecall={() =>
                void act(async () => {
                  await recall(run.id);
                }, 'Recalled. They bring nothing back, but they are yours again.')
              }
            />
          ))}
        </section>
      )}

      {loaded && state.offers.length === 0 ? (
        <Empty
          glyph="glyph-eagle-staff"
          title="Nothing to send anyone on"
          message={
            loading
              ? 'Reading the roster of errands…'
              : 'No expedition is open to you yet. They begin at account level 11.'
          }
        />
      ) : (
        <section className={styles.offers} aria-label="Where they can go">
          {state.offers.map((offer, index) => (
            <OfferCard
              key={offer.key}
              offer={offer}
              ordinal={index}
              onSend={() => setSending(offer)}
            />
          ))}
        </section>
      )}

      {sending && (
        <PartyPicker
          offer={sending}
          away={new Set(state.awayChampionIds)}
          onClose={() => setSending(null)}
          onSent={(said) => {
            setSending(null);
            setNotice(said);
          }}
        />
      )}
    </div>
  );
}

/** One party that is out, or one waiting to be collected. */
function RunCard({
  run,
  name,
  busy,
  onClaim,
  onRecall,
}: {
  run: ExpeditionRun;
  name: string;
  busy: boolean;
  onClaim: () => void;
  onRecall: () => void;
}): JSX.Element {
  const left = minutesLeft(run.readyAt, new Date());
  const hours = Math.floor(left / 60);
  const minutes = left % 60;

  return (
    <Panel title={name} variant="hero" className={styles.runCard}>
      <p className={styles.when}>
        {run.ready ? 'Back at the gate' : `${hours}h ${minutes}m to go`}
      </p>
      <Rewards rewards={run.rewards} />
      <ul className={styles.favours}>
        {run.favours.map((favour) => (
          <li key={`${favour.kind}-${favour.value}`} data-met={favour.met}>
            {favour.value} +{favour.bonusPct}%
          </li>
        ))}
      </ul>
      <div className={styles.runActions}>
        {run.ready ? (
          <Button disabled={busy} onClick={onClaim}>
            Collect
          </Button>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={onRecall}>
            Recall
          </Button>
        )}
      </div>
    </Panel>
  );
}

function OfferCard({
  offer,
  ordinal,
  onSend,
}: {
  offer: ExpeditionOffer;
  ordinal: number;
  onSend: () => void;
}): JSX.Element {
  return (
    <Panel title={offer.name} className={styles.offerCard}>
      {/* A painting across the top (C45). Three cards of words over six hundred pixels of
          nothing were the audit's example of a screen that forgot to finish; a picture is
          what makes an errand a place to send somebody. */}
      <span
        className={styles.offerArt}
        style={
          {
            '--mv-offer-art': `var(--fui-img-${expeditionArt(offer.key, ordinal)})`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      />
      <p className={styles.description}>{offer.description}</p>
      <p className={styles.terms}>
        {offer.hours}h · {offer.partySize} {offer.partySize === 1 ? 'champion' : 'champions'}
      </p>
      <Rewards rewards={offer.rewards} />
      <ul className={styles.favours}>
        {offer.favours.map((favour) => (
          <li key={`${favour.kind}-${favour.value}`}>
            {favour.value} +{favour.bonusPct}%
          </li>
        ))}
      </ul>
      {/* At the foot of the card whatever the card above it holds, so three buttons in a
          row line up (C45). */}
      <div className={styles.offerActions}>
        <Button
          disabled={offer.blockedReason !== null}
          title={offer.blockedReason ?? undefined}
          onClick={onSend}
        >
          Send a party
        </Button>
        {offer.blockedReason && <p className={styles.blocked}>{offer.blockedReason}</p>}
      </div>
    </Panel>
  );
}

/**
 * Choosing who goes, and being told what it is worth before they do.
 *
 * The preview runs the *same* pure functions the server dispatches with, so it cannot
 * promise a yield the server then pays differently.
 */
function PartyPicker({
  offer,
  away,
  onClose,
  onSent,
}: {
  offer: ExpeditionOffer;
  away: ReadonlySet<string>;
  onClose: () => void;
  onSent: (said: string) => void;
}): JSX.Element {
  const champions = useRosterStore((store) => store.champions);
  const loadRoster = useRosterStore((store) => store.load);
  const bundle = useContentStore((store) => store.bundle);
  const dispatch = useExpeditionStore((store) => store.dispatch);

  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const defs = useMemo(
    () => new Map((bundle?.champions ?? []).map((def: ChampionDef) => [def.key, def])),
    [bundle],
  );

  // Food is never offered: it is a consumable, and a Broodling on a survey is the game
  // misunderstanding its own player.
  const available = champions.filter(
    (champion: RosterChampion) => !defs.get(champion.championKey)?.isFood,
  );

  const party: FavourCandidate[] = chosen.flatMap((id) => {
    const champion = champions.find((entry: RosterChampion) => entry.id === id);
    const def = champion ? defs.get(champion.championKey) : undefined;
    return def
      ? [{ factionKey: def.factionKey, element: def.element, role: def.role, rarity: def.rarity }]
      : [];
  });

  const favours = offer.favours.map((favour) => ({ ...favour, met: favourMet(favour, party) }));
  const preview = expeditionYield(offer.rewards, favours);
  const full = chosen.length === offer.partySize;

  const toggle = (id: string): void =>
    setChosen((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= offer.partySize
          ? current
          : [...current, id],
    );

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await dispatch(offer.key, chosen);
      onSent(`${offer.name} — they are away.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'They could not be sent.');
      setBusy(false);
    }
  };

  return (
    <Modal open title={offer.name} onClose={busy ? () => undefined : onClose} size="work">
      <div className={styles.pickerBody}>
        <p className={styles.description}>{offer.description}</p>

        <div className={styles.preview}>
          <span className={styles.previewLabel}>
            {chosen.length} of {offer.partySize} chosen
          </span>
          <Rewards rewards={preview} />
          <ul className={styles.favours}>
            {favours.map((favour) => (
              <li key={`${favour.kind}-${favour.value}`} data-met={favour.met}>
                {favour.value} +{favour.bonusPct}%
              </li>
            ))}
          </ul>
        </div>

        {available.length === 0 ? (
          <Empty
            size="sm"
            title="Nobody to send"
            message="Every champion you hold is food or already away. Pull at the Mistgate, or bring a party home."
          />
        ) : (
          <div className={styles.grid}>
            {available.map((champion: RosterChampion) => {
              const out = away.has(champion.id);
              return (
                <div key={champion.id} className={styles.slot} data-away={out}>
                  <ChampionCard
                    champion={champion}
                    def={defs.get(champion.championKey)}
                    selectable
                    selected={chosen.includes(champion.id)}
                    // An away champion is drawn and refused rather than hidden: a picker
                    // that quietly omitted a champion would look like the roster had lost
                    // one.
                    onOpen={() => {
                      if (!out) toggle(champion.id);
                    }}
                  />
                  {/* A word, not just a grey card. The library's own badge slot sits where
                      the level chip already is, so this is ours and sits across the art. */}
                  {out && <span className={styles.awayTag}>Away</span>}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.pickerActions}>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Not now
          </Button>
          <Button disabled={busy || !full} onClick={() => void send()}>
            {full ? 'Send them' : `Choose ${offer.partySize - chosen.length} more`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
