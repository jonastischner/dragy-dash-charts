import { useState, type ReactNode, type InputHTMLAttributes, type ButtonHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props}
      className={`w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none ${props.className ?? ""}`} />
  );
}

export function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="mb-4 rounded-lg border border-slate-700 bg-slate-900 p-3">
      <h2 className="mb-2 text-sm font-semibold text-slate-100">{title}</h2>
      {note && <p className="mb-2 text-xs text-amber-300">{note}</p>}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className={`w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none ${props.className ?? ""}`} />
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
  const base = "min-h-[40px] rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-40";
  const styles: Record<string, string> = {
    primary: "bg-sky-500 text-white hover:bg-sky-400",
    secondary: "bg-slate-700 text-slate-100 hover:bg-slate-600",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "bg-transparent text-slate-200 hover:bg-slate-800",
  };
  return <button {...rest} className={`${base} ${styles[variant]} ${rest.className ?? ""}`}>{children}</button>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-amber-900/30 px-2 py-1 text-xs text-amber-300">{children}</p>;
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-2 ${className}`}>{children}</div>;
}
