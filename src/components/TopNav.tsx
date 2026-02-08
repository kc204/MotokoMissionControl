"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthSwitcher from "./AuthSwitcher";

const links = [
  { href: "/", label: "Agents" },
  { href: "/kanban", label: "Kanban" },
  { href: "/hq", label: "HQ Chat" },
  { href: "/settings", label: "Settings" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Mission Control
        </div>
        <nav className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden w-64 lg:block">
          <AuthSwitcher />
        </div>
      </div>
    </div>
  );
}
