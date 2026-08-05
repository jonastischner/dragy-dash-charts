import { useState, useEffect, useCallback, type ReactNode, type InputHTMLAttributes, type ButtonHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronRight, Trash2, Plus, AlertCircle, Loader2 } from "lucide-react";

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

// Einheitliche, aufklappbare Sektion
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
  const titleCls = level === "section" ? "text-body font-semibold text-foreground" : "text-caption font-semibold text-foreground";
  return (
    <div className={`mt-4 rounded-lg border border-border ${level === "sub" ? "mt-3 bg-elevated" : "bg-card"}`}>
      <div className="flex items-center gap-2 px-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md px-3 text-left transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={`h-4 w-4 flex-none text-muted-foreground transition-ui ${open ? "rotate-90" : ""}`} strokeWidth={2} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${titleCls}`}>{title}</span>
            {subtitle && <span className="block truncate text-caption text-muted-foreground">{subtitle}</span>}
          </span>
        </button>
        {actions}
      </div>
      {open && <div className="animate-enter px-4 pb-4 pt-2">{children}</div>}
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
      className={`inline-flex h-11 w-11 flex-none items-center justify-center rounded-md text-muted-foreground transition-ui hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 ${rest.className ?? ""}`}
    >
      {icon === "trash" && <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}

// Einheitlicher „Hinzufügen"-Button – immer am Ende einer Liste.
export function AddButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button variant="secondary" {...rest} className={`mt-4 w-full ${rest.className ?? ""}`}>
      <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      {children}
    </Button>
  );
}

const fieldCls =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-body text-foreground placeholder:text-muted-foreground transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[invalid=true]:border-destructive";

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldCls} min-h-[88px] ${props.className ?? ""}`} />;
}

export function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-4 shadow-e1">
      <h2 className="mb-3 text-subtitle text-foreground">{title}</h2>
      {note && <Note>{note}</Note>}
      {note && <div className="h-3" />}
      {children}
    </section>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption text-muted-foreground">{label}</span>
      {children}
      {error && (
        <span className="mt-1 flex items-center gap-2 text-caption text-destructive">
          <AlertCircle className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden="true" />
          {error}
        </span>
      )}
      {hint && !error && <span className="mt-1 block text-caption text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldCls} min-h-[44px] ${props.className ?? ""}`} />;
}

export function Select({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`${fieldCls} min-h-[44px] ${rest.className ?? ""}`}>
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

export function Button({
  children, variant = "primary", loading = false, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean }) {
  const base =
    "inline-flex items-center justify-center gap-2 min-h-[44px] rounded-md px-4 py-2 text-body font-medium transition-ui disabled:opacity-40 disabled:cursor-default disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  const styles: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed",
    secondary: "border border-input bg-transparent text-foreground hover:bg-accent active:bg-accent/80",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
    ghost: "bg-transparent text-foreground hover:bg-accent active:bg-accent/80",
  };
  return (
    <button {...rest} disabled={rest.disabled || loading} className={`${base} ${styles[variant]} ${rest.className ?? ""}`}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-3 text-caption text-foreground">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-warning" strokeWidth={2} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-3 ${className}`}>{children}</div>;
}

// Loading-Zustand für Inhaltsflächen (Skeleton statt Spinner)
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-elevated ${className}`} aria-hidden="true" />;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: { icon?: ReactNode; title: string; description?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
      {icon && <div className="text-muted-foreground [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <div>
        <div className="text-subtitle text-foreground">{title}</div>
        {description && <p className="mx-auto mt-1 max-w-[45ch] text-caption text-muted-foreground">{description}</p>}
      </div>
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
