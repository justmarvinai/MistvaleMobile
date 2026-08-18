import type { CSSProperties } from 'react';
import { ICON_NAMES, type IconName } from './names';
import styles from './Icon.module.scss';

export interface IconProps {
  name: IconName;
  /** Edge length in pixels. Icons are square and drawn on a 512-unit grid. */
  size?: number;
  /** Rendered instead of the surrounding text colour. */
  color?: string;
  /**
   * Describe the icon when it carries meaning nothing else on screen carries. Leave it
   * out and the icon is hidden from assistive technology — which is right far more often
   * than not, because most of these sit beside a label that already says it.
   */
  label?: string;
  className?: string;
}

/**
 * One icon from the game-icons.net set.
 *
 * The set is fetched, normalised and attributed by `tools/icon-fetch` into a single SVG
 * sprite, which `mountIconSprite` injects once per page. Drawing them is then a `<use>` —
 * no per-icon request, no layout shift, and `currentColor` so an icon takes the colour of
 * whatever it sits in.
 *
 * The sprite has to be *inlined* rather than referenced as `/icons/icons.svg#mv-silver`:
 * `currentColor` does not cross into an externally-referenced document in every browser,
 * and an icon that ignores its surroundings is worse than no icon.
 *
 * Eighty of these existed and shipped, generated on every build, and nothing in the client
 * had ever referenced one — the interface drew Unicode glyphs and a colour-emoji padlock
 * instead.
 */
export function Icon({ name, size = 16, color, label, className }: IconProps): JSX.Element {
  const style: CSSProperties = { width: size, height: size };
  if (color) style.color = color;

  return (
    <svg
      className={[styles.icon, className].filter(Boolean).join(' ')}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <use href={`#mv-${name}`} />
    </svg>
  );
}

export { ICON_NAMES, type IconName };
