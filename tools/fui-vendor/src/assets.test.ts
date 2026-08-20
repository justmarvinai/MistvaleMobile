import { describe, expect, it } from 'vitest';
import { pruneAssetsCss } from './assets';

const css = `:root {
  --fui-img-panel-stone: url("/fui/dark-ember/panel-stone.png");
  --fui-bw-panel-stone: 24px;
  --fui-slice-panel-stone: 24;
  --fui-img-bar-track-stone: url("/fui/stone-vine/bar-track-stone.png");
  --fui-ar-bar-track-stone: 700 / 64;
  --fui-img-bar-track-stone-1: url("/fui/stone-vine/bar-track-stone-1.png");
  --fui-ar-bar-track-stone-1: 700 / 64;
  --fui-font-body: "Pixelify Sans", sans-serif;
}
`;

const onDisk = new Set(['dark-ember/panel-stone.png', 'stone-vine/bar-track-stone-1.png']);
const has = (file: string) => onDisk.has(file);

describe('pruning assets.css to the art that was vendored', () => {
  it('keeps an asset whose image is on disk, with its companions', () => {
    const out = pruneAssetsCss(css, has);
    expect(out).toContain('--fui-img-panel-stone:');
    expect(out).toContain('--fui-bw-panel-stone:');
    expect(out).toContain('--fui-slice-panel-stone:');
  });

  it('drops an asset whose image is missing, and its companions with it', () => {
    const out = pruneAssetsCss(css, has);
    // The whole point: Vite warns once per unresolvable url(), on every production build.
    expect(out).not.toContain('--fui-img-bar-track-stone:');
    expect(out).not.toContain('--fui-ar-bar-track-stone:');
  });

  it('does not confuse an id with one that has it as a prefix', () => {
    // `bar-track-stone` is missing; `bar-track-stone-1` is present. Matching on the id
    // rather than on a prefix is the difference between pruning one and pruning both.
    const out = pruneAssetsCss(css, has);
    expect(out).toContain('--fui-img-bar-track-stone-1:');
    expect(out).toContain('--fui-ar-bar-track-stone-1:');
  });

  it('leaves declarations that are not art alone', () => {
    expect(pruneAssetsCss(css, has)).toContain('--fui-font-body:');
  });

  it('returns the stylesheet untouched when nothing is missing', () => {
    expect(pruneAssetsCss(css, () => true)).toBe(css);
  });
});
