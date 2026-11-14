import { Children, cloneElement, useId } from "react";
import Icon from "./Icon.jsx";

// Label + one control + hint + error message, wired together for screen readers.
// The control (input, select, textarea or a custom component) gets its id and aria props from here.
export function Field({ label, error, hint, required = false, children, className = "" }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && !error ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const control = cloneElement(Children.only(children), {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": required || undefined,
  });
  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`.trim()}>
      <label htmlFor={id}>
        {label}
        {required ? (
          <span className="req" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {control}
      {hint && !error ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="error-text">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <div className="form-error" role="alert">
      <Icon name="alert" size={18} />
      <span>{message}</span>
    </div>
  );
}

export function FormRow({ children }) {
  return <div className="form-row">{children}</div>;
}

export function Select({ children, ...rest }) {
  return (
    <div className="select-wrap">
      <select className="input" {...rest}>
        {children}
      </select>
      <Icon name="chevron-down" size={16} />
    </div>
  );
}
