import { describe, expect, it } from 'vitest';
import type { ChampionDef, RosterChampion } from '@mistvale/shared';
import { avatarFaces } from './faces';

function def(key: string, over: Partial<ChampionDef> = {}): ChampionDef {
  return { key, name: key, isFood: false, ...over } as ChampionDef;
}

function owned(championKey: string, power: number, id = `${championKey}-${power}`): RosterChampion {
  return {
    id,
    championKey,
    level: 1,
    rank: 1,
    ascension: 0,
    xp: 0,
    locked: false,
    favourite: false,
    levelCap: 10,
    xpToNextLevel: 0,
    power,
    equippedGearIds: [],
  };
}

describe('avatarFaces', () => {
  it('offers each champion once, however many copies are held', () => {
    const faces = avatarFaces(
      [owned('anuria', 100), owned('anuria', 400), owned('thordakk', 200)],
      [def('anuria'), def('thordakk')],
    );
    expect(faces.map((face) => face.def.key)).toEqual(['anuria', 'thordakk']);
  });

  it('draws the strongest copy of each', () => {
    const faces = avatarFaces([owned('anuria', 100), owned('anuria', 400)], [def('anuria')]);
    expect(faces[0]?.champion.power).toBe(400);
  });

  it('leaves food out, however strong it is', () => {
    const faces = avatarFaces(
      [owned('broodling', 9_999), owned('anuria', 100)],
      [def('broodling', { isFood: true }), def('anuria')],
    );
    expect(faces.map((face) => face.def.key)).toEqual(['anuria']);
  });

  it('drops a copy whose champion is no longer published', () => {
    const faces = avatarFaces([owned('retired', 500), owned('anuria', 100)], [def('anuria')]);
    expect(faces.map((face) => face.def.key)).toEqual(['anuria']);
  });

  it('puts the strongest first, and breaks a tie by name so the order never shuffles', () => {
    const faces = avatarFaces(
      [owned('zephyr', 100), owned('anuria', 100), owned('mira', 300)],
      [def('zephyr'), def('anuria'), def('mira')],
    );
    expect(faces.map((face) => face.def.key)).toEqual(['mira', 'anuria', 'zephyr']);
  });

  it('answers an empty roster with nothing rather than throwing', () => {
    expect(avatarFaces([], [def('anuria')])).toEqual([]);
  });
});
