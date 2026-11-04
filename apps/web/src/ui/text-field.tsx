import { type ChangeEventHandler, type ReactNode, useId } from 'react';
import { Icon } from './icon';
import './text-field.css';

interface TextFieldProps {
  /** Always shown above the field; a placeholder never stands in for it. */
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'search' | 'url';
  name?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  /** A hint under the field. */
  hint?: string;
  /** The problem with the value, right under the field (marks the field invalid). */
  error?: string;
  /** `danger` for a missing or wrong value, `warn` for a value the service refused. */
  errorTone?: 'danger' | 'warn';
  /**
   * `solid`: the DesignSystem field on the surface; `well`: the X01 field on a dark well, with an icon before the
   * error; `compact`: the 40px field of a dialog.
   */
  variant?: 'solid' | 'well' | 'compact';
  className?: string;
  dataId?: string;
}

/** A labelled text field with its hint or error tied to it (aria-describedby, aria-invalid). */
export function TextField({
  label,
  hint,
  error,
  errorTone = 'danger',
  variant = 'solid',
  type = 'text',
  className,
  dataId,
  ...input
}: TextFieldProps): ReactNode {
  const id = useId();
  const inputId = `${id}-input`;
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className={className ? `kf-field ${className}` : 'kf-field'} data-variant={variant} data-tone={error ? errorTone : undefined}>
      <label className="kf-field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="kf-field-input"
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        data-id={dataId}
        {...input}
      />
      {message && (
        <span id={messageId} className={error ? 'kf-field-error' : 'kf-field-hint'}>
          {error && variant === 'well' && <Icon name={errorTone === 'warn' ? 'warning' : 'error-circle'} size={14} strokeWidth={2.4} />}
          {message}
        </span>
      )}
    </div>
  );
}
