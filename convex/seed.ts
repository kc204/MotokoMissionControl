import { mutation } from "./_generated/server";

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const agents = [
      {
        name: "Motoko",
        role: "Team Lead & Architect",
        status: "active",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Motoko",
        models: {
          thinking: "Claude Opus 3.5",
          heartbeat: "Gemini 1.5 Flash",
          fallback: "Claude Sonnet 3.5",
        },
        sessionKey: "motoko-main",
      },
      {
        name: "Recon",
        role: "Researcher",
        status: "idle",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Recon",
        models: {
          thinking: "Perplexity / Gemini Pro",
          heartbeat: "Gemini 1.5 Flash",
          fallback: "Haiku",
        },
        sessionKey: "recon-01",
      },
      {
        name: "Quill",
        role: "Content Writer",
        status: "idle",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Quill",
        models: {
          thinking: "Claude Opus",
          heartbeat: "Gemini 1.5 Flash",
          fallback: "Sonnet",
        },
        sessionKey: "quill-01",
      },
      {
        name: "Forge",
        role: "Developer",
        status: "active",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Forge",
        models: {
          thinking: "Codex / Claude Opus",
          heartbeat: "Gemini 1.5 Flash",
          fallback: "GPT-4o",
        },
        sessionKey: "forge-01",
      },
      {
        name: "Pulse",
        role: "Monitor & Analytics",
        status: "active",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Pulse",
        models: {
          thinking: "Gemini 1.5 Pro",
          heartbeat: "Gemini 1.5 Flash",
          fallback: "Haiku",
        },
        sessionKey: "pulse-01",
      },
    ];

    for (const agent of agents) {
      // Check if exists
      const existing = await ctx.db
        .query("agents")
        .filter((q) => q.eq(q.field("name"), agent.name))
        .first();

      if (!existing) {
        await ctx.db.insert("agents", {
          ...agent,
          status: agent.status as "idle" | "active" | "blocked",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  },
});
