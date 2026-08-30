import { useEffect, useMemo } from 'react';
import { allyRefusal, type BattleMode } from '@mistvale/shared';
import { Portrait } from '@/ui/Portrait/Portrait';
import { championArt } from '@/ui/championArt';
import { useContentStore } from '@/state/contentStore';
import { useWarbandStore } from '@/state/warbandStore';
import styles from './AllyStrip.module.scss';

/**
 * Borrowing a warden's champion, in the team chooser (C37).
 *
 * It lives here rather than on the Wardens screen because a borrow is a decision about
 * *this fight*: one a day, so the only place it can honestly be spent is the moment the
 * energy is about to be. A button on the list would be a borrow with no fight attached.
 *
 * The strip is drawn only when there is something to press — the mode allows an ally, the
 * allowance has one left, and at least one warden has put somebody forward. Not drawn at
 * all otherwise, for the readiness card's reason: a row that says "0 borrows left" every
 * evening is one nobody reads on the evening it matters. The two states worth explaining
 * *are* explained — a mode that refuses one says why, since "where did the strip go" is a
 * worse question than "not here".
 */

export function AllyStrip({
  mode,
  slotsFree,
  chosen,
  onChoose,
}: {
  mode: BattleMode;
  /** How many of the four are still empty. A borrow needs one. */
  slotsFree: number;
  chosen: string | null;
  onChoose: (playerId: string | null) => void;
}): JSX.Element | null {
  const warband = useWarbandStore((store) => store.warband);
  const loaded = useWarbandStore((store) => store.loaded);
  const load = useWarbandStore((store) => store.load);
  const bundle = useContentStore((store) => store.bundle);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const defs = useMemo(
    () => new Map((bundle?.champions ?? []).map((def) => [def.key, def])),
    [bundle],
  );

  const refusal = allyRefusal(mode);
  const offers = warband.wardens.filter((warden) => warden.standardBearer !== null);

  // A mode that refuses one says so; everything else that would leave the strip empty
  // simply leaves it out.
  if (refusal) {
    return (
      <p className={styles.refused}>
        <strong>No borrowed warden here.</strong> {refusal}
      </p>
    );
  }
  if (!loaded || offers.length === 0 || warband.borrowsLeft < 1) return null;

  return (
    <div className={styles.strip}>
      <p className={styles.label}>
        Borrow a warden’s champion — <strong>{warband.borrowsLeft}</strong> left today. They take
        one of your four slots.
      </p>
      <ul className={styles.offers}>
        {offers.map((warden) => {
          const bearer = warden.standardBearer!;
          const def = defs.get(bearer.championKey);
          const picked = chosen === warden.playerId;
          // A borrow needs a slot — unless one is already borrowed, since choosing a
          // different warden hands the same slot over rather than asking for a second. Not
          // just `|| picked`: that would leave a full lineup able to un-pick and not to
          // switch, which is two clicks for a decision there is one of a day.
          const room = slotsFree > 0 || chosen !== null;
          return (
            <li key={warden.playerId}>
              <button
                type="button"
                className={styles.offer}
                data-picked={picked}
                disabled={!room}
                title={
                  room
                    ? `${bearer.relics} of 9 relics · ${bearer.power.toLocaleString()} power`
                    : 'Your four slots are full — take one out to borrow.'
                }
                onClick={() => onChoose(picked ? null : warden.playerId)}
              >
                <Portrait
                  src={def ? (championArt(def, bundle?.assets).portrait ?? null) : null}
                  name={def?.name ?? bearer.championKey}
                  size={40}
                />
                <span className={styles.text}>
                  <span className={styles.champion}>{def?.name ?? bearer.championKey}</span>
                  <span className={styles.who}>{warden.profileName}</span>
                </span>
                <span className={styles.power}>{bearer.power.toLocaleString()}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
