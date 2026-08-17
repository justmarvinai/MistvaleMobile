import { useEffect, useMemo, useState, type JSX } from 'react';
import { ARENA_TIER_LABELS, type PublicProfile, type ShowcaseChampion } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useProfileStore } from '../../state/profileStore';
import { usePlayerStore } from '../../state/playerStore';
import { useRosterStore } from '../../state/rosterStore';
import { useContentStore } from '../../state/contentStore';
import { toast } from '../../state/uiStore';
import styles from './ProfilePanel.module.scss';

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
      width={560}
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
      </div>

      <dl className={styles.facts}>
        <Fact label="Level" value={String(card.level)} />
        <Fact
          label="Arena"
          value={
            card.arena
              ? `${ARENA_TIER_LABELS[card.arena.tier]} · ${card.arena.rating.toLocaleString()}`
              : 'Unblooded'
          }
          note={card.arena?.position ? `#${card.arena.position}` : undefined}
        />
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

function ShowcaseTile({ champion }: { champion: ShowcaseChampion }): JSX.Element {
  return (
    <li className={`${styles.tile} ${styles[champion.rarity] ?? ''}`}>
      <span className={styles.tileName}>{champion.name}</span>
      <span className={styles.tileMeta}>
        {'★'.repeat(champion.rank)} · Lv {champion.level}
        {champion.ascension > 0 && ` · A${champion.ascension}`}
      </span>
      <span className={styles.tilePower}>{champion.power.toLocaleString()}</span>
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
      <ul className={styles.pickerList}>
        {roster.map(({ champion, def }) => {
          const position = picked.indexOf(champion.id);
          const full = picked.length >= SHOWCASE_MAX && position === -1;

          return (
            <li key={champion.id}>
              <button
                type="button"
                className={[
                  styles.pickerItem,
                  position >= 0 ? styles.pickerPicked : '',
                  full ? styles.pickerFull : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={position >= 0}
                disabled={full}
                onClick={() => toggle(champion.id)}
              >
                {position >= 0 && <span className={styles.pickerOrder}>{position + 1}</span>}
                <span className={styles.tileName}>{def.name}</span>
                <span className={styles.tileMeta}>
                  {'★'.repeat(champion.rank)} · Lv {champion.level}
                </span>
                <span className={styles.tilePower}>{champion.power.toLocaleString()}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
