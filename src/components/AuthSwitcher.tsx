"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect } from "react";

export default function AuthSwitcher() {
  const profiles = useQuery(api.auth.list) || [];
  const activeProfile = useQuery(api.auth.getActive);
  const setActive = useMutation(api.auth.setActive);
  const seed = useMutation(api.auth.seed);
  const [isOpen, setIsOpen] = useState(false);

  // Auto-seed on first load if empty
  useEffect(() => {
    if (profiles.length === 0) {
      seed();
    }
  }, [profiles, seed]);

  if (!activeProfile) return <div className="animate-pulse h-10 w-full bg-white/5 rounded-xl" />;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
          {activeProfile.email[0].toUpperCase()}
        </div>
        <div className="flex-1 text-left overflow-hidden">
          <p className="text-xs font-medium text-white truncate">{activeProfile.email}</p>
          <p className="text-[10px] text-zinc-500 truncate">{activeProfile.provider}</p>
        </div>
        <span className="text-zinc-500 text-xs">▼</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 w-full mb-2 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-xl z-50">
          <div className="p-2 space-y-1">
            {profiles.map((p) => (
              <button
                key={p._id}
                onClick={() => {
                  setActive({ id: p._id });
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${
                  p.isActive ? "bg-blue-600/20 text-blue-400" : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <span className="truncate">{p.email}</span>
                {p.isActive && <span>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
