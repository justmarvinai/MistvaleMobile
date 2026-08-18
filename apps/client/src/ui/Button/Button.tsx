import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { CUE, playCue } from '../../audio';
import styles from './Button.module.scss';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner and blocks interaction while an action is in flight. */
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  /**
   * Which cue the press makes. `danger` already answers with the refusal sound; anything
   * that opens or closes something can say so rather than clicking.
   */
  cue?: (typeof CUE)[keyof typeof CUE] | null;
}

/**
 * The Mistvale button.
 *
 * Three visual tiers plus a destructive variant, all with the pixel-bevel treatment
 * from docs/UI_UX_DESIGN.md §1.1 — an embossed edge, a 1px press-down, and a visible
 * keyboard focus ring.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  children,
  disabled,
  type = 'button',
  cue,
  onClick,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    loading ? styles.loading : '',
  ]
    .filter(Boolean)
    .join(' ');

  // The one place a press becomes a sound. Every button in the game routes through here,
  // which is what makes "every action acknowledges within 100 ms" (UI_UX §1.2) a property
  // of the primitive rather than a thing forty screens have to remember.
  //
  // `danger` answers with the spend cue rather than the press: releasing a champion or
  // selling a relic is giving something up, and it should not sound like tapping a tab.
  // It is not the *refusal* sound — that one is for an action the server turned down.
  const press = (event: MouseEvent<HTMLButtonElement>): void => {
    if (cue !== null) playCue(cue ?? (variant === 'danger' ? CUE.spend : CUE.press));
    onClick?.(event);
  };

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={press}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {icon && !loading && <span className={styles.icon}>{icon}</span>}
      {children && <span className={styles.label}>{children}</span>}
    </button>
  );
}
