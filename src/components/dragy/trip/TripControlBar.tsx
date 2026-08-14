import { ChevronDown, ChevronUp, Minus, Pause, Play, Plus, RotateCcw, Settings2 } from "lucide-react";
import { Button, usePersistedState } from "@/components/dragy/ui";

export function TripControlBar({
  running, onToggleRun, onRewind, onCorrect, setupOpen, onToggleSetup,
}: {
  running: boolean;
  onToggleRun: () => void;
  onRewind: () => void;
  onCorrect: (delta: number) => void;
  setupOpen: boolean;
  onToggleSetup: () => void;
}) {
  const [visible, setVisible] = usePersistedState<boolean>("tripMaster.controlsVisible", true);
  const [step, setStep] = usePersistedState<10 | 100>("tripMaster.correctionStep", 10);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="mx-auto flex min-h-[44px] items-center gap-1 rounded-md px-3 text-caption text-muted-foreground hover:text-foreground"
      >
        {visible ? <ChevronUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> : <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
        {visible ? "verbergen" : "einblenden"}
      </button>

      {visible && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={onRewind} className="min-h-[48px]">
              <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Rückwärts
            </Button>
            {running ? (
              <Button variant="secondary" onClick={onToggleRun} className="min-h-[48px]">
                <Pause className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Pause
              </Button>
            ) : (
              <Button onClick={onToggleRun} className="min-h-[48px]">
                <Play className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Start
              </Button>
            )}
            <Button variant={setupOpen ? "primary" : "secondary"} onClick={onToggleSetup} className="min-h-[48px]">
              <Settings2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Einrichten
            </Button>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => onCorrect(-step)} className="min-h-[48px]">
              <Minus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {step} m
            </Button>
            <div className="flex overflow-hidden rounded-md border border-input">
              {([10, 100] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStep(s)}
                  className={`min-h-[48px] flex-1 text-caption font-medium transition-ui ${
                    step === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s} m
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => onCorrect(step)} className="min-h-[48px]">
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {step} m
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
