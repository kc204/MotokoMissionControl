export default function TasksPage() {
  const columns = ["Inbox", "In Progress", "Review", "Done"];
  
  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-bold text-white">Tasks</h1>
        <p className="mt-4 text-slate-400">Kanban board for task management</p>
        
        <div className="mt-8 grid gap-6 md:grid-cols-4">
          {columns.map((column) => (
            <div key={column} className="rounded-lg bg-slate-900/50 p-4">
              <h3 className="font-semibold text-slate-200">{column}</h3>
              <div className="mt-4 space-y-3">
                {[1, 2, 3].map((task) => (
                  <div
                    key={task}
                    className="rounded border border-slate-800 bg-slate-800/50 p-3 hover:border-emerald-500/50"
                  >
                    <p className="text-sm text-slate-300">Task {task}</p>
                    <p className="text-xs text-slate-500 mt-1">Priority: High</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
