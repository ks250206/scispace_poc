import { useState, type ReactNode } from "react";

interface ConfigGroupProps {
  title: string;
  children: ReactNode;
}

interface ConfigFieldProps {
  label: string;
  children: ReactNode;
  compact?: boolean;
}

export function ConfigGroup({ title, children }: ConfigGroupProps) {
  return (
    <section className="plot-config-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function ConfigField({ label, children, compact = false }: ConfigFieldProps) {
  return (
    <label className={compact ? "plot-config-field compact" : "plot-config-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

interface CommittedTextInputProps {
  label: string;
  value: string;
  className?: string;
  onCommit: (value: string) => void;
}

export function CommittedTextInput({ label, value, className, onCommit }: CommittedTextInputProps) {
  const [draft, setDraft] = useState<{ base: string; value: string }>();
  const text = draft?.base === value ? draft.value : value;
  return (
    <input
      aria-label={label}
      className={className}
      value={text}
      onChange={(event) => setDraft({ base: value, value: event.target.value })}
      onBlur={() => {
        setDraft(undefined);
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(undefined);
      }}
    />
  );
}
