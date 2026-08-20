import { useMemo, useState } from 'react';
import type { UnitRef } from '@mistvale/engine';
import { slotPosition } from '@/game/battleScene';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '@/game/stage';
import { useContentStore } from '@/state/contentStore';
import { useTooltip } from '@/ui/Tooltip/useTooltip';
import type { PlaybackView, StatusChip, VisualUnit } from '@/game/playback';
import { statusTip } from './combatTips';
import styles from './UnitOverlay.module.scss';

/**
 * The part of the battlefield a player can point at.
 *
 * Everything on the field itself is painted — by WebGL usually, by `DomBattlefield` when
 * that is not available — and paint cannot be hovered, focused or reached by a keyboard. So
 * the three things that need a pointer live in one DOM layer over the top of whichever
 * renderer is running, positioned by the same `slotPosition` both of them use:
 *
 * - **who a skill lands on.** A single-target skill leaves a genuine decision and the
 *   client had no way to express it, even though `BattleAction.target` has been in the
 *   engine's contract since P3.
 * - **who auto-battle concentrates on.** The same gesture, remembered across turns: the
 *   engine takes it as a preference and ignores it when the skill leaves no choice.
 * - **what is on a unit.** Buffs and debuffs were four-pixel pips on the canvas, which is
 *   a colour and no information. They are chips here, blue and red, each with the tooltip
 *   that says what it does and how long it lasts.
 *
 * Deliberately *not* a third renderer: it draws no unit and no health. If it ever starts
 * to, the two real renderers have a third to stay in step with.
 */
export function UnitOverlay({
  view,
  target,
  focus,
  onPick,
  pickable,
}: {
  view: PlaybackView;
  /** The enemy this turn's skill will land on, if the player has chosen one. */
  target: UnitRef | null;
  /** The enemy auto-battle is concentrating on. */
  focus: UnitRef | null;
  onPick: (ref: UnitRef) => void;
  /** False while the fight is playing out — there is nothing to choose then. */
  pickable: boolean;
}): JSX.Element {
  const units = useMemo(() => [...view.allies, ...view.enemies], [view.allies, view.enemies]);

  return (
    <div className={styles.layer}>
      <div className={styles.canvas}>
        {units.map((unit) => (
          <UnitMarks
            key={`${unit.ref.side}:${unit.ref.slot}`}
            unit={unit}
            selected={same(target, unit.ref)}
            focused={same(focus, unit.ref)}
            pickable={pickable && unit.alive}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

function UnitMarks({
  unit,
  selected,
  focused,
  pickable,
  onPick,
}: {
  unit: VisualUnit;
  selected: boolean;
  focused: boolean;
  pickable: boolean;
  onPick: (ref: UnitRef) => void;
}): JSX.Element {
  const at = slotPosition(unit.ref.side, unit.ref.slot);
  const chips = [...unit.buffs, ...unit.debuffs];

  return (
    <div
      className={styles.unit}
      style={{
        left: `${(at.x / VIRTUAL_WIDTH) * 100}%`,
        top: `${(at.y / VIRTUAL_HEIGHT) * 100}%`,
      }}
      data-selected={selected}
      data-focused={focused}
    >
      {/* A champion's own footprint, so the click lands where the champion is rather than
          on a rectangle that happens to contain them. */}
      <button
        type="button"
        className={styles.hit}
        disabled={!pickable}
        aria-label={`${unit.name}${unit.alive ? '' : ' (fallen)'}`}
        aria-pressed={selected || focused}
        onClick={() => onPick(unit.ref)}
      />
      {chips.length > 0 && (
        <span className={styles.chips}>
          {chips.map((chip) => (
            <Chip key={`${chip.kind}:${chip.key}`} chip={chip} />
          ))}
        </span>
      )}
    </div>
  );
}

/** One buff or debuff: a coloured mark, its turn count, and the words behind it. */
function Chip({ chip }: { chip: StatusChip }): JSX.Element {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const def = useContentStore((state) =>
    state.bundle?.statuses.find((status) => status.key === chip.key),
  );
  useTooltip(element, statusTip(chip, def));

  return (
    <span
      ref={setElement}
      className={styles.chip}
      data-kind={chip.kind}
      tabIndex={0}
      role="img"
      aria-label={`${def?.name ?? chip.key}, ${chip.kind}, ${chip.turns} turns left`}
    >
      {chip.turns}
    </span>
  );
}

function same(a: UnitRef | null, b: UnitRef): boolean {
  return a !== null && a.side === b.side && a.slot === b.slot;
}
