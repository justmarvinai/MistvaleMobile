import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchSeconds, peakOf, renderPatch } from '@mistvale/shared';
import { SOUND_CUES } from '../db/seed/data/sounds';

/**
 * Renders the seeded catalogue to WAV files, for listening to (C51).
 *
 * Sound is the one kind of content nobody can review in a diff, and the game's own engine
 * runs in a browser after a gesture — so this is how a cue gets *heard* before it is
 * published: `pnpm --filter @mistvale/server sounds:render [dir]` writes one stereo WAV per
 * synthesised cue, a `_highlights.wav` of the eighteen a player meets most, and a table of
 * what each one measures. It is the art sheet, for the ears.
 *
 * It reads the seed rather than the database on purpose: what an operator retunes in Admin
 * plays in the game the moment it is published, and what this renders is what a *release*
 * will ship.
 */

const RATE = 44_100;
const OUT = process.argv[2] ?? join(process.cwd(), 'sound-render');

/** The ones a player hears in their first hour, in the order they meet them. */
const HIGHLIGHTS = [
  'ui_press',
  'ui_open',
  'ui_denied',
  'ui_claim',
  'reward_silver',
  'reward_crystals',
  'relic_drop',
  'forge_success',
  'battle_cast_ember',
  'battle_hit',
  'battle_crit',
  'battle_heal',
  'battle_death',
  'level_up',
  'victory',
  'summon_burst',
  'summon_epic',
  'summon_legendary',
];

function wav(left: Float32Array, right: Float32Array): Buffer {
  const frames = left.length;
  const data = Buffer.alloc(44 + frames * 4);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + frames * 4, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(frames * 4, 40);
  const clamp = (v: number): number => Math.max(-32_768, Math.min(32_767, Math.round(v * 32_767)));
  for (let i = 0; i < frames; i += 1) {
    data.writeInt16LE(clamp(left[i] ?? 0), 44 + i * 4);
    data.writeInt16LE(clamp(right[i] ?? 0), 46 + i * 4);
  }
  return data;
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const reel: { left: number[]; right: number[] } = { left: [], right: [] };
  const gap = Math.round(RATE * 0.4);
  const rows: string[] = [];

  for (const cue of SOUND_CUES) {
    if (cue.sample) continue;
    const started = Date.now();
    const out = renderPatch(cue.patch, RATE);
    const ms = Date.now() - started;
    const peak = peakOf(out);
    let energy = 0;
    for (let i = 0; i < out.left.length; i += 1) energy += out.left[i]! ** 2;
    const rms = Math.sqrt(energy / out.left.length);
    rows.push(
      `${cue.key.padEnd(20)} ${cue.bus.padEnd(4)} ${patchSeconds(cue.patch).toFixed(2)}s  peak ${peak.toFixed(2)}  rms ${rms.toFixed(3)}  ${String(ms).padStart(4)}ms`,
    );
    writeFileSync(join(OUT, `${cue.key}.wav`), wav(out.left, out.right));
    if (HIGHLIGHTS.includes(cue.key)) {
      for (let i = 0; i < out.left.length; i += 1) {
        reel.left.push(out.left[i]!);
        reel.right.push(out.right[i]!);
      }
      for (let i = 0; i < gap; i += 1) {
        reel.left.push(0);
        reel.right.push(0);
      }
    }
  }

  writeFileSync(
    join(OUT, '_highlights.wav'),
    wav(Float32Array.from(reel.left), Float32Array.from(reel.right)),
  );
  console.log(rows.join('\n'));
  console.log(
    `\n${rows.length} cues → ${OUT} (highlights ${(reel.left.length / RATE).toFixed(1)}s)`,
  );
}

main();
