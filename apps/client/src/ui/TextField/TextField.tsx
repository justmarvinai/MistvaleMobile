import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './TextField.module.scss';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  /** Validation message; also flags the field as invalid for assistive tech. */
  error?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  /**
   * A control inside the well, after the input — a password reveal, a clear button.
   *
   * Inside rather than beside it because the well is one painted 9-slice and a button
   * parked next to it reads as a second field. Whatever goes here must be focusable and
   * named, since it is in the tab order between this field and the next.
   */
  action?: ReactNode;
}

/**
 * A labelled text input in the inset-well style.
 *
 * The label is always rendered (never a placeholder standing in for one) so the field
 * stays readable once it has content, and errors are wired up via `aria-describedby`.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, icon, action, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>

      <div className={`${styles.inputWrap} ${error ? styles.invalid : ''}`}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <input
          {...rest}
          ref={ref}
          id={fieldId}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {action}
      </div>

      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
