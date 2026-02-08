"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function AuthSwitcher() {
  const profilesQuery = useQuery(api.auth.list);
  const profiles = profilesQuery ?? [];
  const activeProfile = useQuery(api.auth.getActive);
  const setActive = useMutation(api.auth.setActive);
  const seed = useMutation(api.auth.seed);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (profilesQuery === undefined) return;
    if (profilesQuery.length === 0) {
      void seed();
    }
  }, [profilesQuery, seed]);

  if (activeProfile === undefined) {
    return <div className="h-10 w-full animate-pulse rounded-xl bg-white/5" />;
  }

  const selectedProfile = activeProfile ?? null;
  const hasProfiles = profiles.length > 0;
  const initials = selectedProfile?.email?.[0]?.toUpperCase() ?? "?";
  const title = selectedProfile?.email ?? "Select Provider Profile";
  const subtitle = selectedProfile?.provider ?? (hasProfiles ? "Choose an account to activate" : "No profiles found");

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (!hasProfiles) return;
          setIsOpen((open) => !open);
        }}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
          hasProfiles
            ? "border-transparent hover:border-white/10 hover:bg-white/5"
            : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-cyan-500 text-xs font-bold text-white">
          {initials}
        </div>
        <div className="flex-1 overflow-hidden text-left">
          <p className="truncate text-xs font-medium text-white">{title}</p>
          <p className="truncate text-[10px] text-zinc-500">{subtitle}</p>
        </div>
        <span className="text-xs text-zinc-500">{hasProfiles ? "v" : "-"}</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-xl border border-white/10 bg-black/90 shadow-xl backdrop-blur-xl">
          <div className="space-y-1 p-2">
            {profiles.map((profile) => (
              <button
                key={profile._id}
                onClick={() => {
                  void setActive({ id: profile._id });
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  profile.isActive
                    ? "bg-blue-600/20 text-blue-300"
                    : "text-zinc-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="truncate">{profile.email}</span>
                {profile.isActive && <span>OK</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
