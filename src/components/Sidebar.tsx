"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { name: "Agents", href: "/", icon: "🤖" },
  { name: "Kanban", href: "/kanban", icon: "📋" },
  { name: "HQ Chat", href: "/hq", icon: "💬" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col w-64 border-r border-white/10 bg-black/50 backdrop-blur-xl h-screen fixed left-0 top-0 z-50">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500">
          Mission Control
        </h1>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive 
                  ? "bg-white/10 text-white border border-white/10" 
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono text-zinc-500">SYSTEM ONLINE</span>
        </div>
      </div>
    </div>
  );
}
