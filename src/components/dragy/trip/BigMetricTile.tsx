export function BigMetricTile({
  label, value, big = false, tone = "default", onTap, tapHint, className = "",
}: {
  label: string;
  value: string;
  big?: boolean;
  tone?: "default" | "accent" | "warn";
  onTap?: () => void;
  tapHint?: string;
  className?: string;
}) {
  const toneCls = tone === "accent" ? "text-rally" : tone === "warn" ? "text-destructive" : "text-foreground";
  const content = (
    <>
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${big ? "text-4xl sm:text-5xl" : "text-2xl"} ${toneCls}`}>{value}</div>
      {tapHint && <div className="mt-1 text-caption uppercase tracking-wide text-muted-foreground">{tapHint}</div>}
    </>
  );

  if (onTap) {
    return (
      <button
        type="button"
        onClick={onTap}
        className={`w-full rounded-lg border border-border bg-elevated px-3 py-3 text-left transition-ui hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`rounded-lg border border-border bg-elevated px-3 py-3 ${className}`}>{content}</div>;
}
