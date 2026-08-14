import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-e3"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-center gap-2">
          <h3 className="min-w-0 flex-1 text-subtitle text-foreground">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
