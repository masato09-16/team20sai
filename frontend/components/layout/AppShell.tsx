import type { ReactNode } from "react";
import { MainNav } from "@/components/layout/MainNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <MainNav />
      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-5 sm:px-6 md:pb-10 md:pt-6">{children}</main>
    </div>
  );
}
