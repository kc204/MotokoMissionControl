"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/agents", label: "Agents" },
  { href: "/tasks", label: "Tasks" },
  { href: "/workflows", label: "Workflows" },
  { href: "/hq", label: "HQ Chat" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <div className="z-40 border-b border-white/10 bg-[#03050a]/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Mission Control v2
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
        <div className="hidden w-48 lg:block text-right">
          <span className="text-xs text-zinc-600">OpenClaw Integration</span>
        </div>
      </div>
    </div>
  );
}
