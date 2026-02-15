#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@motoko/db";
import { MissionControlRuntime, runOpenClawJson, type RuntimeConfig } from "@motoko/agents";
import os from "os";
import path from "path";

const program = new Command();

type AgentStatus = "idle" | "active" | "blocked" | "offline";
type AgentLevel = "LEAD" | "INT" | "SPC";

interface AgentRow {
  _id: string;
  name: string;
  role: string;
  level?: AgentLevel;
  status: AgentStatus;
  currentTaskId?: string;
  sessionKey: string;
  systemPrompt?: string;
  models?: unknown;
  createdAt: number;
}

interface OpenClawAgentRow {
  id: string;
  model?: string;
}

interface OpenClawModelsList {
  models?: Array<{
    key?: string;
    available?: boolean;
  }>;
}

type TaskStatus =
  | "inbox"
  | "assigned"
  | "in_progress"
  | "testing"
  | "review"
  | "done"
  | "blocked"
  | "archived";

type TaskPriority = "low" | "medium" | "high" | "urgent";

interface TaskRow {
  _id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds?: string[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// Helper to get Convex client
function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    console.error(chalk.red("Error: CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable is required"));
    process.exit(1);
  }
  return new ConvexHttpClient(convexUrl);
}

function agentIdFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(":");
  if (parts.length >= 2 && parts[0] === "agent" && parts[1]) {
    return parts[1];
  }
  return "main";
}

program
  .name("mmc")
  .description("Motoko Mission Control CLI")
  .version("2.0.0");

program
  .command("dev")
  .description("Start development server")
  .action(() => {
    console.log(chalk.green("🚀 Starting development server..."));
    console.log(chalk.blue("Run: turbo run dev --parallel"));
  });

program
  .command("build")
  .description("Build all packages")
  .action(() => {
    console.log(chalk.green("🔨 Building packages..."));
    console.log(chalk.blue("Run: turbo run build"));
  });

// Agent commands
const agentCmd = program
  .command("agent")
  .description("Manage agents");

agentCmd
  .command("list")
  .description("List all agents")
  .option("-j, --json", "Output as JSON")
  .action(async (options) => {
    try {
      const client = getConvexClient();
      const agents = (await client.query(api.agents.list, {})) as AgentRow[];

      if (options.json) {
        console.log(JSON.stringify(agents, null, 2));
        return;
      }

      console.log(chalk.bold("\n🤖 Agents\n"));
      console.log(chalk.gray("─".repeat(80)));

      const statusColorByStatus = {
        idle: chalk.gray,
        active: chalk.green,
        blocked: chalk.red,
        offline: chalk.gray,
      } satisfies Record<AgentStatus, typeof chalk.gray>;

      const levelIconByLevel = {
        LEAD: "👑",
        INT: "⭐",
        SPC: "🔧",
      } satisfies Record<AgentLevel, string>;

      for (const agent of agents) {
        const statusColor = statusColorByStatus[agent.status];
        const level = agent.level ?? "SPC";
        const levelIcon = levelIconByLevel[level];

        console.log(`\n${levelIcon} ${chalk.bold(agent.name)} ${statusColor(`[${agent.status}]`)}`);
        console.log(`   Role: ${agent.role}`);
        console.log(`   Level: ${level}`);
        if (agent.currentTaskId) {
          console.log(`   Current Task: ${agent.currentTaskId}`);
        }
        console.log(`   Session: ${agent.sessionKey}`);
        console.log(`   Created: ${new Date(agent.createdAt).toLocaleDateString()}`);
      }

      console.log(chalk.gray("\n─".repeat(80)));
      console.log(chalk.dim(`Total: ${agents.length} agents\n`));
    } catch (error) {
      console.error(chalk.red("Error fetching agents:"), error);
      process.exit(1);
    }
  });

agentCmd
  .command("get")
  .description("Get agent details")
  .argument("<name>", "Agent name")
  .option("-j, --json", "Output as JSON")
  .action(async (name, options) => {
    try {
      const client = getConvexClient();
      const agent = (await client.query(api.agents.getByName, { name })) as AgentRow | null;

      if (!agent) {
        console.error(chalk.red(`Agent not found: ${name}`));
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(agent, null, 2));
        return;
      }

      console.log(chalk.bold(`\n🤖 ${agent.name}\n`));
      console.log(`Role: ${agent.role}`);
      console.log(`Level: ${agent.level || "SPC"}`);
      console.log(`Status: ${agent.status}`);
      console.log(`Session Key: ${agent.sessionKey}`);
      if (agent.systemPrompt) {
        console.log(`System Prompt: ${agent.systemPrompt.slice(0, 100)}...`);
      }
      if (agent.models) {
        console.log(`Models: ${JSON.stringify(agent.models, null, 2)}`);
      }
      console.log(`Created: ${new Date(agent.createdAt).toLocaleString()}`);
      console.log();
    } catch (error) {
      console.error(chalk.red("Error fetching agent:"), error);
      process.exit(1);
    }
  });

// Task commands
const taskCmd = program
  .command("task")
  .description("Manage tasks");

taskCmd
  .command("list")
  .description("List tasks")
  .option("-s, --status <status>", "Filter by status")
  .option("-l, --limit <number>", "Limit results", "50")
  .option("-j, --json", "Output as JSON")
  .action(async (options) => {
    try {
      const client = getConvexClient();
      const tasks = (await client.query(api.tasks.list, {
        status: options.status,
        limit: parseInt(options.limit, 10),
      })) as TaskRow[];

      if (options.json) {
        console.log(JSON.stringify(tasks, null, 2));
        return;
      }

      console.log(chalk.bold("\n📋 Tasks\n"));
      console.log(chalk.gray("─".repeat(80)));

      const priorityColorByPriority = {
        low: chalk.gray,
        medium: chalk.blue,
        high: chalk.yellow,
        urgent: chalk.red,
      } satisfies Record<TaskPriority, typeof chalk.gray>;

      const statusColorByStatus = {
        inbox: chalk.gray,
        assigned: chalk.blue,
        in_progress: chalk.yellow,
        testing: chalk.magenta,
        review: chalk.cyan,
        done: chalk.green,
        blocked: chalk.red,
        archived: chalk.gray,
      } satisfies Record<TaskStatus, typeof chalk.gray>;

      for (const task of tasks) {
        const priorityColor = priorityColorByPriority[task.priority];
        const statusColor = statusColorByStatus[task.status];

        console.log(`\n${chalk.bold(task.title)} ${priorityColor(`[${task.priority}]`)}`);
        console.log(`   Status: ${statusColor(task.status)}`);
        console.log(`   Description: ${task.description.slice(0, 100)}${task.description.length > 100 ? "..." : ""}`);
        if (task.assigneeIds?.length) {
          console.log(`   Assignees: ${task.assigneeIds.join(", ")}`);
        }
        if (task.tags?.length) {
          console.log(`   Tags: ${task.tags.join(", ")}`);
        }
        console.log(`   Created: ${new Date(task.createdAt).toLocaleDateString()}`);
      }

      console.log(chalk.gray("\n─".repeat(80)));
      console.log(chalk.dim(`Total: ${tasks.length} tasks\n`));
    } catch (error) {
      console.error(chalk.red("Error fetching tasks:"), error);
      process.exit(1);
    }
  });

taskCmd
  .command("get")
  .description("Get task details")
  .argument("<id>", "Task ID")
  .option("-j, --json", "Output as JSON")
  .action(async (id, options) => {
    try {
      const client = getConvexClient();
      const task = (await client.query(api.tasks.get, { id })) as TaskRow | null;

      if (!task) {
        console.error(chalk.red(`Task not found: ${id}`));
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(task, null, 2));
        return;
      }

      console.log(chalk.bold(`\n📋 ${task.title}\n`));
      console.log(`Status: ${task.status}`);
      console.log(`Priority: ${task.priority}`);
      console.log(`Description:\n${task.description}\n`);
      if (task.assigneeIds?.length) {
        console.log(`Assignees: ${task.assigneeIds.join(", ")}`);
      }
      if (task.tags?.length) {
        console.log(`Tags: ${task.tags.join(", ")}`);
      }
      console.log(`Created: ${new Date(task.createdAt).toLocaleString()}`);
      console.log(`Updated: ${new Date(task.updatedAt).toLocaleString()}`);
      if (task.completedAt) {
        console.log(`Completed: ${new Date(task.completedAt).toLocaleString()}`);
      }
      console.log();
    } catch (error) {
      console.error(chalk.red("Error fetching task:"), error);
      process.exit(1);
    }
  });

// Runtime commands
const runtimeCmd = program
  .command("runtime")
  .description("Manage the unified runtime service");

runtimeCmd
  .command("start")
  .description("Start the unified runtime service")
  .option("--url <url>", "Convex deployment URL (overrides environment variables)")
  .option("-c, --concurrency <number>", "Number of concurrent workers", "3")
  .option("--claim-ttl <ms>", "Claim TTL in milliseconds", "60000")
  .action(async (options) => {
    const convexUrl = options.url || process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      console.error(chalk.red("Error: provide --url or set CONVEX_URL / NEXT_PUBLIC_CONVEX_URL"));
      process.exit(1);
    }

    const config: RuntimeConfig = {
      convexUrl,
      runnerId: `mmc-runtime:${process.env.HOSTNAME || "local"}:${process.pid}`,
      concurrency: parseInt(options.concurrency, 10),
      claimTtlMs: parseInt(options.claimTtl, 10),
    };

    console.log(chalk.green("🚀 Starting Motoko Mission Control Runtime\n"));
    console.log(chalk.dim(`Convex URL: ${convexUrl}`));
    console.log(chalk.dim(`Runner ID: ${config.runnerId}`));
    console.log(chalk.dim(`Concurrency: ${config.concurrency}`));
    console.log(chalk.dim(`Claim TTL: ${config.claimTtlMs}ms\n`));

    const runtime = new MissionControlRuntime(config);

    // Handle shutdown gracefully
    const shutdown = () => {
      console.log(chalk.yellow("\n🛑 Shutting down runtime..."));
      runtime.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    try {
      await runtime.start();
      console.log(chalk.green("✅ Runtime started successfully\n"));
      console.log(chalk.dim("Listening for task dispatches and notifications..."));
      console.log(chalk.dim("Press Ctrl+C to stop\n"));

      // Keep the process alive
      await new Promise(() => {});
    } catch (error) {
      console.error(chalk.red("Error starting runtime:"), error);
      process.exit(1);
    }
  });

runtimeCmd
  .command("status")
  .description("Check runtime status")
  .action(() => {
    console.log(chalk.blue("Runtime status check not implemented yet"));
  });

runtimeCmd
  .command("sync-agents")
  .description("Sync Convex agents into OpenClaw")
  .option("--url <url>", "Convex deployment URL (overrides environment variables)")
  .option(
    "--workspace-root <path>",
    "OpenClaw workspace root",
    process.env.OPENCLAW_WORKSPACE_ROOT || path.join(os.homedir(), ".openclaw", "workspace")
  )
  .option(
    "--recreate-model-mismatch",
    "Recreate existing OpenClaw agents when their model differs from target",
    true
  )
  .option("--dry-run", "Show planned actions without creating agents")
  .action(async (options) => {
    const convexUrl = options.url || process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      console.error(chalk.red("Error: provide --url or set CONVEX_URL / NEXT_PUBLIC_CONVEX_URL"));
      process.exit(1);
    }

    const client = new ConvexHttpClient(convexUrl);
    const workspaceRoot = String(options.workspaceRoot);
    const dryRun = Boolean(options.dryRun);

    try {
      const convexAgents = (await client.query(api.agents.list, {})) as AgentRow[];
      const existingOpenClawAgents = (await runOpenClawJson<OpenClawAgentRow[]>([
        "agents",
        "list",
        "--json",
      ])) as OpenClawAgentRow[];
      const existingById = new Map(existingOpenClawAgents.map((agent) => [agent.id, agent]));
      const existingIds = new Set(existingById.keys());

      const modelsResponse = (await runOpenClawJson<OpenClawModelsList>([
        "models",
        "list",
        "--json",
      ])) as OpenClawModelsList;
      const availableModelIds = new Set(
        (modelsResponse.models ?? [])
          .filter((row) => row.available !== false && typeof row.key === "string" && row.key)
          .map((row) => String(row.key))
      );
      const fallbackModel = Array.from(availableModelIds)[0] || "";

      console.log(chalk.bold("\nOpenClaw Agent Sync\n"));
      console.log(chalk.dim(`Convex URL: ${convexUrl}`));
      console.log(chalk.dim(`Workspace root: ${workspaceRoot}`));
      console.log(chalk.dim(`Convex agents: ${convexAgents.length}`));
      console.log(chalk.dim(`OpenClaw agents: ${existingIds.size}\n`));
      console.log(chalk.dim(`Available models: ${availableModelIds.size || 0}`));
      if (fallbackModel) {
        console.log(chalk.dim(`Fallback model: ${fallbackModel}\n`));
      }

      let created = 0;
      let skipped = 0;
      let recreated = 0;
      const recreateModelMismatch = Boolean(options.recreateModelMismatch);

      for (const agent of convexAgents) {
        const openclawAgentId = agentIdFromSessionKey(agent.sessionKey);
        const existing = existingById.get(openclawAgentId);

        const workspacePath =
          openclawAgentId === "main"
            ? workspaceRoot
            : path.join(workspaceRoot, openclawAgentId);

        const configuredModel =
          agent.models && typeof agent.models === "object" && "thinking" in agent.models
            ? String((agent.models as { thinking?: unknown }).thinking || "")
            : "";
        const targetModel =
          configuredModel && availableModelIds.has(configuredModel)
            ? configuredModel
            : fallbackModel;

        if (!existing) {
          const addArgs = [
            "agents",
            "add",
            openclawAgentId,
            "--workspace",
            workspacePath,
            "--non-interactive",
            "--json",
          ];
          if (targetModel) {
            addArgs.push("--model", targetModel);
          }

          if (dryRun) {
            console.log(chalk.yellow(`PLAN  ${openclawAgentId} -> ${workspacePath}`));
          } else {
            await runOpenClawJson(addArgs);
            existingIds.add(openclawAgentId);
            existingById.set(openclawAgentId, { id: openclawAgentId, model: targetModel || undefined });
            created += 1;
            console.log(chalk.green(`ADD   ${openclawAgentId} -> ${workspacePath}`));
          }
        } else {
          skipped += 1;
          console.log(chalk.gray(`SKIP  ${openclawAgentId} (already exists)`));
        }

        const currentModel = existingById.get(openclawAgentId)?.model || "";
        if (targetModel && currentModel !== targetModel) {
          if (dryRun) {
            console.log(
              chalk.yellow(
                `PLAN  recreate ${openclawAgentId} model ${currentModel || "unknown"} -> ${targetModel}`
              )
            );
          } else if (recreateModelMismatch) {
            await runOpenClawJson(["agents", "delete", openclawAgentId, "--force", "--json"]);

            const recreateArgs = [
              "agents",
              "add",
              openclawAgentId,
              "--workspace",
              workspacePath,
              "--model",
              targetModel,
              "--non-interactive",
              "--json",
            ];
            await runOpenClawJson(recreateArgs);
            existingById.set(openclawAgentId, { id: openclawAgentId, model: targetModel });
            recreated += 1;
            console.log(chalk.cyan(`RECREATE ${openclawAgentId} -> ${targetModel}`));
          } else {
            console.log(
              chalk.yellow(
                `WARN  ${openclawAgentId} model mismatch (${currentModel || "unknown"} vs ${targetModel})`
              )
            );
          }
        }
      }

      console.log(
        chalk.bold(
          `\nSync complete. Created=${created}, Recreated=${recreated}, Skipped=${skipped}, Total=${existingIds.size}\n`
        )
      );
    } catch (error) {
      console.error(chalk.red("Agent sync failed:"), error);
      process.exit(1);
    }
  });

program
  .command("deploy")
  .description("Deploy to production")
  .action(() => {
    console.log(chalk.green("🚀 Deploying..."));
  });

program.parse();
