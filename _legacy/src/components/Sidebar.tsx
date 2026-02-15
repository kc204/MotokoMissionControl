"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthSwitcher from "./AuthSwitcher";

const navigation = [
  { name: "Agents", href: "/", icon: "A" },
  { name: "Kanban", href: "/kanban", icon: "K" },
  { name: "HQ Chat", href: "/hq", icon: "H" },
  { name: "Settings", href: "/settings", icon: "S" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-white/10 bg-black/50 backdrop-blur-xl">
      <div className="border-b border-white/10 p-6">
        <h1 className="bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-xl font-bold tracking-tighter text-transparent">
          Mission Control
        </h1>
      </div>

      <nav className="flex-1 space-y-2 p-4">
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
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-4 border-t border-white/10 p-4">
        <AuthSwitcher />

        <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="font-mono text-xs text-zinc-500">SYSTEM ONLINE</span>
        </div>
      </div>
    </div>
  );
}
