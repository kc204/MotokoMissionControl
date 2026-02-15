"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { name: "Dashboard", href: "/", icon: "DB" },
  { name: "Agents", href: "/agents", icon: "AG" },
  { name: "Tasks", href: "/tasks", icon: "TS" },
  { name: "Workflows", href: "/workflows", icon: "WF" },
  { name: "HQ", href: "/hq", icon: "HQ" },
  { name: "Settings", href: "/settings", icon: "ST" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-white/10 bg-[#03050a]/80 backdrop-blur-xl lg:flex">
      <div className="border-b border-white/10 p-6">
        <h1 className="text-xl font-bold tracking-tighter text-white">Mission Control</h1>
        <p className="mt-1 text-xs uppercase tracking-widest text-zinc-500">OpenClaw v2</p>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                isActive
                  ? "border border-white/10 bg-white/10 text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="w-5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {item.icon}
              </span>
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
            System Online
          </span>
        </div>
      </div>
    </div>
  );
}
