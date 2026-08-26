import { useLayoutEffect } from 'react';
import { BottomNav } from '@/fui/components/BottomNav.ts';
import { useFui } from '@/fui/react';
import { DOCK_SCREENS, isHub, isScreenUnlocked, screensInHub, type ScreenId } from './screens';
import { usePlayerStore, type DockBadges } from '@/state/playerStore';
import { HIGHLIGHT_ATTR } from './highlight';
import styles from './Dock.module.scss';

/**
 * The bottom navigation dock.
 *
 * Painted by the library since the design rework — the rail, the active lift, the tinted
 * glyphs and the badge bubbles are its `BottomNav`. Everything Mistvale asks of it beyond
 * that is written onto the buttons afterwards, because they are things the library has no
 * reason to know about:
 *
 * Locked destinations stay visible behind a mist shroud rather than disappearing —
 * seeing what is coming is part of the pull forward (docs/UI_UX_DESIGN.md §2) — and each
 * one keeps the tooltip that says when it opens. Number keys 1-9 jump straight to a slot,
 * and the hint sits in the corner of the first nine.
 *
 * Pips come off the player snapshot rather than a poll: the shell re-fetches it after
 * every action, which is exactly when something becomes claimable (UI_UX §1.3).
 */
/**
 * How many things are waiting behind a dock slot.
 *
 * A hub has no claimable list of its own — quests, missions, events and the calendar are
 * all *inside* Errands now — so a hub that read its own badge would read zero forever, and
 * the pip that tells somebody their daily chest is ready would have disappeared in C12.
 * It sums what its members are holding instead, and skips a member the account has not
 * unlocked: a locked screen's badge is a promise about somebody else's account.
 */
function waitingIn(
  id: ScreenId,
  badges: DockBadges,
  unlocks: Parameters<typeof isScreenUnlocked>[1],
): number {
  if (!isHub(id)) return badges[id as keyof DockBadges] ?? 0;
  return screensInHub(id)
    .filter((member) => isScreenUnlocked(member, unlocks))
    .reduce((total, member) => total + (badges[member.id as keyof DockBadges] ?? 0), 0);
}

export function Dock({
  current,
  onNavigate,
}: {
  current: ScreenId;
  onNavigate: (id: ScreenId) => void;
}) {
  const unlocks = usePlayerStore((state) => state.unlocks);
  const badges = usePlayerStore((state) => state.badges);

  const items = DOCK_SCREENS.map((screen) => {
    const unlocked = isScreenUnlocked(screen, unlocks);
    const waiting = unlocked ? waitingIn(screen.id, badges, unlocks) : 0;
    return {
      id: screen.id,
      label: screen.label,
      glyph: screen.glyph,
      // **Not the library's `disabled`.** That sets the HTML attribute, which takes the
      // button out of the tab order — and a locked destination whose whole job is to say
      // "opens at level 8" is then a thing a keyboard user cannot reach to be told. It
      // stays focusable and is refused below instead.
      unlocked,
      ...(waiting > 0 ? { badge: waiting } : {}),
    };
  });

  const { ref, instance } = useFui(
    BottomNav,
    { class: styles.dock, active: current, items },
    {
      // The library selects locally on click and tells us; the router is still the one
      // that decides what is on screen, and `apply` below puts the selection back in step
      // if navigation was refused or came from somewhere else.
      'nav:change': ({ id }: { id: string }) => {
        const screen = DOCK_SCREENS.find((entry) => entry.id === id);
        // A locked entry is focusable and clickable, so the refusal lives here. `apply`
        // puts the library's own selection back where the router says it is.
        if (screen && isScreenUnlocked(screen, unlocks)) onNavigate(id as ScreenId);
      },
    },
    (nav, next) => {
      if (next.active && nav.active !== next.active) nav.select(next.active, { silent: true });
      for (const item of next.items) nav.setBadge(item.id, item.badge ?? 0);
    },
  );

  // The three things the library has no option for, written onto its own buttons: the
  // tutorial's highlight hook (which measures a box, so it has to be on the real
  // element), the locked tooltip, and the hotkey hint.
  useLayoutEffect(() => {
    const root = instance?.el;
    if (!root) return;
    DOCK_SCREENS.forEach((screen, index) => {
      const button = root.querySelector<HTMLElement>(`[data-id="${screen.id}"]`);
      if (!button) return;
      button.setAttribute(HIGHLIGHT_ATTR, `dock:${screen.id}`);
      const unlocked = isScreenUnlocked(screen, unlocks);
      button.title = unlocked ? screen.label : (screen.lockedHint ?? 'Still locked');
      button.setAttribute('aria-disabled', String(!unlocked));
      if (index < 9 && !button.querySelector(`.${styles.hotkey}`)) {
        const hint = document.createElement('span');
        hint.className = styles.hotkey ?? '';
        hint.setAttribute('aria-hidden', 'true');
        hint.textContent = String(index + 1);
        button.appendChild(hint);
      }
    });
  });

  return <div ref={ref} style={{ display: 'contents' }} />;
}
