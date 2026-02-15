"use client";

import { useState } from "react";

interface WorkflowNodeProps {
  id: string;
  type: "trigger" | "action" | "condition" | "end";
  label: string;
  description: string;
  icon: string;
  x: number;
  y: number;
  connections?: string[];
}

const nodeStyles: Record<string, string> = {
  trigger: "bg-emerald-500/20 border-emerald-500/50 text-emerald-400",
  action: "bg-blue-500/20 border-blue-500/50 text-blue-400",
  condition: "bg-amber-500/20 border-amber-500/50 text-amber-400",
  end: "bg-slate-700/50 border-slate-600/50 text-slate-400",
};

const nodeIcons: Record<string, string> = {
  trigger: "⚡",
  action: "⚙️",
  condition: "🔀",
  end: "🏁",
};

function WorkflowNode({ node, isSelected, onClick }: { node: WorkflowNodeProps; isSelected: boolean; onClick: () => void }) {
  return (
    <div
      className={`absolute cursor-pointer transition-all duration-300 ${
        isSelected ? "scale-110 z-10" : "hover:scale-105"
      }`}
      style={{ left: node.x, top: node.y }}
      onClick={onClick}
    >
      <div
        className={`w-48 rounded-xl border-2 p-4 shadow-lg transition-all ${
          nodeStyles[node.type]
        } ${isSelected ? "ring-2 ring-white/20 shadow-xl" : ""}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-xl">
            {node.icon || nodeIcons[node.type]}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{node.label}</p>
            <p className="truncate text-xs opacity-70">{node.type}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionLine({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const midX = (from.x + to.x) / 2;
  const path = `M ${from.x + 96} ${from.y + 40} C ${midX} ${from.y + 40}, ${midX} ${to.y + 40}, ${to.x + 96} ${to.y + 40}`;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    >
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.5" />
        </linearGradient>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" opacity="0.5" />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="url(#lineGradient)"
        strokeWidth="2"
        markerEnd="url(#arrowhead)"
        className="animate-dash"
      />
    </svg>
  );
}

// Demo workflow data
const demoNodes: WorkflowNodeProps[] = [
  { id: "1", type: "trigger", label: "New Task", description: "Trigger on new task creation", icon: "📋", x: 50, y: 50, connections: ["2"] },
  { id: "2", type: "condition", label: "Priority Check", description: "Check task priority", icon: "⚖️", x: 300, y: 50, connections: ["3", "4"] },
  { id: "3", type: "action", label: "Assign to Lead", description: "Assign urgent tasks to lead", icon: "👑", x: 550, y: 0, connections: ["5"] },
  { id: "4", type: "action", label: "Queue Task", description: "Add to task queue", icon: "📥", x: 550, y: 100, connections: ["5"] },
  { id: "5", type: "action", label: "Notify Squad", description: "Send notifications", icon: "🔔", x: 800, y: 50, connections: ["6"] },
  { id: "6", type: "end", label: "Complete", description: "Workflow complete", icon: "✅", x: 1050, y: 50 },
];

export function WorkflowVisualizer() {
  const [selectedNode, setSelectedNode] = useState<string | null>("1");

  const selectedNodeData = demoNodes.find((n) => n.id === selectedNode);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold text-white">Task Assignment Workflow</h3>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
            Active
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors">
            ➕ Add Node
          </button>
          <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 transition-colors">
            ▶️ Run
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Canvas */}
        <div className="relative flex-1 h-[500px] overflow-auto bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]"
        >
          <div className="relative min-w-[1200px] min-h-[500px]"
          >
            {/* Connection Lines */}
            {demoNodes.map((node) =>
              node.connections?.map((targetId) => {
                const target = demoNodes.find((n) => n.id === targetId);
                if (!target) return null;
                return (
                  <ConnectionLine
                    key={`${node.id}-${targetId}`}
                    from={{ x: node.x, y: node.y }}
                    to={{ x: target.x, y: target.y }}
                  />
                );
              })
            )}

            {/* Nodes */}
            {demoNodes.map((node) => (
              <WorkflowNode
                key={node.id}
                node={node}
                isSelected={selectedNode === node.id}
                onClick={() => setSelectedNode(node.id)}
              />
            ))}
          </div>
        </div>

        {/* Properties Panel */}
        <div className="w-72 border-l border-slate-800 bg-slate-900/50 p-4">
          {selectedNodeData ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Node Type</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xl">{nodeIcons[selectedNodeData.type]}</span>
                  <span className="font-medium text-white capitalize">{selectedNodeData.type}</span>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Label</p>
                <p className="mt-1 font-medium text-white">{selectedNodeData.label}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Description</p>
                <p className="mt-1 text-sm text-slate-400">{selectedNodeData.description}</p>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Connections</p>
                {selectedNodeData.connections?.length ? (
                  <div className="space-y-1">
                    {selectedNodeData.connections.map((id) => {
                      const target = demoNodes.find((n) => n.id === id);
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-2 rounded bg-slate-800/50 px-2 py-1.5 text-sm"
                        >
                          <span>→</span>
                          <span className="text-slate-300">{target?.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">No outgoing connections</p>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <button className="flex-1 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600 transition-colors">
                  Edit
                </button>
                <button className="rounded-lg border border-rose-500/30 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors">
                  🗑️
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="text-4xl mb-2">👆</div>
              <p className="text-slate-500">Select a node to view properties</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkflowTemplates() {
  const templates = [
    { name: "Task Assignment", icon: "📋", description: "Auto-assign tasks based on priority", nodes: 6 },
    { name: "Code Review", icon: "👀", description: "Automated code review pipeline", nodes: 8 },
    { name: "Bug Triage", icon: "🐛", description: "Prioritize and route bug reports", nodes: 5 },
    { name: "Release", icon: "🚀", description: "Deployment and release automation", nodes: 12 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {templates.map((template) => (
        <div
          key={template.name}
          className="group rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-all hover:border-emerald-500/30 hover:bg-slate-800/50 cursor-pointer"
        >
          <div className="text-3xl mb-3">{template.icon}</div>
          <h4 className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
            {template.name}
          </h4>
          <p className="text-sm text-slate-500 mt-1">{template.description}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
              {template.nodes} nodes
            </span>
            <span className="text-xs text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
              Use template →
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
