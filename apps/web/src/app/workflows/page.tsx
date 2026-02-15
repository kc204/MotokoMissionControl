"use client";

import Link from "next/link";

export default function WorkflowsPage() {
  return (
    <div className="min-h-full p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-8 border-b border-white/10 pb-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Workflows
              </h1>
              <p className="mt-2 text-lg text-zinc-400">Visual workflow builder and automation</p>
            </div>
            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.06]"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </header>

        {/* Info Banner */}
        <div className="mb-8 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div>
              <p className="font-medium text-cyan-300">Workflow Automation</p>
              <p className="text-sm text-zinc-400">
                Create automated pipelines that connect agents, tasks, and external services.
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Active Workflows", value: 0, color: "text-emerald-300" },
            { label: "Templates", value: 3, color: "text-cyan-300" },
            { label: "Executions Today", value: 0, color: "text-zinc-200" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-4"
            >
              <p className="text-xs uppercase tracking-wider text-zinc-500">{stat.label}</p>
              <p className={`mt-1 text-3xl font-semibold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </section>

        {/* Templates */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-white">Workflow Templates</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: "Task Assignment",
                desc: "Auto-assign tasks to available agents",
                icon: "⚡",
                color: "bg-cyan-500/20 text-cyan-300",
              },
              {
                name: "Review Pipeline",
                desc: "Route completed tasks for review",
                icon: "👀",
                color: "bg-amber-500/20 text-amber-300",
              },
              {
                name: "Notification Flow",
                desc: "Alert agents on urgent tasks",
                icon: "🔔",
                color: "bg-fuchsia-500/20 text-fuchsia-300",
              },
            ].map((template) => (
              <div
                key={template.name}
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 transition-colors hover:border-white/15"
              >
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${template.color}`}>
                    {template.icon}
                  </span>
                  <div>
                    <p className="font-medium text-white">{template.name}</p>
                    <p className="text-xs text-zinc-500">{template.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Documentation */}
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6">
            <h3 className="mb-4 font-semibold text-white">Node Types</h3>
            <div className="space-y-3">
              {[
                { type: "Trigger", icon: "⚡", desc: "Start a workflow" },
                { type: "Action", icon: "⚙️", desc: "Perform an action" },
                { type: "Condition", icon: "🔀", desc: "Branch based on criteria" },
                { type: "End", icon: "🏁", desc: "Complete the workflow" },
              ].map((node) => (
                <div key={node.type} className="flex items-center gap-3 text-sm">
                  <span>{node.icon}</span>
                  <span className="text-zinc-300">{node.type}</span>
                  <span className="text-zinc-500">— {node.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6">
            <h3 className="mb-4 font-semibold text-white">Getting Started</h3>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400">1.</span>
                <span>Select a template or start from scratch</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400">2.</span>
                <span>Add nodes and connect them</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400">3.</span>
                <span>Configure each node's settings</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400">4.</span>
                <span>Publish and activate your workflow</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
