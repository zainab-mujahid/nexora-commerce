export function TextField({
  label,
  name,
  type = "text",
  autoComplete,
  defaultValue,
  min,
  step,
  placeholder,
  hint,
  errors,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string | number;
  min?: string | number;
  step?: string | number;
  placeholder?: string;
  hint?: string;
  errors?: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        min={min}
        step={step}
        placeholder={placeholder}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? `${name}-error` : undefined}
        className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/50 aria-invalid:border-red-500 dark:border-white/20"
      />
      {hint && !errors && (
        <p className="text-xs text-foreground/60">{hint}</p>
      )}
      {errors && (
        <ul id={`${name}-error`} className="text-xs text-red-600">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
