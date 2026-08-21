import { create } from 'zustand';
import type { Difficulty } from '@mistvale/shared';

/**
 * Where the player is in the campaign's three steps.
 *
 * The screen used to hold both of these in `useState`, which was fine while the map and the
 * stage strip were one screen. They are not any more: a stage opens the team chooser, the
 * team chooser starts a fight, and the fight unmounts the campaign entirely — so local
 * state meant every victory dropped the player back on the world map, several clicks from
 * the stage they had just cleared and were about to run again. Farming is the loop this
 * game is made of, and that was a tax on every lap of it.
 *
 * It holds a chapter *key* and a difficulty and nothing else. What is in that chapter is
 * read from content, and what has been done to it from progress — so a chapter deleted in
 * Admin resolves to nothing and the screen falls back to the map rather than to a hole.
 */

interface CampaignState {
  difficulty: Difficulty;
  /** The chapter whose stages are open, or null for the world map. */
  chapterKey: string | null;

  setDifficulty: (difficulty: Difficulty) => void;
  openChapter: (key: string | null) => void;
  reset: () => void;
}

const empty = (): Pick<CampaignState, 'difficulty' | 'chapterKey'> => ({
  difficulty: 'normal',
  chapterKey: null,
});

export const useCampaignStore = create<CampaignState>((set) => ({
  ...empty(),

  setDifficulty(difficulty) {
    // The chapter is kept: switching to Hard on chapter 4 should show chapter 4 on Hard,
    // which is the comparison a player is making when they press it.
    set({ difficulty });
  },

  openChapter(key) {
    set({ chapterKey: key });
  },

  reset() {
    set({ ...empty() });
  },
}));
