import { mutation } from "./_generated/server";

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const tasks = [
      {
        title: "Analyze competitor pricing",
        description: "Review top 3 prop firm affiliate programs and compare commission structures.",
        status: "in_progress",
        priority: "high",
        createdBy: "System",
      },
      {
        title: "Draft 'Best Prop Firms 2026' Article",
        description: "SEO-optimized content targeting day traders looking for funding.",
        status: "assigned",
        priority: "medium",
        createdBy: "System",
      },
      {
        title: "Fix Mobile Nav Menu",
        description: "The hamburger menu is overlapping the logo on iOS devices.",
        status: "inbox",
        priority: "low",
        createdBy: "System",
      },
      {
        title: "Automate Daily PnL Report",
        description: "Create a script to fetch daily PnL from MT5 and post to Discord.",
        status: "done",
        priority: "medium",
        createdBy: "System",
      },
    ];

    for (const task of tasks) {
      await ctx.db.insert("tasks", {
        ...task,
        status: task.status as any,
        priority: task.priority as any,
        assigneeIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});
