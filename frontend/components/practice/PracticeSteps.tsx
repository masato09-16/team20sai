"use client";

type StepId = 1 | 2 | 3;

type Step = {
  id: StepId;
  label: string;
  available: boolean;
};

export function PracticeSteps({ current, canCompare = true }: { current: StepId; canCompare?: boolean }) {
  const steps: Step[] = [
    { id: 1, label: "撮影", available: true },
    { id: 2, label: "振り返り", available: true },
    { id: 3, label: "比較", available: canCompare },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
      {steps.map((step, idx) => {
        const active = step.id === current;
        const passed = step.id < current;
        const mutedFuture = !step.available && step.id > current;
        const tone = active
          ? "border-teal-700 bg-teal-700 text-white"
          : passed
            ? "border-teal-300 bg-teal-50 text-teal-800"
            : mutedFuture
              ? "border-stone-200 bg-stone-100 text-stone-400"
              : "border-stone-300 bg-white text-stone-600";

        return (
          <div key={step.id} className="flex items-center gap-2">
            <span className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 font-medium ${tone}`}>
              {step.id} {step.label}
            </span>
            {idx < steps.length - 1 ? <span className="text-stone-400">→</span> : null}
          </div>
        );
      })}
    </div>
  );
}
