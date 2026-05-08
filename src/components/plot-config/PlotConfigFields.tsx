import type { ReactNode } from "react";

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
