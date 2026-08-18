/**
 * Puts the icon sprite into the page, once.
 *
 * `<use href="#mv-silver">` needs the symbol in the *same* document — an external
 * reference (`/icons/icons.svg#mv-silver`) does not inherit `currentColor` in every
 * browser, and an icon that ignores the colour around it is worse than a glyph.
 *
 * One request for the whole set, injected before first paint of anything that uses it.
 * Failure is silent by design: the sprite is decoration, and a game that cannot reach one
 * static file should still be playable. An icon whose symbol is absent renders as nothing
 * rather than as a broken box.
 */

const SPRITE_URL = '/icons/icons.svg';
const CONTAINER_ID = 'mv-icon-sprite';

let mounting: Promise<void> | null = null;

export async function mountIconSprite(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (document.getElementById(CONTAINER_ID)) return;

  // Not `??=` on a rejected promise: a transient failure must not disable icons for the
  // rest of the session, so a failed attempt clears the latch and the next caller retries.
  mounting ??= (async () => {
    try {
      const response = await fetch(SPRITE_URL);
      if (!response.ok) throw new Error(`icon sprite: ${response.status}`);
      const markup = await response.text();
      // A missing file served as the SPA shell — see the `try_files` note in the nginx
      // site — would otherwise be injected as a page inside the page.
      if (!markup.trimStart().startsWith('<svg')) throw new Error('icon sprite: not an SVG');
      if (document.getElementById(CONTAINER_ID)) return;

      const holder = document.createElement('div');
      holder.id = CONTAINER_ID;
      holder.setAttribute('aria-hidden', 'true');
      holder.style.position = 'absolute';
      holder.style.width = '0';
      holder.style.height = '0';
      holder.style.overflow = 'hidden';
      holder.innerHTML = markup;
      document.body.prepend(holder);
    } finally {
      mounting = null;
    }
  })();

  await mounting.catch(() => undefined);
}
