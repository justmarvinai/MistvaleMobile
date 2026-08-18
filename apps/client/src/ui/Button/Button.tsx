import { useLayoutEffect, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { Button as FuiButton, type ButtonVariant as FuiVariant } from '@/fui/components/Button.ts';
import { useFui } from '@/fui/react';
import { createPortal } from 'react-dom';
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
 * Mistvale's four variants, in the library's vocabulary.
 *
 * `danger` has no painted equivalent — the pack ships one glossy blood-red button and it
 * is the primary — so it takes the same art and is separated by colour, which the theme
 * tints from `--fui-blood`. Keeping the mapping here rather than at call sites means the
 * day the library grows a danger variant is a one-line day.
 */
const VARIANT: Readonly<Record<ButtonVariant, FuiVariant>> = {
  primary: 'primary',
  secondary: 'long',
  ghost: 'ghost',
  danger: 'primary',
};

/**
 * The Mistvale button.
 *
 * Painted since the design rework: a nine-sliced ember button from FantasyUIs, with the
 * press, the disabled state and the focus ring the library draws. The signature is
 * unchanged, so every call site in the game kept working.
 *
 * The library's component *is* the `<button>` — not a div wrapping one — so focus, the tab
 * order, form semantics and `aria-*` all behave natively. What this wrapper adds is the
 * four things Mistvale needs and the library has no opinion about:
 *
 *  - **The sound.** Every press in the game routes through here, which is what makes
 *    "every action acknowledges within 100 ms" (UI_UX §1.2) a property of the primitive
 *    rather than something forty screens have to remember.
 *  - **`loading`.** An in-flight action blocks itself and says so, to the eye and to a
 *    screen reader.
 *  - **React children.** The library's label is a string; Mistvale's buttons carry counts,
 *    icons and formatted numbers, so the label is a portal.
 *  - **Passed-through attributes.** `aria-label` and the tutorial's `data-mv-highlight`
 *    have to land on the real button, which is the library's element rather than ours.
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
  // `danger` answers with the spend cue rather than the press: releasing a champion or
  // selling a relic is giving something up, and it should not sound like tapping a tab.
  // It is not the *refusal* sound — that one is for an action the server turned down.
  const press = (event: unknown): void => {
    if (cue !== null) playCue(cue ?? (variant === 'danger' ? CUE.spend : CUE.press));
    onClick?.(event as MouseEvent<HTMLButtonElement>);
  };

  const { ref, instance } = useFui(
    FuiButton,
    {
      variant: VARIANT[variant],
      size,
      block: fullWidth,
      disabled: disabled || loading,
      type,
      onClick: press,
      class: [styles.button, styles[variant], loading ? styles.loading : '']
        .filter(Boolean)
        .join(' '),
    },
    undefined,
    // Options are construction-time; a *changing* prop needs the component's own setter.
    // `disabled` is the one that moves here — a claim button that never stops being
    // disabled is a button nobody can press, which is how this was found.
    (button, next) => button.setDisabled(next.disabled ?? false),
  );

  // Everything a caller put on the button that the library has no option for. Written to
  // the real element rather than to the wrapper, because a `display: contents` wrapper is
  // not in the accessibility tree and the tutorial's highlight measures a box.
  useLayoutEffect(() => {
    const el = instance?.el;
    if (!el) return;
    if (loading) el.setAttribute('aria-busy', 'true');
    else el.removeAttribute('aria-busy');
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined || value === null || typeof value === 'function') continue;
      if (key.startsWith('aria-') || key.startsWith('data-') || key === 'title' || key === 'id') {
        el.setAttribute(key, String(value));
      }
    }
  });

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {instance
        ? createPortal(
            <span className={styles.content}>
              {loading && <span className={styles.spinner} aria-hidden="true" />}
              {icon && !loading && <span className={styles.icon}>{icon}</span>}
              {children && <span className={styles.label}>{children}</span>}
            </span>,
            instance.el,
          )
        : null}
    </div>
  );
}
