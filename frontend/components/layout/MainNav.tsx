"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, Home, Settings } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/album", label: "アルバム", icon: BookOpenText },
  { href: "/settings", label: "設定", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav() {
  const pathname = usePathname();
  return (
    <>
      <nav className="sticky top-0 z-30 hidden border-b border-canvas-line bg-paper/88 backdrop-blur-xl md:block">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-3">
          <p className="text-sm font-semibold tracking-tight text-stone-800">板書練習ノート</p>
          <div className="flex items-center gap-2">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 ${
                    active
                      ? "bg-teal-700 text-white shadow-[0_8px_18px_rgba(47,102,90,0.18)]"
                      : "text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-canvas-line bg-paper/92 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-1 px-3 py-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-12 flex-col items-center justify-center rounded-xl text-xs font-medium transition duration-200 ease-out active:scale-[0.98] ${
                  active ? "bg-teal-700 text-white shadow-[0_8px_18px_rgba(47,102,90,0.16)]" : "text-stone-700 hover:bg-stone-100"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" />
                <span className="mt-0.5">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
