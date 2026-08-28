import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChampionDef, FactionDef, RosterChampion } from '@mistvale/shared';
import { Button } from '../../ui/Button/Button';
import { ChampionCard } from '../../ui/ChampionCard/ChampionCard';
import { Portrait } from '../../ui/Portrait/Portrait';
import { championArt } from '../../ui/championArt';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import {
  NO_FILTER,
  applyRoster,
  isNarrowed,
  rosterFacets,
  type RosterFilter,
  type SortKey,
} from '../Champions/rosterFilter';
import { auraApplies, auraText } from '../../ui/auraText';
import { rarityLabel } from '../../ui/labels';
import styles from './Lineup.module.scss';

/**
 * Setting a lineup, everywhere in the game that asks for one.
 *
 * The shape is the one this genre settled on and the owner asked for (2026-08-28, with
 * Raid's Classic Arena screen as the reference): **the confrontation across the top, the
 * roster underneath.** Your four on the left, what you are walking into on the right, the
 * leader's aura over each side, both team powers, and the button that spends the energy
 * where the eye ends up.
 *
 * What that fixes is not decoration. The old picker was a column: a line of summary, the
 * opposition, the boss, four empty slots, thirty cards and the button — so the two things
 * a player is actually comparing were four hundred pixels apart and never on screen
 * together. A team choice is a *comparison*, and a layout that cannot put both sides in one
 * glance is asking the player to hold one of them in their head.
 *
 * Three things arrived with the layout, each of them data the game already had:
 *
 *  - **The leader's aura, in words.** Content has carried one on every champion since P1
 *    and the engine has applied it on every fight since P3; no screen has ever said what it
 *    was. The whole reason slot one is the player's to choose was invisible.
 *  - **Team power**, so the two sides are comparable at all.
 *  - **The roster narrows.** `rosterFilter` was built for the roster screen in C19 and is
 *    the same question here — thirty cards and "who can I bring" is the same search — so it
 *    is the same code rather than a second set of dropdowns that would drift.
 *
 * It is presentational: every rule about *what a fight costs and whether it may start*
 * stays with the caller, because a campaign stage, an Arena token and a Titan key are three
 * different economies and one component that knew all three would be the place they get
 * confused. What comes in is a side, an opposition and a footer.
 */

export const MAX_SLOTS = 4;

/** One side's banner: whose aura is up, and what the four add up to. */
export interface LineupSide {
  /** The heading over the side — "Your team", the opponent's name. */
  label: string;
  /** Sum of the four powers. Omitted when a side is not built out of owned champions. */
  power?: number | undefined;
  /** The leader's aura sentence, already resolved. Null when the leader has none. */
  aura?: string | null | undefined;
  /** Set when the aura is real but does nothing in this mode — said, never hidden. */
  auraIdle?: boolean | undefined;
  /**
   * What to say where the aura would be, when this side *has* a leader slot and nobody is
   * standing in it. Only a side made of the player's champions sets it — a wave of enemies
   * has no leader, so an "Aura: none" line there is a row of noise about a mechanic that
   * does not apply to them.
   */
  auraHint?: string | undefined;
}

export function Lineup({
  yours,
  theirs,
  opposition,
  team,
  onToggle,
  eligible,
  barredReason,
  notices,
  footer,
}: {
  yours: LineupSide;
  /** The other side's banner. Omitted where there is nobody to compare against. */
  theirs?: LineupSide | undefined;
  /** The right-hand column: enemy waves, an opponent's four, whatever the caller has. */
  opposition?: ReactNode;
  /** `player_champions` ids in formation order; the first is the leader. */
  team: readonly string[];
  onToggle: (id: string) => void;
  /** Whether a champion may be *started* with — a warded floor's rule. Dimmed, not hidden. */
  eligible?: ((championKey: string) => boolean) | undefined;
  /** Why a barred champion is barred, for the hover. */
  barredReason?: string | undefined;
  /** Anything that has to be read before the button: a ward, an error, a boss's mechanics. */
  notices?: ReactNode;
  /** The cost line and the buttons. The caller owns every economy in the game. */
  footer: ReactNode;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const roster = useRosterStore((state) => state.champions);
  const loadRoster = useRosterStore((state) => state.load);
  const rosterLoading = useRosterStore((state) => state.loading);

  const [filter, setFilter] = useState<RosterFilter>(NO_FILTER);
  const [sort, setSort] = useState<SortKey>('power');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const defs = useMemo(
    () => new Map((bundle?.champions ?? []).map((champion) => [champion.key, champion])),
    [bundle],
  );

  const facets = useMemo(() => rosterFacets(roster, defs), [roster, defs]);
  const view = useMemo(() => applyRoster(roster, defs, filter, sort), [roster, defs, filter, sort]);
  const factionNames = useMemo(
    () => new Map((bundle?.factions ?? []).map((faction) => [faction.key, faction.name])),
    [bundle],
  );

  const narrowed = isNarrowed(filter);
  const narrow = <K extends keyof RosterFilter>(key: K, value: RosterFilter[K]): void =>
    setFilter({ ...filter, [key]: value });

  return (
    <div className={styles.lineup}>
      {/* ── The confrontation ─────────────────────────────────────────────
          Two sides and the word between them. Both banners are drawn even when
          one side has nothing to say, so the two columns keep their widths and the
          VS stays on the centre line rather than sliding as content arrives. */}
      <div className={styles.field}>
        <section className={styles.side} data-side="ours" aria-label={yours.label}>
          <Banner side={yours} />
          <div className={styles.slots}>
            {Array.from({ length: MAX_SLOTS }, (_, index) => {
              const id = team[index];
              const owned = roster.find((entry) => entry.id === id);
              const def = owned ? defs.get(owned.championKey) : undefined;
              return (
                <button
                  key={index}
                  type="button"
                  className={styles.slot}
                  data-filled={Boolean(id)}
                  data-leader={index === 0}
                  onClick={() => id && onToggle(id)}
                  title={id ? 'Remove from the lineup' : 'Empty slot'}
                >
                  {/* Only a filled slot gets a face. `Portrait` draws its own stand-in for
                      a missing image, which is right for an art-pending champion and wrong
                      for an empty slot — four hooded figures under "Leader · Slot 2 · Slot
                      3" reads as a team that has already been picked. */}
                  {def && owned ? (
                    <>
                      <Portrait
                        src={championArt(def, bundle?.assets).portrait ?? null}
                        name={def.name}
                        size={SLOT_FACE}
                        className={styles.slotFace}
                      />
                      <span className={styles.slotName}>{def.name}</span>
                      <span className={styles.slotMeta}>
                        Lv {owned.level} · ★{owned.rank}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={styles.slotEmpty} aria-hidden="true" />
                      <span className={styles.slotName} data-empty="true">
                        {index === 0 ? 'Leader' : `Slot ${index + 1}`}
                      </span>
                    </>
                  )}
                  {index === 0 && <span className={styles.leaderTag}>Leader</span>}
                </button>
              );
            })}
          </div>
          {yours.power !== undefined && (
            <p className={styles.power}>
              Team power <strong>{yours.power.toLocaleString()}</strong>
            </p>
          )}
        </section>

        <div className={styles.versus} aria-hidden="true">
          <span className={styles.versusWord}>VS</span>
        </div>

        <section
          className={styles.side}
          data-side="theirs"
          aria-label={theirs?.label ?? 'What is waiting'}
        >
          {theirs && <Banner side={theirs} />}
          <div className={styles.opposition}>{opposition}</div>
          {theirs?.power !== undefined && (
            <p className={styles.power}>
              Team power <strong>{theirs.power.toLocaleString()}</strong>
            </p>
          )}
        </section>
      </div>

      {notices && <div className={styles.notices}>{notices}</div>}

      {/* ── The roster ────────────────────────────────────────────────────
          Behind a button, the way the roster screen's are (C19): seven controls
          across the top of a grid leave no room for the grid they narrow. */}
      <div className={styles.rosterBar}>
        {/* "9 of 37", so a filter is never mistaken for an empty roster — C19's rule. */}
        <span className={styles.count}>
          {view.length} of {roster.length}
        </span>
        <div className={styles.rosterTools}>
          <label className={styles.sortField}>
            <span className={styles.sortLabel}>Sort</span>
            <select
              className={styles.select}
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
            >
              <option value="power">Power</option>
              <option value="rank">Rank</option>
              <option value="level">Level</option>
              <option value="rarity">Rarity</option>
              <option value="name">Name</option>
            </select>
          </label>
          <Button size="sm" variant="ghost" onClick={() => setFiltersOpen((open) => !open)}>
            {filtersOpen ? 'Hide filters' : 'Filters'}
          </Button>
          {narrowed && (
            <Button size="sm" variant="ghost" onClick={() => setFilter(NO_FILTER)}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className={styles.filters} role="group" aria-label="Narrow the roster">
          <label className={styles.filterField}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.input}
              value={filter.search}
              onChange={(event) => narrow('search', event.target.value)}
              placeholder="Search"
            />
          </label>
          <Picker
            label="Faction"
            value={filter.factionKey}
            options={facets.factionKeys.map((key) => ({
              value: key,
              label: factionNames.get(key) ?? key,
            }))}
            onChange={(value) => narrow('factionKey', value)}
          />
          <Picker
            label="Element"
            value={filter.element}
            options={facets.elements.map((element) => ({
              value: element,
              label: capital(element),
            }))}
            onChange={(value) => narrow('element', value as RosterFilter['element'])}
          />
          <Picker
            label="Rarity"
            value={filter.rarity}
            options={facets.rarities.map((rarity) => ({
              value: rarity,
              label: rarityLabel(rarity),
            }))}
            onChange={(value) => narrow('rarity', value as RosterFilter['rarity'])}
          />
          <Picker
            label="Role"
            value={filter.role}
            options={facets.roles.map((role) => ({ value: role, label: capital(role) }))}
            onChange={(value) => narrow('role', value as RosterFilter['role'])}
          />
        </div>
      )}

      {rosterLoading && roster.length === 0 ? (
        <p className={styles.empty}>Reading the roster…</p>
      ) : roster.length === 0 ? (
        <p className={styles.empty}>
          You have no champions yet. Choose a starter from the Haven first.
        </p>
      ) : view.length === 0 ? (
        <p className={styles.empty}>Nothing matches that.</p>
      ) : (
        // The same painted card the roster draws, which is the point: a player choosing who
        // to send should be looking at exactly what they looked at when they decided who was
        // worth levelling. A name and a level in a row cannot say rarity, affinity or power,
        // and those are the three things the choice turns on.
        <div className={styles.roster}>
          {view.map(({ champion, def }) => {
            const allowed = eligible ? eligible(champion.championKey) : true;
            const index = team.indexOf(champion.id);
            return (
              <div
                key={champion.id}
                className={allowed ? undefined : styles.barred}
                title={allowed ? undefined : barredReason}
              >
                <ChampionCard
                  champion={champion}
                  def={def}
                  size={ROSTER_CARD}
                  selectable
                  selected={index >= 0}
                  // The *position*, not just a tick: slot one is the leader and the aura
                  // above is about whoever is standing there, so a picker that only said
                  // "selected" would hide the one part of the order that matters.
                  {...(index >= 0 ? { badge: index === 0 ? 'L' : String(index + 1) } : {})}
                  // Dimmed rather than removed. A ward is a puzzle about a roster, and a
                  // roster with the wrong half hidden cannot be reasoned about — the answer
                  // to "who else could I bring" is usually somebody you had forgotten you
                  // had. Picking one is allowed; starting with one is not.
                  onOpen={() => onToggle(champion.id)}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.footer}>{footer}</div>
    </div>
  );
}

/** Smaller than the roster screen's 108, because this grid shares a window with two lineups. */
const ROSTER_CARD = 96;

/**
 * The face in a formation slot, bigger than a card in the roster below it.
 *
 * Deliberately the other way round from the first cut, which drew 72px slots over 96px
 * cards: the four you have chosen are the subject of the screen and the thirty you are
 * choosing from are the list. Four of these plus their padding come to ~480px, which fits
 * inside the narrowest side the layout allows before it stacks.
 */
const SLOT_FACE = 104;

/** A content enum as a word. The roster screen capitalises these the same way. */
function capital(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

/** One side's aura line and heading. */
function Banner({ side }: { side: LineupSide }): JSX.Element {
  return (
    <header className={styles.banner}>
      <span className={styles.bannerLabel}>{side.label}</span>
      {side.aura ? (
        <p className={styles.aura} data-idle={side.auraIdle === true}>
          <span className={styles.auraTag}>Aura</span>
          {side.aura}
          {/* Said rather than hidden: an aura that does nothing here is exactly the mistake
              worth catching before the energy is spent, and silence teaches nobody. */}
          {side.auraIdle && <span className={styles.auraIdleNote}> — not in this fight</span>}
        </p>
      ) : side.auraHint ? (
        <p className={styles.aura} data-idle="true">
          <span className={styles.auraTag}>Aura</span>
          {side.auraHint}
        </p>
      ) : null}
    </header>
  );
}

/** One narrowing dropdown, offering only what the account actually holds. */
function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className={styles.filterField}>
      <span className={styles.fieldLabel}>{label}</span>
      <select
        className={styles.select}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="any">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The aura sentence for whoever is in slot one, and whether it does anything here.
 *
 * Exported because both callers need it and neither should be re-deriving "who is the
 * leader" — that is the first entry of `team`, everywhere in the game.
 */
export function leaderAura(
  team: readonly string[],
  roster: readonly RosterChampion[],
  defs: ReadonlyMap<string, ChampionDef>,
  factions: readonly FactionDef[] | undefined,
  mode: string,
): { aura: string | null; idle: boolean } {
  const leader = roster.find((entry) => entry.id === team[0]);
  const def = leader ? defs.get(leader.championKey) : undefined;
  if (!def?.aura) return { aura: null, idle: false };
  const faction = factions?.find((entry) => entry.key === def.factionKey);
  return {
    aura: auraText(def.aura, {
      element: def.element,
      ...(faction ? { faction: faction.name } : {}),
    }),
    idle: !auraApplies(def.aura, mode),
  };
}
