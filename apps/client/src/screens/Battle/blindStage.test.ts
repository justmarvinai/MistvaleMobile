import { describe, expect, it } from 'vitest';
import { battlefieldIsBlind, type BattlefieldState } from './blindStage';

const healthy: BattlefieldState = { units: 5, hasStage: true, attached: true, drawn: 5 };

describe('telling the player the battlefield could not be drawn', () => {
  it('says nothing about a fight that is being drawn', () => {
    expect(battlefieldIsBlind(healthy)).toBe(false);
  });

  it('stays quiet when there is nothing to draw', () => {
    // Between waves, and before the board arrives. An empty field is correct here, and a
    // notice that flickers on every wave transition is one everybody learns to ignore.
    for (const state of [
      { ...healthy, units: 0, drawn: 0 },
      { ...healthy, units: 0, hasStage: false, attached: false, drawn: 0 },
    ]) {
      expect(battlefieldIsBlind(state)).toBe(false);
    }
  });

  it('speaks up when there is no graphics context at all', () => {
    // `initStage` never resolved, or the stage was destroyed and not rebuilt. Everything
    // handed to `setScene` is held pending and nothing is ever painted.
    expect(battlefieldIsBlind({ ...healthy, hasStage: false })).toBe(true);
  });

  it('speaks up when something else took the stage', () => {
    // The specific shape of it: `PixiStage` re-initialising attaches the ambient mist,
    // which is right when nothing else wants the stage and invisible-battle when a fight
    // is running.
    expect(battlefieldIsBlind({ ...healthy, attached: false })).toBe(true);
  });

  it('speaks up when the scene is attached but has drawn nobody', () => {
    // A scene rebuilt mid-fight and never re-synced: attached, alive, and empty.
    expect(battlefieldIsBlind({ ...healthy, drawn: 0 })).toBe(true);
  });
});
