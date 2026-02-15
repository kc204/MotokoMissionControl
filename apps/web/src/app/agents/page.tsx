export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-bold text-white">Agents</h1>
        <p className="mt-4 text-slate-400">Manage your AI agent workforce</p>
        
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {["Orion", "Nova", "Atlas", "Echo", "Pulse", "Spark"].map((agent) => (
            <div
              key={agent}
              className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 hover:border-emerald-500/50"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <span className="text-emerald-400 font-semibold">{agent[0]}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-white">{agent}</h3>
                  <p className="text-sm text-slate-400">Active</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
