import { useEffect, useRef } from 'react';
import { FloatingText } from '@/fui/components/FloatingText.ts';
import { slotPosition } from '@/game/battleScene';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '@/game/stage';
import type { Floater } from '@/game/playback';
import styles from './Floaters.module.scss';

/**
 * The numbers that come off a hit, drawn by the library.
 *
 * The first pass positioned a `<span>` at the unit's slot and left it there, which put every
 * damage number *inside* the champion who took it and stacked simultaneous hits on top of
 * one another. The library has a component for exactly this — `FloatingText` manages a whole
 * layer, jitters simultaneous spawns apart, rises and fades, and cleans its own nodes up — so
 * it does the job it was written for, at the owner's suggestion.
 *
 * The bridge is a little unusual: `FloatingText` is a *layer* that is told about events, not
 * a component rendered from state. So the wrapper keeps one instance for the life of the
 * screen and spawns from it as new floaters appear, remembering which ids it has already
 * shown — a floater is an event that happened once, and re-spawning it on every re-render
 * would leave the field snowing numbers.
 */
export function Floaters({ floaters }: { floaters: readonly Floater[] }): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<FloatingText | null>(null);
  const shown = useRef(new Set<number>());

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;
    const text = new FloatingText({ anchor: mount });
    layer.current = text;
    return () => {
      layer.current = null;
      text.destroy();
    };
  }, []);

  useEffect(() => {
    const text = layer.current;
    const mount = host.current;
    if (!text || !mount) return;

    const box = mount.getBoundingClientRect();
    for (const floater of floaters) {
      if (shown.current.has(floater.id)) continue;
      shown.current.add(floater.id);

      // Above the head rather than at the feet: `slotPosition` anchors a unit where it
      // stands, and a champion is 176 virtual rows tall.
      const at = slotPosition(floater.ref.side, floater.ref.slot);
      text.spawn((at.x / VIRTUAL_WIDTH) * box.width, ((at.y - 200) / VIRTUAL_HEIGHT) * box.height, {
        value: floater.text,
        kind: KIND[floater.kind] ?? 'info',
      });
    }

    // The set is the only thing that grows for the life of a fight; a long Depths floor is
    // a few hundred entries, and it is emptied when the ids restart from a new battle.
    if (floaters.length === 0 && shown.current.size > 512) shown.current.clear();
  }, [floaters]);

  return <div className={styles.layer} ref={host} aria-hidden="true" />;
}

/** Mistvale's five kinds onto the library's eight. */
const KIND: Record<Floater['kind'], 'damage' | 'heal' | 'miss' | 'info'> = {
  damage: 'damage',
  heal: 'heal',
  resist: 'miss',
  shield: 'info',
  status: 'info',
};
