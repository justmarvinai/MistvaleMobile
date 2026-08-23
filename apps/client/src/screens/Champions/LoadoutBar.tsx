import { useEffect, useMemo, useState } from 'react';
import type { GearInstance, Loadout } from '@mistvale/shared';
import { LOADOUT_NAME_MAX, planLoadout, slotsCovered, type PlannableGear } from '@mistvale/shared';
import { Button } from '@/ui/Button/Button';
import { TextField } from '@/ui/TextField/TextField';
import { useLoadoutSetStore } from '@/state/loadoutSetStore';
import { relicGlyph } from '@/ui/relicArt';
import { useTip } from '@/ui/Tooltip/useTooltip';
import styles from './LoadoutBar.module.scss';

/**
 * Saved relic sets, on the champion sheet.
 *
 * Moving a build was nine unequips, nine equips and nine things to remember — the owner's
 * list named it as the small change felt most often. It lives on the paperdoll rather than
 * in the vault because that is where a build *is*: the nine sockets you are looking at when
 * you decide this set should be on somebody else.
 *
 * **Each row says what applying it would do before it is pressed.** The plan comes from
 * `planLoadout`, the same pure function the server applies with, so the sentence under a
 * loadout is not a guess — a relic that has been sold says so, and an accessory the
 * champion has not ascended to says which ascension it wants.
 */
export function LoadoutBar({
  championId,
  ascension,
  gear,
  busy,
  onApplied,
}: {
  championId: string;
  ascension: number;
  /** Every relic the account owns — the planner needs the ones on other champions too. */
  gear: readonly GearInstance[];
  busy: boolean;
  onApplied: (message: string) => void;
}): JSX.Element {
  const loadouts = useLoadoutSetStore((state) => state.loadouts);
  const loaded = useLoadoutSetStore((state) => state.loaded);
  const load = useLoadoutSetStore((state) => state.load);
  const save = useLoadoutSetStore((state) => state.save);
  const forget = useLoadoutSetStore((state) => state.forget);
  const apply = useLoadoutSetStore((state) => state.apply);

  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const plannable = useMemo<PlannableGear[]>(
    () =>
      gear.map((piece) => ({
        id: piece.id,
        slot: piece.slot,
        equippedChampionId: piece.equippedChampionId,
      })),
    [gear],
  );

  const wearingAnything = gear.some((piece) => piece.equippedChampionId === championId);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setWorking(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be done.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className={styles.bar} aria-label="Saved relic sets">
      <header className={styles.head}>
        <h3 className={styles.title}>Saved sets</h3>
        {naming ? (
          <form
            className={styles.namer}
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = name.trim();
              if (!trimmed) return;
              void run(async () => {
                await save(trimmed, championId);
                setNaming(false);
                setName('');
                onApplied(`Saved as “${trimmed}”.`);
              });
            }}
          >
            <TextField
              label="Name this set"
              value={name}
              placeholder="Speed set"
              maxLength={LOADOUT_NAME_MAX}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
            <Button size="sm" type="submit" disabled={working || !name.trim()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setNaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || working || !wearingAnything}
            onClick={() => setNaming(true)}
          >
            Save what is worn
          </Button>
        )}
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {!loaded ? null : loadouts.length === 0 ? (
        <p className={styles.none}>
          None yet. Gear a champion the way you want them, then save it — and it goes onto anybody
          else in one press.
        </p>
      ) : (
        <ul className={styles.list}>
          {loadouts.map((loadout) => (
            <Row
              key={loadout.id}
              loadout={loadout}
              plannable={plannable}
              championId={championId}
              ascension={ascension}
              busy={busy || working}
              onApply={() =>
                void run(async () => {
                  const result = await apply(loadout.id, championId);
                  const moved = result.plan.equip.length;
                  onApplied(
                    `${loadout.name} — ${moved} ${moved === 1 ? 'relic' : 'relics'} moved.`,
                  );
                })
              }
              onForget={() =>
                void run(async () => {
                  await forget(loadout.id);
                  onApplied(`Forgot “${loadout.name}”.`);
                })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({
  loadout,
  plannable,
  championId,
  ascension,
  busy,
  onApply,
  onForget,
}: {
  loadout: Loadout;
  plannable: readonly PlannableGear[];
  championId: string;
  ascension: number;
  busy: boolean;
  onApply: () => void;
  onForget: () => void;
}): JSX.Element {
  const plan = useMemo(
    () => planLoadout(loadout.gearIds, plannable, { id: championId, ascension }),
    [loadout.gearIds, plannable, championId, ascension],
  );
  const covers = useMemo(
    () => slotsCovered(loadout.gearIds, plannable),
    [loadout.gearIds, plannable],
  );
  const nothingToDo = plan.equip.length === 0 && plan.remove.length === 0;
  // Every skip has a sentence already — the same ones the server would answer with — so
  // the row can say *why* rather than only that the button is dark.
  const trouble = plan.skipped.find((entry) => entry.reason !== 'alreadyOn');
  const tip = useTip(
    nothingToDo
      ? { title: loadout.name, flavor: trouble?.detail ?? 'Already on this champion.' }
      : {
          title: loadout.name,
          stats: [
            { label: 'Puts on', value: `${plan.equip.length}` },
            { label: 'Takes off', value: `${plan.remove.length}` },
            ...(plan.skipped.length > 0
              ? [{ label: 'Skips', value: `${plan.skipped.length}` }]
              : []),
          ],
          ...(trouble ? { flavor: trouble.detail } : {}),
        },
  );

  return (
    <li className={styles.row} data-idle={nothingToDo}>
      <div className={styles.about} ref={tip}>
        <span className={styles.name}>{loadout.name}</span>
        <span className={styles.slots} aria-label={`${covers.length} slots`}>
          {covers.map((slot) => (
            <span
              key={slot}
              className={styles.slotDot}
              // The glyph is a CSS mask the theme tints, not a character — the same
              // machinery the empty sockets on the paperdoll beside this use.
              style={{ maskImage: `var(--fui-img-${relicGlyph(slot)})` }}
              aria-hidden="true"
            />
          ))}
        </span>
      </div>
      <div className={styles.actions}>
        {/* Ghost rather than the default: `secondary` maps to the library's `long` plate,
            which carries a 250px minimum by design — right for the bottom of a screen,
            three times too wide for a row in a list. */}
        <Button size="sm" variant="ghost" disabled={busy || nothingToDo} onClick={onApply}>
          {nothingToDo ? 'Nothing to do' : 'Wear it'}
        </Button>
        <button
          type="button"
          className={styles.forget}
          disabled={busy}
          onClick={onForget}
          aria-label={`Forget ${loadout.name}`}
        >
          ×
        </button>
      </div>
    </li>
  );
}
