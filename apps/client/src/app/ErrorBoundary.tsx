import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.scss';

interface Props {
  /** Named in the fallback, so a report says *where* rather than "it broke". */
  area: string;
  /**
   * How loudly it fails.
   *
   * `page` owns the space it was given and offers a way out. `quiet` is for a strip of
   * chrome, where a full-page alert in a 60px bar would shout over the screen's own — and
   * would be a second `role="alert"` on a page that already has the real one.
   */
  variant?: 'page' | 'quiet';
  /**
   * Clears the error when this changes.
   *
   * The screen boundary is keyed on the screen, which remounts it on every navigation —
   * right there, because the room is changing anyway. Chrome must not remount on every
   * navigation (the top bar would rebuild its painted parts and restart its bars), so it
   * takes the same recovery without the same cost: nothing happens while it is healthy,
   * and walking to another room is what clears it once it is not.
   */
  resetKey?: string | number;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The thing that stops one bad render blanking the game.
 *
 * React unmounts the entire tree when a render throws and nothing catches it — the player
 * gets a white page, no controls, and no way back but a manual reload. Mistvale had no
 * boundary anywhere, across sixteen screens, with content coming from a database that an
 * operator edits live. A malformed entity reaching a render path is not a hypothetical
 * failure mode; it is the one this design makes most likely.
 *
 * Two of them, at two depths, because they answer different questions:
 *
 * - Around a **screen**, the rest of the game keeps working. The dock still moves, the top
 *   bar still shows the wallet, and the player can walk away from the broken room.
 * - Around the **shell**, there is nothing left to preserve, so the fallback is a full page
 *   that offers a reload.
 * - Around **chrome** — the top bar — quietly, because the bar reads the same roster the
 *   screen does. C5 gave it the account's power, which is the four strongest champions
 *   added together, and put it *outside* the screen boundary: one malformed roster
 *   response then took down the frame this file exists to keep standing, dock and all.
 *
 * Class component because that is the only way React exposes this; there is no hook.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.retry();
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console rather than a reporting service: there is no error backend at EA, and the
    // browser console is where a player who is asked for it will actually look.
    console.error(`Mistvale: ${this.props.area} failed to render`, error, info.componentStack);
  }

  private readonly retry = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.variant === 'quiet') {
      // Deliberately not `role="alert"`: the screen underneath is almost certainly showing
      // the real one, and two of them is a page that shouts twice about one fault.
      return (
        <p className={styles.quiet}>
          The {this.props.area} could not be drawn.{' '}
          <button type="button" className={styles.quietRetry} onClick={this.retry}>
            Try again
          </button>
        </p>
      );
    }

    return (
      <div className={styles.fallback} role="alert">
        <h2 className={styles.title}>The mist closed over this.</h2>
        <p className={styles.blurb}>
          Something went wrong drawing the {this.props.area}. Nothing you did caused it and nothing
          has been lost — the server keeps your progress, not this screen.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={this.retry}>
            Try again
          </button>
          <button type="button" className={styles.button} onClick={() => window.location.reload()}>
            Reload the game
          </button>
        </div>
        <p className={styles.detail}>{error.message}</p>
      </div>
    );
  }
}
