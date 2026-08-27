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
import { LevelDisc } from '../../ui/LevelDisc/LevelDisc';
import { Portrait } from '../../ui/Portrait/Portrait';
import { avatarFaces } from './faces';

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
  const setAvatar = useProfileStore((state) => state.setAvatar);
  const self = usePlayerStore((state) => state.player);

  /**
   * What the panel is doing, and *whose* card it is doing it to.
   *
   * The card id travels with the mode rather than beside it, so shutting the panel or
   * opening somebody else's card drops the player back to reading by arithmetic — no
   * effect racing to tidy up after the fact, and no way to end up editing one warden's
   * card while looking at another's.
   */
  const [editing, setEditing] = useState<{ for: string; mode: 'showcase' | 'avatar' } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const card = openId ? cards[openId] : undefined;
  const isSelf = Boolean(openId && self && openId === self.id);
  const mode = editing && editing.for === openId ? editing.mode : 'card';

  const startShowcase = (): void => {
    if (!openId) return;
    setPicked(card?.showcase.map((champion) => champion.id) ?? []);
    setEditing({ for: openId, mode: 'showcase' });
  };

  const startAvatar = (): void => {
    if (!openId) return;
    setEditing({ for: openId, mode: 'avatar' });
  };

  const save = async (): Promise<void> => {
    await setShowcase(picked);
    if (!useProfileStore.getState().error) {
      setEditing(null);
      toast.success('Your card is updated.');
    }
  };

  /** Chooses the face and closes the picker — one press, because there is nothing to weigh. */
  const chooseFace = async (championKey: string | null): Promise<void> => {
    await setAvatar(championKey);
    if (!useProfileStore.getState().error) {
      setEditing(null);
      toast.success(championKey ? 'That is your face now.' : 'Back to the crest.');
    }
  };

  return (
    <Modal
      open={openId !== null}
      title={card ? card.profileName : 'Warden'}
      onClose={close}
      // Three dialogs in one frame: a card to read, and two rosters to choose from. The
      // card reads better narrow; a picker is a grid of painted cards and wants the room.
      size={mode === 'card' ? 'work' : 'wide'}
      footer={
        !isSelf || !card ? (
          <Button variant="primary" onClick={close}>
            Close
          </Button>
        ) : mode === 'showcase' ? (
          <>
            <Button variant="ghost" disabled={saving} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save the four'}
            </Button>
          </>
        ) : mode === 'avatar' ? (
          // No save button: picking a face *is* the save. A picker where one press chooses
          // and a second confirms asks a question nobody has an answer to.
          <Button variant="ghost" disabled={saving} onClick={() => setEditing(null)}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={startAvatar}>
              Choose your face
            </Button>
            <Button variant="primary" onClick={startShowcase}>
              Choose your four
            </Button>
          </>
        )
      }
    >
      {error && <p className={styles.error}>{error}</p>}

      {loading && !card ? (
        <p className={styles.empty}>Looking them up…</p>
      ) : !card ? (
        <p className={styles.empty}>There is nothing to show.</p>
      ) : mode === 'showcase' ? (
        <ShowcasePicker picked={picked} onChange={setPicked} />
      ) : mode === 'avatar' ? (
        <AvatarPicker
          chosen={card.avatarChampionKey}
          busy={saving}
          onChoose={(key) => void chooseFace(key)}
        />
      ) : (
        <Card card={card} />
      )}
    </Modal>
  );
}

function Card({ card }: { card: PublicProfile }): JSX.Element {
  const joined = new Date(card.joinedAt).toLocaleDateString();
  const bundle = useContentStore((state) => state.bundle);
  const face = card.avatarChampionKey
    ? bundle?.champions.find((champion) => champion.key === card.avatarChampionKey)
    : undefined;

  return (
    <div className={styles.card}>
      <div className={styles.identity}>
        {/* The face the warden chose, or their initial. The initial is not a placeholder
            waiting to be replaced — plenty of accounts will keep it — so it is drawn in the
            same frame rather than as a lesser version of one. */}
        <div className={styles.avatar} data-rarity={face?.rarity ?? 'none'}>
          {face ? (
            <Portrait
              src={championArt(face, bundle?.assets).portrait ?? null}
              name={face.name}
              size={104}
            />
          ) : (
            <span aria-hidden="true">{card.profileName.charAt(0).toUpperCase()}</span>
          )}
          {/* The same mark the top bar's chip wears, one size up. It is on the portrait
              rather than in the facts row below for the reason the owner's reference has it
              there — and because a level printed twice on one card is a level printed
              once too often. Labelled, because on this card nothing else says it. */}
          <LevelDisc level={card.level} size="lg" label={`Level ${card.level}`} />
        </div>
        <div className={styles.identityText}>
          {/* No name here: the dialog's own title bar is this card's name, and repeating it
              four lines lower is the thing C12c went round four screens removing. */}
          {card.title && <span className={styles.title}>{card.title}</span>}
          <span className={styles.joined}>Warden since {joined}</span>
        </div>

        {/* What the account has done, in the row with who it is rather than in a band under
            it. Two painted boxes take the slack between the portrait and the rung, which is
            where the card had a hand's width of nothing — and the level is not among them
            any more, because it is on the portrait where the owner's reference puts it. */}
        <dl className={styles.facts}>
          <Fact label="Champions" value={`${card.championsOwned} / ${card.championsTotal}`} />
          <Fact label="Furthest" value={card.furthestStage ?? '—'} note={`${card.stars}★`} />
        </dl>

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
 * The owner choosing the face they wear.
 *
 * One card per *champion* rather than per copy: three Anurias are one face, and a picker
 * that offered the same portrait three times would be asking a question with no answer.
 * The strongest copy of each is the one drawn, because if a player is going to look at one
 * of their Anurias it may as well be the good one.
 *
 * Food is left out for the same reason the showcase leaves it out, and picking is a single
 * press — a face is a cosmetic choice with nothing to weigh, and it is already saved by the
 * time the player has looked at it.
 */
function AvatarPicker({
  chosen,
  busy,
  onChoose,
}: {
  chosen: string | null;
  busy: boolean;
  onChoose: (championKey: string | null) => void;
}): JSX.Element {
  const champions = useRosterStore((state) => state.champions);
  const load = useRosterStore((state) => state.load);
  const bundle = useContentStore((state) => state.bundle);

  useEffect(() => {
    void load();
  }, [load]);

  const faces = useMemo(() => avatarFaces(champions, bundle?.champions ?? []), [champions, bundle]);

  return (
    <div className={styles.picker}>
      <p className={styles.pickerHint}>
        Any champion you own. It shows on your card and in the bar above every screen.
      </p>

      {faces.length === 0 ? (
        <p className={styles.empty}>You have nobody to wear yet.</p>
      ) : (
        <ul className={styles.pickerList}>
          <li>
            {/* The way back. A player who tried a portrait and did not like it needs
                somewhere to press that is not "a different champion". */}
            <button
              type="button"
              className={styles.crest}
              data-selected={chosen === null}
              disabled={busy}
              onClick={() => onChoose(null)}
            >
              <span className={styles.crestMark} aria-hidden="true" />
              <span className={styles.crestLabel}>No portrait</span>
              <span className={styles.crestNote}>Your initial, on a plain frame</span>
            </button>
          </li>

          {faces.map(({ champion, def }) => (
            <li key={def.key}>
              <ChampionCard
                champion={champion}
                def={def}
                selectable
                selected={chosen === def.key}
                onOpen={() => !busy && onChoose(def.key)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
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
