import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Motoko Mission Control
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            Next-generation AI agent orchestration platform
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href="/agents"
              className="rounded-md bg-emerald-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              Manage Agents
            </Link>
            <Link
              href="/tasks"
              className="text-sm font-semibold leading-6 text-slate-300 hover:text-white"
            >
              View Tasks →
            </Link>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Agents", value: "12", change: "+2 this week" },
            { title: "Active Tasks", value: "47", change: "+5 today" },
            { title: "Squads", value: "3", change: "+1 this month" },
            { title: "Workflows", value: "8", change: "+2 this week" },
          ].map((stat) => (
            <div
              key={stat.title}
              className="rounded-lg border border-slate-800 bg-slate-900/50 p-6"
            >
              <p className="text-sm font-medium text-slate-400">{stat.title}</p>
              <p className="mt-2 text-3xl font-semibold text-white">{stat.value}</p>
              <p className="mt-1 text-sm text-emerald-400">{stat.change}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
