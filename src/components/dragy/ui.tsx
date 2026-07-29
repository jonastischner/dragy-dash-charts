import { useState, type ReactNode, type InputHTMLAttributes, type ButtonHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props}
      className={`w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${props.className ?? ""}`} />
  );
}


export function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold text-foreground">{title}</h2>
      {note && <p className="mb-2 text-xs text-amber-300">{note}</p>}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className={`w-full rounded-md border border-input bg-muted px-2 py-2 text-sm text-foreground focus:border-ring focus:outline-none ${props.className ?? ""}`} />
  );
}

export function NumInput({ value, onChange, onBlur, onFocus, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [draft, setDraft] = useState<string | null>(null);
  const propStr = value === undefined || value === null || value === "" ? "" : String(value);
  const display = draft !== null ? draft : propStr;
  return (
    <TextInput
      type="text"
      inputMode="decimal"
      {...rest}
      value={display}
      onFocus={(e) => { setDraft(propStr); onFocus?.(e); }}
      onChange={(e) => {
        const typed = e.target.value;
        setDraft(typed);
        const raw = typed.replace(",", ".").trim();
        if (raw === "" || raw === "-" || raw === "." || raw === "-." || raw.endsWith(".")) return;
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        const target = { ...e.target, value: String(n) } as HTMLInputElement;
        onChange?.({ ...e, target, currentTarget: target } as React.ChangeEvent<HTMLInputElement>);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}

export function Button({ children, variant = "primary", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const base = "inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  const styles: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    ghost: "bg-transparent text-foreground hover:bg-muted",
  };
  return <button {...rest} className={`${base} ${styles[variant]} ${rest.className ?? ""}`}>{children}</button>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">{children}</p>;
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-2 ${className}`}>{children}</div>;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: { icon?: ReactNode; title: string; description?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-4 py-10 text-center">
      {icon && <div className="text-muted-foreground [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

