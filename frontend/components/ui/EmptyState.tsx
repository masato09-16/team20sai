import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BookOpenText } from "lucide-react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon = BookOpenText, title, description, action }: EmptyStateProps) {
  return (
    <div className="ui-card flex flex-col items-center gap-3 px-5 py-8 text-center">
      <div className="ui-empty-illustration" aria-hidden>
        <Icon className="relative z-10 h-7 w-7 text-teal-800" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-stone-900">{title}</h2>
        <p className="mx-auto max-w-sm text-sm leading-6 text-stone-600">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
