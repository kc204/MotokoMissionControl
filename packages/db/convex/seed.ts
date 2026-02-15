import { mutationGeneric as mutation } from "convex/server";

const canonicalAgents = [
  {
    name: "Motoko",
    role: "Squad Lead",
    level: "LEAD" as const,
    status: "active" as const,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Motoko",
    models: {
      thinking: "kimi-coding/kimi-for-coding",
      heartbeat: "google/gemini-2.5-flash",
      fallback: "kimi-coding/kimi-for-coding",
    },
    sessionKey: "agent:motoko:main",
  },
  {
    name: "Forge",
    role: "Developer",
    level: "INT" as const,
    status: "idle" as const,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Forge",
    models: {
      thinking: "openai-codex/gpt-5.2",
      execution: "openai-codex/gpt-5.2",
      heartbeat: "google/gemini-2.5-flash",
      fallback: "kimi-coding/kimi-for-coding",
    },
    sessionKey: "agent:developer:main",
  },
  {
    name: "Quill",
    role: "Writer",
    level: "INT" as const,
    status: "idle" as const,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Quill",
    models: {
      thinking: "google/gemini-2.5-pro",
      heartbeat: "google/gemini-2.5-flash",
      fallback: "kimi-coding/kimi-for-coding",
    },
    sessionKey: "agent:writer:main",
  },
  {
    name: "Recon",
    role: "Researcher",
    level: "SPC" as const,
    status: "idle" as const,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Recon",
    models: {
      thinking: "google/gemini-2.5-flash",
      heartbeat: "google/gemini-2.5-flash",
      fallback: "kimi-coding/kimi-for-coding",
    },
    sessionKey: "agent:researcher:main",
  },
  {
    name: "Pulse",
    role: "Monitor",
    level: "SPC" as const,
    status: "idle" as const,
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Pulse",
    models: {
      thinking: "google/gemini-2.5-flash",
      heartbeat: "google/gemini-2.5-flash",
      fallback: "kimi-coding/kimi-for-coding",
    },
    sessionKey: "agent:monitor:main",
  },
];

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Default project.
    const defaultProject = await ctx.db
      .query("projects")
      .withIndex("by_name", (q) => q.eq("name", "General"))
      .first();
    if (!defaultProject) {
      await ctx.db.insert("projects", {
        name: "General",
        description: "Default project",
        color: "#3b82f6",
        icon: "📌",
        settings: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const agent of canonicalAgents) {
      const existing = await ctx.db
        .query("agents")
        .withIndex("by_name", (q) => q.eq("name", agent.name))
        .first();
      if (existing) continue;

      await ctx.db.insert("agents", {
        ...agent,
        role: agent.role,
        level: agent.level,
        status: agent.status,
        currentTaskId: undefined,
        squadId: undefined,
        systemPrompt: undefined,
        character: undefined,
        lore: undefined,
        stats: undefined,
        models: {
          thinking: agent.models.thinking,
          execution: "execution" in agent.models ? (agent.models as any).execution : undefined,
          heartbeat: agent.models.heartbeat,
          fallback: agent.models.fallback,
        },
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

