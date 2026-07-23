"use client";

type StepId = 1 | 2 | 3 | 4;

type Step = {
  id: StepId;
  label: string;
  available: boolean;
};

export function PracticeSteps({ current, canCompare = true }: { current: StepId; canCompare?: boolean }) {
  const steps: Step[] = [
    { id: 1, label: "撮影", available: true },
    { id: 2, label: "診断結果", available: true },
    { id: 3, label: "3分練習", available: true },
    { id: 4, label: "比較", available: canCompare },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm" aria-label="練習の進行ステップ">
      {steps.map((step, index) => {
        const active = step.id === current;
        const passed = step.id < current;
        const mutedFuture = !step.available && step.id > current;
        const tone = active
          ? "border-brand bg-brand text-white shadow-[0_8px_18px_rgba(47,102,90,0.16)]"
          : passed
            ? "border-brand-200 bg-brand-50 text-brand-800"
            : mutedFuture
              ? "border-stone-200 bg-stone-100 text-stone-400"
              : "border-canvas-line bg-paper text-stone-600";

        return (
          <div key={step.id} className="flex items-center gap-2">
            <span className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 font-medium transition ${tone}`}>
              {step.id} {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span className="text-stone-300" aria-hidden>
                →
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
