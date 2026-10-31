/**
 * One labelled input with its error. The error is tied to the input with
 * `aria-describedby` and `aria-invalid`, so a screen reader announces it —
 * red text alone is never the only signal.
 */
export function Field({
  label, name, type = 'text', autoComplete, defaultValue, hint, error, required = true, ...rest
}) {
  const id = `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-medium text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
        className={`rounded-control border bg-inset px-3 py-2 text-card text-ink outline-none transition-colors duration-150 placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-accent ${
          error ? 'border-danger' : 'border-line'
        }`}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="text-meta text-ink-faint">{hint}</p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-meta text-danger">{error}</p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ children, pending }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded-control bg-accent px-4 py-2.5 text-card font-medium text-on-accent transition-colors duration-150 hover:opacity-90 disabled:opacity-60"
    >
      {children}
    </button>
  );
}
