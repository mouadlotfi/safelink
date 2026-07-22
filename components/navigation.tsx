"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { IconHistory, IconInfo, IconLink2, IconCode } from "./icons";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Clean", icon: IconLink2 },
  { href: "/history", label: "History", icon: IconHistory },
  { href: "/api-docs", label: "API", icon: IconCode },
  { href: "/info", label: "Info", icon: IconInfo }
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[var(--border)] bg-[var(--bg-main)] lg:block">
        <div className="flex h-full flex-col p-6">
          <Link href="/" className="mb-8 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500"></div>
            <span className="font-semibold text-white">Safelink</span>
          </Link>
          <nav className="space-y-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href as "/"}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-300"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--bg-main)]/95 backdrop-blur-lg lg:hidden">
        <div className="flex items-center justify-around px-4 py-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href as "/"}
                className={clsx(
                  "flex flex-col items-center gap-1 text-xs font-medium transition-colors",
                  isActive ? "text-blue-400" : "text-slate-400"
                )}
              >
                <Icon className={clsx("h-5 w-5", isActive && "text-blue-500")} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
