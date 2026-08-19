import { useEffect, useMemo, useState } from 'react';
import { ARENA_TIER_LABELS, type ArenaOffer, type ArenaTeamMember } from '@mistvale/shared';
import { TierBadge } from '@/fui/components/TierBadge.ts';
import { Fui } from '@/fui/react';
import { Empty } from '../../ui/Empty/Empty';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { useArenaStore } from '../../state/arenaStore';
import { useProfileStore } from '../../state/profileStore';
import { useContentStore } from '../../state/contentStore';
import { useNavStore } from '../../state/navStore';
import { useBattleStore } from '../../state/battleStore';
import { toast } from '../../state/uiStore';
import { arenaTierEmblem } from '../../ui/arenaTier';
import { championArt } from '../../ui/championArt';
import { Portrait } from '../../ui/Portrait/Portrait';
import { TeamPicker } from './TeamPicker';
import { Leaderboard } from './Leaderboard';
import { HallOfValor } from './HallOfValor';
import styles from './ArenaScreen.module.scss';
import { Heading } from '@/ui/Heading/Heading';

/**
 * The Arena hub.
 *
 * One read of `/arena` draws the whole thing, because every panel here is a view of the
 * same standing and two requests would eventually disagree about it.
 *
 * The shape of the screen follows the shape of the decision: on the left, five opponents
 * and what beating each is worth — the choice a player actually makes. On the right, the
 * things that make that choice better: the defence that earns while they are away, the
 * chest, and the Hall the medals go into (docs/UI_UX_DESIGN.md §3, screen 16).
 */
export function ArenaScreen(): JSX.Element {
  const arena = useArenaStore((state) => state.arena);
  const loading = useArenaStore((state) => state.loading);
  const busy = useArenaStore((state) => state.busy);
  const error = useArenaStore((state) => state.error);
  const load = useArenaStore((state) => state.load);
  const showProfile = useProfileStore((state) => state.show);
  const refreshOffers = useArenaStore((state) => state.refreshOffers);
  const setDefence = useArenaStore((state) => state.setDefence);
  const claimChest = useArenaStore((state) => state.claimChest);

  const startArena = useBattleStore((state) => state.startArena);
  const goTo = useNavStore((state) => state.setScreen);
  const bundle = useContentStore((state) => state.bundle);

  const [attacking, setAttacking] = useState<ArenaOffer | null>(null);
  const [editingDefence, setEditingDefence] = useState(false);
  const [showLadder, setShowLadder] = useState(false);
  const [showHall, setShowHall] = useState(false);

  // Re-read on every visit: tokens accrue on the clock, and somebody may have taken the
  // rating while the player was elsewhere in the game.
  useEffect(() => {
    void load();
  }, [load]);

  const defOf = useMemo(() => {
    const defs = new Map((bundle?.champions ?? []).map((entry) => [entry.key, entry]));
    return (key: string) => defs.get(key);
  }, [bundle]);

  const championName = useMemo(() => {
    const names = new Map((bundle?.champions ?? []).map((entry) => [entry.key, entry.name]));
    return (key: string): string => names.get(key) ?? key;
  }, [bundle]);

  const attack = async (team: string[]): Promise<void> => {
    const offer = attacking;
    if (!offer) return;
    try {
      await startArena({ offerId: offer.offerId, team });
      setAttacking(null);
      goTo('battle');
    } catch {
      // The store holds the message; the picker stays open so the team is not lost.
      setAttacking(null);
      void load();
    }
  };

  const claim = async (): Promise<void> => {
    const chest = await claimChest();
    if (chest) {
      toast.success(`${ARENA_TIER_LABELS[chest.tier]} chest opened.`);
    }
  };

  if (!arena) {
    return (
      <Panel>
        <p className={styles.empty}>
          {loading ? 'Walking out onto the sand…' : (error ?? 'The Arena is closed just now.')}
        </p>
      </Panel>
    );
  }

  const tokens = arena.tokens;
  const outOfTokens = tokens.value < 1;

  return (
    <div className={styles.screen}>
      <Heading tagline="Four of yours against four of theirs. The ladder keeps score while you sleep.">
        The Arena
      </Heading>

      <div className={styles.main}>
        <section className={styles.standing}>
          <div className={styles.rank}>
            {/* The rung a player holds is the one thing on this screen they will describe
                out loud, and every ladder game in the genre draws it as a metal emblem
                rather than as two words. `arenaTierEmblem` is the split: `bronze_2` is a
                metal and a numeral, which is exactly what the badge is built from. */}
            <Fui
              of={TierBadge}
              className={styles.badge}
              options={{
                ...arenaTierEmblem(arena.tier),
                points: arena.rating,
                size: 84,
              }}
            />
            <span className={styles.rankNote}>
              Best this week {arena.weeklyHigh} · {arena.medalsPerWin} medals a win
            </span>
          </div>

          <div className={styles.tokens}>
            <span className={styles.tokensLabel}>Attack tokens</span>
            <div className={styles.pips} aria-label={`${tokens.value} of ${tokens.cap} tokens`}>
              {Array.from({ length: tokens.cap }, (_, index) => (
                <span key={index} className={styles.pip} data-on={index < tokens.value} />
              ))}
            </div>
            <span className={styles.tokensNote}>
              {tokens.value} / {tokens.cap}
              {tokens.nextTickAt ? ` · next in ${countdown(tokens.nextTickAt)}` : ' · full'}
            </span>
          </div>
        </section>

        <header className={styles.offersHead}>
          <h2 className={styles.heading}>Who is standing</h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => void refreshOffers()}
          >
            {busy === 'refresh'
              ? 'Rolling…'
              : arena.refreshCost > 0
                ? `New list — ${arena.refreshCost} crystals`
                : 'New list — free'}
          </Button>
        </header>

        {arena.offers.length === 0 ? (
          <Empty
            size="sm"
            glyph="glyph-sword-clash"
            title="Nobody is standing at your rating"
            message="Roll a new list, or come back after the ladder has moved."
          />
        ) : (
          <div className={styles.offers}>
            {arena.offers.map((offer) => (
              <article key={offer.offerId} className={styles.offer}>
                <header className={styles.offerHead}>
                  <Fui
                    of={TierBadge}
                    className={styles.offerBadge}
                    options={{ ...arenaTierEmblem(offer.tier), size: 40, compact: true }}
                    attrs={{ title: ARENA_TIER_LABELS[offer.tier] }}
                  />
                  <div className={styles.offerWho}>
                    <button
                      type="button"
                      className={styles.offerName}
                      onClick={() => void showProfile(offer.playerId)}
                    >
                      {offer.profileName}
                    </button>
                    <span className={styles.offerMeta}>
                      Lv {offer.level} · {offer.rating} · {offer.power.toLocaleString()} power
                    </span>
                  </div>
                </header>

                {/* Four faces rather than four names. What a player is deciding is whether
                    they can beat this team, and a wall of text in five cards side by side
                    is the one shape that cannot be compared at a glance. */}
                <ul className={styles.team}>
                  {offer.team.map((member, index) => {
                    const def = defOf(member.championKey);
                    const art = championArt(def, bundle?.assets);
                    return (
                      <li key={`${offer.offerId}-${index}`} className={styles.member}>
                        <Portrait
                          src={art.portrait ?? null}
                          name={championName(member.championKey)}
                          size={44}
                        />
                        <span className={styles.memberMeta}>
                          {member.level}
                          <span className={styles.memberRank}>★{member.rank}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <footer className={styles.offerFoot}>
                  {/* The stake and the button were overlapping: the footer was a two-item
                      row with no minimum on either, so a wide button pushed the numbers
                      underneath itself. They are stacked columns now. */}
                  <span className={styles.stakes}>
                    <span className={styles.gain}>+{offer.ratingGain}</span>
                    <span className={styles.loss}>{offer.ratingLoss}</span>
                  </span>
                  <Button
                    size="sm"
                    disabled={outOfTokens}
                    onClick={() => setAttacking(offer)}
                    title={outOfTokens ? 'No attack tokens left' : undefined}
                  >
                    Challenge
                  </Button>
                </footer>
              </article>
            ))}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>

      <aside className={styles.sidebar}>
        <Panel title="Your defence">
          {arena.defenceTeam.length === 0 ? (
            <p className={styles.sideNote}>
              Nobody is holding your gate. Until you set a team, you cannot be attacked — and you
              cannot gain rating while you are away either.
            </p>
          ) : (
            <ul className={styles.defence}>
              {arena.defenceTeam.map((member: ArenaTeamMember, index) => (
                <li key={index} className={styles.member}>
                  <span className={styles.memberName}>{championName(member.championKey)}</span>
                  <span className={styles.memberMeta}>
                    Lv {member.level} · ★{member.rank}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button fullWidth variant="ghost" onClick={() => setEditingDefence(true)}>
            {arena.defenceTeam.length === 0 ? 'Set a defence' : 'Change it'}
          </Button>
        </Panel>

        <Panel title="Weekly chest">
          <p className={styles.sideNote}>
            {arena.weeklyChest.claimable
              ? `A ${ARENA_TIER_LABELS[arena.weeklyChest.tier]} chest is waiting.`
              : `On course for a ${ARENA_TIER_LABELS[arena.weeklyChest.tier]} chest — it seals on Monday, against the best rating you hold this week.`}
          </p>
          <Button
            fullWidth
            disabled={!arena.weeklyChest.claimable || busy !== null}
            onClick={() => void claim()}
          >
            {busy === 'chest' ? 'Opening…' : 'Open it'}
          </Button>
        </Panel>

        <Panel title="Valor">
          <p className={styles.sideNote}>
            Medals buy permanent bonuses for every champion of an element you own. It is the only
            thing they buy, and it takes a season.
          </p>
          <Button fullWidth variant="ghost" onClick={() => setShowHall(true)}>
            The Hall of Valor
          </Button>
          <Button fullWidth variant="ghost" onClick={() => setShowLadder(true)}>
            The ladder
          </Button>
        </Panel>
      </aside>

      {attacking && (
        <TeamPicker
          title={`Challenge ${attacking.profileName}`}
          blurb={`Costs one attack token. Win and you take ${attacking.ratingGain} rating; lose and you give up ${Math.abs(attacking.ratingLoss)}. Either way the token is spent.`}
          confirmLabel="Onto the sand"
          busy={busy !== null}
          onConfirm={(team) => void attack(team)}
          onClose={() => setAttacking(null)}
        />
      )}

      {editingDefence && (
        <TeamPicker
          title="Your defence"
          blurb="These four hold your gate while you are elsewhere, driven by the same AI that runs every enemy in the game. They keep whatever relics they are wearing — a defence is not a separate set."
          confirmLabel="They stand"
          initial={arena.defence}
          busy={busy === 'defence'}
          error={error}
          onConfirm={(team) => {
            void setDefence(team).then(() => setEditingDefence(false));
          }}
          onClose={() => setEditingDefence(false)}
        />
      )}

      {showLadder && <Leaderboard onClose={() => setShowLadder(false)} />}
      {showHall && <HallOfValor onClose={() => setShowHall(false)} />}
    </div>
  );
}

/**
 * How long until the next token, in words.
 *
 * The server sends the moment; the client only formats it. A client that counted tokens
 * itself would drift from the meter it is drawing (CLAUDE.md — no client-side timers).
 */
function countdown(iso: string): string {
  const seconds = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
