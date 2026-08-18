import { afterEach, describe, expect, it, vi } from 'vitest';
import { popLayer, pushLayer, resetLayers, subscribeLayers, topLayer } from './stack';

/**
 * The stack itself, without React.
 *
 * `useLayer` is a four-line wrapper around these; the ordering rules are the part worth
 * pinning, because getting them wrong is invisible until two dialogs are open at once and
 * then it is a keystroke closing the wrong one.
 */

afterEach(() => {
  resetLayers();
});

describe('the overlay stack', () => {
  it('has no top when nothing is open', () => {
    expect(topLayer()).toBeNull();
  });

  it('gives the top to whatever opened last', () => {
    pushLayer('sheet');
    expect(topLayer()).toBe('sheet');
    pushLayer('picker');
    expect(topLayer()).toBe('picker');
  });

  it('hands the top back when the upper one closes', () => {
    pushLayer('sheet');
    pushLayer('picker');
    popLayer('picker');
    expect(topLayer()).toBe('sheet');
  });

  it('keeps the order when one closes out of turn', () => {
    // A celebration can be dismissed while the dialog it landed over is still open.
    pushLayer('sheet');
    pushLayer('celebration');
    pushLayer('picker');
    popLayer('celebration');
    expect(topLayer()).toBe('picker');
    popLayer('picker');
    expect(topLayer()).toBe('sheet');
  });

  it('ignores a repeat push, so a re-render does not promote a dialog over its own child', () => {
    pushLayer('sheet');
    pushLayer('picker');
    pushLayer('sheet');
    expect(topLayer()).toBe('picker');
  });

  it('ignores a pop for something that is not open', () => {
    pushLayer('sheet');
    popLayer('never-opened');
    expect(topLayer()).toBe('sheet');
  });

  it('empties completely when everything closes', () => {
    pushLayer('sheet');
    pushLayer('picker');
    popLayer('sheet');
    popLayer('picker');
    expect(topLayer()).toBeNull();
  });

  it('tells subscribers on every change, and stops when they leave', () => {
    // This is what makes a modal re-render the moment it stops being the top one.
    const listener = vi.fn();
    const unsubscribe = subscribeLayers(listener);

    pushLayer('sheet');
    pushLayer('picker');
    popLayer('picker');
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    pushLayer('another');
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
