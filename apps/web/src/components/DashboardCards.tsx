"use client";

import Link from "next/link";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: string;
  href: string;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  color?: "emerald" | "blue" | "purple" | "amber" | "rose";
}

const colorVariants = {
  emerald: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400 hover:border-emerald-500/40",
  blue: "from-blue-500/20 to-blue-600/5 border-blue-500/20 text-blue-400 hover:border-blue-500/40",
  purple: "from-purple-500/20 to-purple-600/5 border-purple-500/20 text-purple-400 hover:border-purple-500/40",
  amber: "from-amber-500/20 to-amber-600/5 border-amber-500/20 text-amber-400 hover:border-amber-500/40",
  rose: "from-rose-500/20 to-rose-600/5 border-rose-500/20 text-rose-400 hover:border-rose-500/40",
};

export function StatCard({
  title,
  value,
  description,
  icon,
  href,
  trend,
  color = "emerald",
}: StatCardProps) {
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${colorVariants[color]}`}
    >
      {/* Background glow effect */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/5 blur-2xl transition-all group-hover:bg-white/10" />

      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="text-3xl">{icon}</div>
          {trend && (
            <div
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                trend.positive
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-rose-500/20 text-rose-400"
              }`}
            >
              <span>{trend.positive ? "↑" : "↓"}</span>
              <span>{trend.value}%</span>
            </div>
          )}
        </div>

        <p className="mt-4 text-sm font-medium text-slate-400">{title}</p>
        <p className="mt-1 text-3xl font-bold text-white">{value}</p>
        {description && (
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        )}
      </div>
    </Link>
  );
}

interface ActivityItemProps {
  icon: string;
  title: string;
  description: string;
  timestamp: string;
  status?: "success" | "pending" | "error";
}

export function ActivityItem({
  icon,
  title,
  description,
  timestamp,
  status = "success",
}: ActivityItemProps) {
  const statusColors = {
    success: "bg-emerald-500/20 text-emerald-400",
    pending: "bg-amber-500/20 text-amber-400",
    error: "bg-rose-500/20 text-rose-400",
  };

  return (
    <div className="flex items-start gap-4 rounded-lg border border-slate-800/50 bg-slate-900/30 p-4 transition-all hover:bg-slate-800/50 hover:border-slate-700">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${statusColors[status]}`}>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-200">{title}</p>
        <p className="text-sm text-slate-500 truncate">{description}</p>
      </div>
      <span className="text-xs text-slate-600">{timestamp}</span>
    </div>
  );
}

interface QuickActionProps {
  icon: string;
  label: string;
  description: string;
  href: string;
  color?: "primary" | "secondary" | "outline";
}

export function QuickAction({
  icon,
  label,
  description,
  href,
  color = "primary",
}: QuickActionProps) {
  const colorStyles = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/20",
    secondary: "bg-slate-700 text-white hover:bg-slate-600",
    outline: "border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white",
  };

  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-lg px-4 py-3 transition-all ${colorStyles[color]}`}
    >
      <span className="text-2xl group-hover:scale-110 transition-transform">{icon}</span>
      <div className="text-left">
        <p className="font-medium">{label}</p>
        <p className="text-xs opacity-80">{description}</p>
      </div>
    </Link>
  );
}
