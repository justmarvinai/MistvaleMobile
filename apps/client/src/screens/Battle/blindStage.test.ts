import { describe, expect, it } from 'vitest';
import { blindMessage, blindReason, type BattlefieldState } from './blindStage';

const healthy: BattlefieldState = { units: 5, hasStage: true, attached: true, drawn: 5 };

describe('telling the player why the battlefield is blank', () => {
  it('says nothing about a fight that is being drawn', () => {
    expect(blindReason(healthy)).toBeNull();
  });

  it('stays quiet when there is nothing to draw', () => {
    // Between waves, and before the board arrives. An empty field is correct here, and a
    // notice that flickers on every wave transition is one everybody learns to ignore.
    for (const state of [
      { ...healthy, units: 0, drawn: 0 },
      { ...healthy, units: 0, hasStage: false, attached: false, drawn: 0 },
    ]) {
      expect(blindReason(state)).toBeNull();
    }
  });

  it('names a missing graphics context first, because nothing else can be true', () => {
    // `Application.init` failed or never resolved. Everything handed to `setScene` is held
    // pending and nothing is ever painted, so the other three signals are meaningless.
    expect(blindReason({ ...healthy, hasStage: false, attached: false, drawn: 0 })).toBe(
      'no-context',
    );
  });

  it('names a draw that threw', () => {
    // `sync` is async and was called with `void`, so a throw inside it was an unhandled
    // rejection and the field simply stayed empty.
    expect(blindReason({ ...healthy, drawn: 0, drawError: 'boom' })).toBe('draw-failed');
  });

  it('names a stage that something else took', () => {
    // `PixiStage` re-initialising attaches the ambient mist, which is right when nothing
    // else wants the stage and invisible-battle when a fight is running.
    expect(blindReason({ ...healthy, attached: false })).toBe('stage-taken');
  });

  it('names an attached scene that drew nobody', () => {
    expect(blindReason({ ...healthy, drawn: 0 })).toBe('nothing-drawn');
  });

  it('has a distinct sentence for every cause, each promising the fight is fine', () => {
    const reasons = ['no-context', 'draw-failed', 'stage-taken', 'nothing-drawn'] as const;
    const messages = reasons.map((reason) => blindMessage(reason));
    expect(new Set(messages).size, 'a screenshot can tell them apart').toBe(reasons.length);
    for (const message of messages) expect(message).toContain('the result are the server');
  });

  it('carries the underlying detail when there is one', () => {
    expect(blindMessage('no-context', 'WebGL unsupported')).toContain('WebGL unsupported');
    expect(blindMessage('draw-failed', 'texture blew up')).toContain('texture blew up');
  });
});
