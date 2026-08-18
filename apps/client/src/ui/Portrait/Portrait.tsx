import { useState } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './Portrait.module.scss';

export interface PortraitProps {
  /** Where the avatar would be, if one has been drawn. */
  src: string | null;
  /** For the alt text and the placeholder's tooltip. */
  name?: string;
  size?: number;
  className?: string;
}

/**
 * A champion's face, or an honest stand-in for one.
 *
 * Thirty of the thirty-seven champions are art-pending and share a placeholder asset that
 * has no avatar file at all; four of the seven with real art are missing theirs too. So for
 * **34 of 37 champions** every roster card, Chronicle row and Mistgate reveal drew the
 * browser's broken-image glyph — which is the single ugliest thing a collection game can
 * put on its collection screen.
 *
 * The answer is not to hide the gap but to fill it: a hooded silhouette that says "a warden
 * you have not met yet". It reads the same whether the art arrives next week or never, and
 * swapping a real portrait in later is a file appearing rather than a code change.
 *
 * `onError` rather than checking a manifest first, deliberately. The client cannot know
 * which files exist — and under the SPA's catch-all a missing one arrives as an HTML page
 * with a 200, which no amount of looking ahead would have caught. Letting the browser try
 * and answering its failure is the only check that tells the truth.
 */
export function Portrait({ src, name, size = 96, className }: PortraitProps): JSX.Element {
  // Which *source* failed, rather than a boolean that an effect has to reset: a card slot
  // holding a different champion a moment later deserves its own attempt, and remembering
  // the url gets that for free without a render that lies for one frame.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const missing = !src || failedSrc === src;

  return (
    <span
      className={[styles.portrait, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      title={missing && name ? `${name} — portrait not yet drawn` : undefined}
    >
      {missing ? (
        <Icon name="portrait-unknown" size={Math.round(size * 0.62)} className={styles.unknown} />
      ) : (
        <img src={src} alt={name ?? ''} loading="lazy" onError={() => setFailedSrc(src)} />
      )}
    </span>
  );
}
