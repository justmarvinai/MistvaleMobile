import { describe, expect, it } from 'vitest';
import { mirrored } from './facing';

describe('which way a sprite faces', () => {
  it('leaves champion art alone on the player side', () => {
    // Authored facing right, fighting rightwards. Nothing to do.
    expect(mirrored('champions/epic_anuria', 'ally')).toBe(false);
  });

  it('turns champion art round when it fights for the other side', () => {
    // The Arena: somebody else's roster, defending.
    expect(mirrored('champions/epic_anuria', 'enemy')).toBe(true);
  });

  it('leaves enemy art alone on the enemy side', () => {
    // The bug this file exists for. Enemy art is authored facing left — already turned
    // toward the party — and the old blanket "mirror the enemy side" rule turned the
    // Sskarn round to face away from the fight.
    expect(mirrored('enemies/teritorial_lizard', 'enemy')).toBe(false);
  });

  it('turns enemy art round when it stands with the party', () => {
    // Every art-pending champion points at the shared model, and some of them are allies.
    expect(mirrored('enemies/teritorial_lizard', 'ally')).toBe(true);
  });
});
