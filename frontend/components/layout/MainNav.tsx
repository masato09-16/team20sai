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
      <nav className="sticky top-0 z-30 hidden border-b border-stone-200 bg-stone-50/95 backdrop-blur md:block">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-3">
          <p className="text-sm font-semibold text-stone-700">板書練習ノート</p>
          <div className="flex items-center gap-2">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm transition ${
                    active ? "bg-teal-700 text-white" : "text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-stone-200 bg-stone-50/95 backdrop-blur md:hidden">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-1 px-3 py-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-12 flex-col items-center justify-center rounded-lg text-xs ${
                  active ? "bg-teal-700 text-white" : "text-stone-700 hover:bg-stone-200"
                }`}
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
