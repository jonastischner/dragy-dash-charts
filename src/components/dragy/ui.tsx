import { useState, useEffect, useCallback, type ReactNode, type InputHTMLAttributes, type ButtonHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronRight, Trash2, Plus } from "lucide-react";

// Persistente User-Preferences (Panel-Zustände, Auswahl in Diagrammen …)
export function usePersistedState<T>(key: string, initial: T) {
  const storageKey = `dragy.pref.${key}`;
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch { /* ignore */ }
    setLoaded(true);
  }, [storageKey]);

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      try { localStorage.setItem(storageKey, JSON.stringify(resolved)); } catch { /* ignore */ }
      return resolved;
    });
  }, [storageKey]);

  return [value, update, loaded] as const;
}

// Einheitliche, aufklappbare Sektion (gleiches Verhalten wie „Erweitert" in Sessions)
export function Collapsible({
  title, children, subtitle, defaultOpen = false, persistKey, actions, level = "section",
}: {
  title: string;
  children: ReactNode;
  subtitle?: string;
  defaultOpen?: boolean;
  persistKey?: string;
  actions?: ReactNode;
  level?: "section" | "sub";
}) {
  const [open, setOpen] = usePersistedState<boolean>(persistKey ?? `__tmp.${title}`, defaultOpen);
  const titleCls = level === "section" ? "text-xs font-semibold text-foreground" : "text-[11px] font-semibold text-foreground";
  return (
    <div className={`mt-3 rounded-md border border-border ${level === "sub" ? "bg-card/60 mt-2" : "bg-card/50"}`}>
      <div className="flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-h-[44px] flex-1 items-center gap-2 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={`h-4 w-4 flex-none text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
          <span className="min-w-0">
            <span className={`block truncate ${titleCls}`}>{title}</span>
            {subtitle && <span className="block truncate text-[10px] text-muted-foreground">{subtitle}</span>}
          </span>
        </button>
        {actions}
      </div>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

export function IconButton({ label, icon = "trash", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon?: "trash" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`inline-flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${rest.className ?? ""}`}
    >
      {icon === "trash" && <Trash2 className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

// Einheitlicher „Hinzufügen"-Button – immer am Ende einer Liste.
export function AddButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button variant="secondary" {...rest} className={`mt-2 w-full ${rest.className ?? ""}`}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      {children}
    </Button>
  );
}

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
      className={`w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${props.className ?? ""}`} />
  );
}

export function Select({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest}
      className={`w-full min-h-[44px] rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${rest.className ?? ""}`}>
      {children}
    </select>
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

