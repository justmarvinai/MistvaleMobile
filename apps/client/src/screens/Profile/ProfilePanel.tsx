import { useEffect, useMemo, useState, type JSX } from 'react';
import { ARENA_TIER_LABELS, type PublicProfile, type ShowcaseChampion } from '@mistvale/shared';
import { ChampionCard as FuiChampionCard } from '@/fui/components/ChampionCard.ts';
import { TierBadge } from '@/fui/components/TierBadge.ts';
import { Fui } from '@/fui/react';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useProfileStore } from '../../state/profileStore';
import { usePlayerStore } from '../../state/playerStore';
import { useRosterStore } from '../../state/rosterStore';
import { useContentStore } from '../../state/contentStore';
import { toast } from '../../state/uiStore';
import styles from './ProfilePanel.module.scss';
import { arenaTierEmblem } from '../../ui/arenaTier';
import { championArt } from '../../ui/championArt';
import { ChampionCard } from '../../ui/ChampionCard/ChampionCard';

/** How many champions a card shows. Mirrors `SHOWCASE_MAX` on the server. */
const SHOWCASE_MAX = 4;

/**
 * A warden's public card (UI_UX_DESIGN §3, screen 24; GAME_DESIGN §142).
 *
 * The same panel whoever is looking: the ladder opens somebody else's, the profile chip
 * opens your own, and the only difference is that your own lets you change the four
 * champions on it. One component rather than two, because "what other people see" is
 * exactly what an owner wants to be looking at while they choose.
 *
 * Everything here is something the account *did* — level, ladder standing, how much of the
 * roster it has met, how far into the campaign it has been. There is no wallet on the card:
 * a profile that led with silver would make the game about the wrong number.
 */
export function ProfilePanel(): JSX.Element {
  const openId = useProfileStore((state) => state.open);
  const cards = useProfileStore((state) => state.cards);
  const loading = useProfileStore((state) => state.loading);
  const error = useProfileStore((state) => state.error);
  const saving = useProfileStore((state) => state.saving);
  const close = useProfileStore((state) => state.close);
  const setShowcase = useProfileStore((state) => state.setShowcase);
  const self = usePlayerStore((state) => state.player);

  /**
   * Whose card the picker is open for, rather than a bare "editing" flag.
   *
   * Derived rather than synchronised: the picker is open only while it names the card on
   * screen, so shutting the panel or opening somebody else's card closes it by arithmetic
   * instead of by an effect racing to tidy up after the fact.
   */
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const card = openId ? cards[openId] : undefined;
  const isSelf = Boolean(openId && self && openId === self.id);
  const editing = editingFor !== null && editingFor === openId;

  const startEditing = (): void => {
    if (!openId) return;
    setPicked(card?.showcase.map((champion) => champion.id) ?? []);
    setEditingFor(openId);
  };

  const save = async (): Promise<void> => {
    await setShowcase(picked);
    if (!useProfileStore.getState().error) {
      setEditingFor(null);
      toast.success('Your card is updated.');
    }
  };

  return (
    <Modal
      open={openId !== null}
      title={card ? card.profileName : 'Warden'}
      onClose={close}
      // Two dialogs in one frame: a card to read, and a roster to choose from. The card
      // reads better narrow; the picker is a grid of painted cards and wants the room.
      size={editing ? 'wide' : 'work'}
      footer={
        isSelf && card ? (
          editing ? (
            <>
              <Button variant="ghost" disabled={saving} onClick={() => setEditingFor(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save the four'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
              <Button variant="primary" onClick={startEditing}>
                Choose your four
              </Button>
            </>
          )
        ) : (
          <Button variant="primary" onClick={close}>
            Close
          </Button>
        )
      }
    >
      {error && <p className={styles.error}>{error}</p>}

      {loading && !card ? (
        <p className={styles.empty}>Looking them up…</p>
      ) : !card ? (
        <p className={styles.empty}>There is nothing to show.</p>
      ) : editing ? (
        <ShowcasePicker picked={picked} onChange={setPicked} />
      ) : (
        <Card card={card} />
      )}
    </Modal>
  );
}

function Card({ card }: { card: PublicProfile }): JSX.Element {
  const joined = new Date(card.joinedAt).toLocaleDateString();

  return (
    <div className={styles.card}>
      <div className={styles.identity}>
        <div className={styles.avatar} aria-hidden="true">
          {card.profileName.charAt(0).toUpperCase()}
        </div>
        <div className={styles.identityText}>
          <span className={styles.name}>{card.profileName}</span>
          {card.title && <span className={styles.title}>{card.title}</span>}
          <span className={styles.joined}>Warden since {joined}</span>
        </div>

        {/* The rung, as an emblem rather than as a line in the facts list. It is the one
            fact on this card that ranks its owner against everybody else, and the same
            badge the Arena draws for the reader's own standing. */}
        {card.arena ? (
          <Fui
            of={TierBadge}
            className={styles.tier}
            options={{
              ...arenaTierEmblem(card.arena.tier),
              points: card.arena.rating,
              ...(card.arena.position ? { rank: card.arena.position } : {}),
              size: 72,
            }}
            attrs={{ title: ARENA_TIER_LABELS[card.arena.tier] }}
          />
        ) : (
          <span className={styles.unblooded}>Unblooded</span>
        )}
      </div>

      <dl className={styles.facts}>
        <Fact label="Level" value={String(card.level)} />
        <Fact label="Champions" value={`${card.championsOwned} / ${card.championsTotal}`} />
        <Fact label="Furthest" value={card.furthestStage ?? '—'} note={`${card.stars}★`} />
      </dl>

      <h3 className={styles.showcaseHeading}>Known for</h3>
      {card.showcase.length === 0 ? (
        <p className={styles.empty}>No champions yet.</p>
      ) : (
        <ul className={styles.showcase}>
          {card.showcase.map((champion) => (
            <ShowcaseTile key={champion.id} champion={champion} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}): JSX.Element {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>
        {value}
        {note && <span className={styles.factNote}>{note}</span>}
      </dd>
    </div>
  );
}

/**
 * One of the four a warden chose to be known by.
 *
 * The same painted card the roster draws, which is the point of the showcase: a player
 * picks four champions to *show*, and showing them as three lines of text was the one
 * shape that could not do it. Read-only here — this is somebody else's card.
 */
function ShowcaseTile({ champion }: { champion: ShowcaseChampion }): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const def = bundle?.champions.find((entry) => entry.key === champion.championKey);
  const art = championArt(def, bundle?.assets);

  return (
    <li className={styles.tile}>
      <Fui
        of={FuiChampionCard}
        options={{
          name: champion.name,
          ...art,
          rarity: champion.rarity,
          stars: champion.rank,
          maxStars: 6,
          ...(champion.ascension > 0 ? { awakened: champion.ascension } : {}),
          level: champion.level,
          affinity: champion.element,
          power: champion.power,
          size: 118,
        }}
        attrs={{
          'aria-label': [
            champion.name,
            champion.rarity,
            `${champion.rank} star`,
            `Lv ${champion.level}`,
            champion.ascension > 0 ? `ascension ${champion.ascension}` : '',
            `power ${champion.power.toLocaleString()}`,
          ]
            .filter(Boolean)
            .join(', '),
        }}
      />
    </li>
  );
}

/**
 * The owner choosing their four.
 *
 * Order is the order they were picked, and it is shown while picking — a card where the
 * player put their best first should stay that way, and a picker that silently re-sorted
 * would take that back.
 */
function ShowcasePicker({
  picked,
  onChange,
}: {
  picked: string[];
  onChange: (next: string[]) => void;
}): JSX.Element {
  const champions = useRosterStore((state) => state.champions);
  const load = useRosterStore((state) => state.load);
  const bundle = useContentStore((state) => state.bundle);

  useEffect(() => {
    void load();
  }, [load]);

  const roster = useMemo(() => {
    const defs = new Map((bundle?.champions ?? []).map((def) => [def.key, def]));
    return champions
      .flatMap((champion) => {
        const def = defs.get(champion.championKey);
        // Food never appears: it is a resource, and a card led by a Broodling would be the
        // game misunderstanding its own player.
        return def && !def.isFood ? [{ champion, def }] : [];
      })
      .sort((a, b) => b.champion.power - a.champion.power);
  }, [champions, bundle]);

  const toggle = (id: string): void => {
    if (picked.includes(id)) {
      onChange(picked.filter((entry) => entry !== id));
      return;
    }
    if (picked.length >= SHOWCASE_MAX) return;
    onChange([...picked, id]);
  };

  return (
    <div className={styles.picker}>
      <p className={styles.pickerHint}>
        Up to four, in the order you pick them. Choose none and the card shows your strongest.
      </p>
      {/* The roster's own card, like every other place a champion is chosen. This picker
          was a list of names and star counts, which asked a player to choose the four they
          want to be *seen by* from the one view in the game that showed them nothing. The
          order badge is the card's, because the order is the whole point of this picker —
          a warden who put their best first should stay that way. */}
      <ul className={styles.pickerList}>
        {roster.map(({ champion, def }) => {
          const position = picked.indexOf(champion.id);
          const full = picked.length >= SHOWCASE_MAX && position === -1;

          return (
            <li key={champion.id} data-full={full}>
              <ChampionCard
                champion={champion}
                def={def}
                selectable
                selected={position >= 0}
                {...(position >= 0 ? { badge: String(position + 1) } : {})}
                onOpen={() => toggle(champion.id)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
