import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { loadMissionControlEnv, normalizeModelId, parseOpenClawJsonOutput } from "./lib/mission-control";

loadMissionControlEnv();

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required in .env.local");
}

const client = new ConvexHttpClient(convexUrl);
const IS_WINDOWS = os.platform() === "win32";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || (IS_WINDOWS ? "openclaw.cmd" : "openclaw");
const POLL_MS = Number(process.env.DISPATCH_POLL_MS || 2000);
const AUTOMATION_REFRESH_MS = Number(process.env.AUTOMATION_REFRESH_MS || 5000);
const DISPATCH_CONCURRENCY = Math.max(1, Number(process.env.DISPATCH_CONCURRENCY || 2));
const THREAD_CONTEXT_LIMIT = Math.max(1, Number(process.env.DISPATCH_THREAD_CONTEXT_LIMIT || 8));
const TASK_DESCRIPTION_MAX_CHARS = Math.max(
  200,
  Number(process.env.DISPATCH_DESCRIPTION_MAX_CHARS || 1800)
);
const DISPATCH_NOTE_MAX_CHARS = Math.max(
  100,
  Number(process.env.DISPATCH_NOTE_MAX_CHARS || 1200)
);
const DISPATCH_MESSAGE_MAX_CHARS = Math.max(
  800,
  Number(process.env.DISPATCH_MESSAGE_MAX_CHARS || (IS_WINDOWS ? 3500 : 12000))
);
const RUN_ONCE = process.env.DISPATCH_RUN_ONCE === "1";
const LAST_DISPATCH_STARTED_KEY = "probe:last_dispatch_started";
const LAST_DISPATCH_RESULT_KEY = "probe:last_dispatch_result";
const RUNNER_ID =
  process.env.DISPATCH_RUNNER_ID?.trim() || `task-dispatcher:${os.hostname()}:${process.pid}`;
const DISPATCH_RATE_LIMIT_COOLDOWN_MS = Math.max(
  30000,
  Number(process.env.DISPATCH_RATE_LIMIT_COOLDOWN_MS || 10 * 60 * 1000)
);
const DISPATCH_RATE_LIMIT_FALLBACK_MODELS = (
  process.env.DISPATCH_RATE_LIMIT_FALLBACK_MODELS || "kimi-coding/kimi-for-coding"
)
  .split(",")
  .map((value) => normalizeModelId(value))
  .filter(Boolean);

type DispatchClaim = {
  dispatchId: Id<"taskDispatches">;
  taskId: Id<"tasks">;
  taskTitle: string;
  taskDescription: string;
  taskPriority: "low" | "medium" | "high" | "urgent";
  taskTags: string[];
  targetAgentId: Id<"agents">;
  targetAgentName: string;
  targetSessionKey: string;
  targetThinkingModel: string;
  targetFallbackModel: string;
  targetAgentLevel: "LEAD" | "INT" | "SPC";
  targetAgentRole: string;
  targetAgentSystemPrompt: string;
  targetAgentCharacter: string;
  targetAgentLore: string;
  assigneeAgentNames?: string[];
  collaboratorNames?: string[];
  prompt?: string;
  threadMessages: Array<{ fromUser: boolean; text: string }>;
};

type OpenClawAgentResult = {
  runId?: string;
  status?: string;
  summary?: string;
  payloads?: Array<{
    text?: string | null;
  }>;
  result?: {
    payloads?: Array<{
      text?: string | null;
    }>;
  };
};

let autoDispatchEnabled = true;
let lastAutomationRefreshAt = 0;
let lastAutoDispatchDisabledLogAt = 0;
const providerCooldownUntil = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnOpenClaw(args: string[]) {
  if (IS_WINDOWS) {
    return spawn("cmd.exe", ["/d", "/s", "/c", OPENCLAW_BIN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  }
  return spawn(OPENCLAW_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
}

async function runOpenClaw(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawnOpenClaw(args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `openclaw exited with code ${code}; args=${summarizeArgs(args)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function truncate(value: string, max = 500) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 3))}...`;
}

function summarizeArgs(args: string[]) {
  return truncate(
    args
      .map((arg) => {
        if (arg.startsWith("You are ")) {
          return `${arg.slice(0, 60)}...`;
        }
        return arg.length > 120 ? `${arg.slice(0, 117)}...` : arg;
      })
      .join(" "),
    300
  );
}

function truncatePromptBlock(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 24)).trimEnd()}\n\n[Truncated]`;
}

function looksLikeExecutionError(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (/resource_not_found_error/i.test(text)) return true;
  if (/http\s+[45]\d\d/i.test(text)) return true;
  if (/unauthorized|forbidden|invalid api key|authentication/i.test(text)) return true;
  if (/rate limit|provider error|model .* not found/i.test(text)) return true;
  return false;
}

function looksLikeRateLimitError(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  return (
    /\b429\b/.test(text) ||
    text.includes("rate limit") ||
    text.includes("too many requests") ||
    text.includes("resource_exhausted") ||
    text.includes("quota") ||
    text.includes("requests per minute") ||
    text.includes("requests per day")
  );
}

function modelProvider(modelId?: string) {
  const normalized = normalizeModelId(modelId || "");
  if (!normalized) return "";
  const provider = normalized.split("/")[0]?.trim().toLowerCase();
  return provider || "";
}

function isProviderInCooldown(provider: string, now = Date.now()) {
  if (!provider) return false;
  const expiresAt = providerCooldownUntil.get(provider) || 0;
  if (expiresAt <= now) {
    providerCooldownUntil.delete(provider);
    return false;
  }
  return true;
}

function markProviderCooldown(provider: string, now = Date.now()) {
  if (!provider) return;
  providerCooldownUntil.set(provider, now + DISPATCH_RATE_LIMIT_COOLDOWN_MS);
}

function providerCooldownRemainingMs(provider: string, now = Date.now()) {
  const expiresAt = providerCooldownUntil.get(provider) || 0;
  return Math.max(0, expiresAt - now);
}

function buildModelPlan(claim: DispatchClaim) {
  const models: string[] = [];
  const seen = new Set<string>();
  const push = (value?: string) => {
    const normalized = normalizeModelId(value || "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    models.push(normalized);
  };

  push(claim.targetThinkingModel);
  push(claim.targetFallbackModel);
  for (const model of DISPATCH_RATE_LIMIT_FALLBACK_MODELS) {
    push(model);
  }

  return models;
}

function pickInitialModel(modelPlan: string[]) {
  if (modelPlan.length === 0) return "";
  const now = Date.now();
  for (const model of modelPlan) {
    const provider = modelProvider(model);
    if (!provider || !isProviderInCooldown(provider, now)) {
      return model;
    }
  }
  return modelPlan[0];
}

function pickNextModel(modelPlan: string[], attempted: Set<string>) {
  const now = Date.now();
  for (const model of modelPlan) {
    if (attempted.has(model)) continue;
    const provider = modelProvider(model);
    if (!provider || !isProviderInCooldown(provider, now)) {
      return model;
    }
  }
  for (const model of modelPlan) {
    if (!attempted.has(model)) return model;
  }
  return "";
}

function extractRunErrorDetail(run: OpenClawAgentResult) {
  const responseText = responseTextFromRun(run);
  const statusSummary = statusSummaryFromRun(run);
  const detail = responseText || statusSummary || "OpenClaw reported non-ok status";
  if (isFailureStatus(run.status) && looksLikeExecutionError(detail)) return detail;
  if (looksLikeExecutionError(detail)) return detail;
  return "";
}

function responseTextFromRun(run: OpenClawAgentResult) {
  return (run.result?.payloads ?? run.payloads ?? [])
    .map((payload) => (typeof payload.text === "string" ? payload.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

function statusSummaryFromRun(run: OpenClawAgentResult) {
  return `${run.status ?? ""} ${run.summary ?? ""}`.trim();
}

function isFailureStatus(status?: string) {
  const normalized = (status ?? "").trim().toLowerCase();
  return (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "failure" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "timeout"
  );
}

function isTransientOpenClawError(message: string) {
  const text = message.toLowerCase();
  return (
    text.includes("session file locked") ||
    text.includes(".jsonl.lock") ||
    text.includes("gateway timeout") ||
    text.includes("failovererror")
  );
}

async function runAgentTurnWithRetry(
  openclawAgentId: string,
  prompt: string,
  maxAttempts = 3
): Promise<OpenClawAgentResult> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runOpenClawJson<OpenClawAgentResult>([
        "agent",
        "--agent",
        openclawAgentId,
        "--message",
        prompt,
        "--json",
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(message);
      if (attempt >= maxAttempts || !isTransientOpenClawError(message)) {
        break;
      }
      await sleep(1000 * attempt);
    }
  }
  throw lastError ?? new Error("OpenClaw agent run failed without error details");
}

function mainSessionKeyForAgent(agentId: string) {
  return `agent:${agentId}:main`;
}

function sessionStorePathForAgent(agentId: string) {
  return path.join(os.homedir(), ".openclaw", "agents", agentId, "sessions", "sessions.json");
}

async function clearAgentMainSession(agentId: string) {
  const storePath = sessionStorePathForAgent(agentId);
  try {
    const raw = await fs.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const key = mainSessionKeyForAgent(agentId);
    if (!Object.prototype.hasOwnProperty.call(parsed, key)) return false;
    delete parsed[key];
    await fs.writeFile(storePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function ensureAgentModel(openclawAgentId: string, requestedModel?: string) {
  const normalizedModel = normalizeModelId(requestedModel || "");
  if (!normalizedModel) return;
  await runOpenClaw(["models", "--agent", openclawAgentId, "set", normalizedModel]);
}

async function recoverFromLegacyKimi404(
  openclawAgentId: string,
  claim: DispatchClaim,
  failureDetail: string
) {
  if (!/resource_not_found_error/i.test(failureDetail)) return false;
  const normalizedModel = normalizeModelId(claim.targetThinkingModel || "");
  if (!normalizedModel) return false;

  try {
    await runOpenClaw(["models", "--agent", openclawAgentId, "set", normalizedModel]);
  } catch {
    // Keep going to session cleanup retry path.
  }
  const cleared = await clearAgentMainSession(openclawAgentId);
  return cleared;
}

function resolveOpenClawAgentId(sessionKey: string) {
  const parts = sessionKey.split(":");
  if (parts.length >= 2 && parts[0] === "agent" && parts[1]) {
    return parts[1];
  }
  return "main";
}

function buildTaskPrompt(claim: DispatchClaim) {
  const tags = claim.taskTags.length > 0 ? claim.taskTags.join(", ") : "none";
  const collaborators = claim.collaboratorNames?.length
    ? claim.collaboratorNames.join(", ")
    : "none";
  const threadLines = claim.threadMessages
    .slice(-THREAD_CONTEXT_LIMIT)
    .map((msg) => `${msg.fromUser ? "USER/HQ" : "AGENT"}: ${truncate(msg.text, 180)}`)
    .join("\n");
  const safeDescription = truncatePromptBlock(
    claim.taskDescription || "No description provided.",
    TASK_DESCRIPTION_MAX_CHARS
  );
  const safeDispatchNote = claim.prompt?.trim()
    ? truncatePromptBlock(claim.prompt, DISPATCH_NOTE_MAX_CHARS)
    : "";

  const prompt = [
    `You are ${claim.targetAgentName} (${claim.targetAgentRole}, ${claim.targetAgentLevel}).`,
    `Task: ${truncate(claim.taskTitle, 180)}`,
    `Priority: ${claim.taskPriority}`,
    `Tags: ${tags}`,
    "",
    "Task description:",
    safeDescription,
    "",
    safeDispatchNote ? `Dispatch note from HQ:\n${safeDispatchNote}\n` : "",
    `Collaborators assigned on this task: ${collaborators}.`,
    "Your output should include:",
    "1) what you changed or validated,",
    "2) concrete handoff notes for collaborators,",
    "3) blockers (if any) prefixed with BLOCKED:.",
    "Keep it concise and actionable.",
    "",
    "Recent task thread context:",
    threadLines || "No prior thread messages.",
  ]
    .filter(Boolean)
    .join("\n");

  return truncatePromptBlock(prompt, DISPATCH_MESSAGE_MAX_CHARS);
}

async function runOpenClawJson<T>(args: string[]): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const child = spawnOpenClaw(args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr || `openclaw exited with code ${code}; args=${summarizeArgs(args)}`)
        );
        return;
      }

      const sources = [stdout, stderr, `${stdout}\n${stderr}`];
      for (const source of sources) {
        if (!source.trim()) continue;
        try {
          resolve(parseOpenClawJsonOutput<T>(source));
          return;
        } catch {
          // Try next source variant.
        }
      }

      const fallbackText = stdout.trim() || stderr.trim();
      if (fallbackText) {
        resolve({
          status: "error",
          summary: "non_json_output",
          result: {
            payloads: [
              {
                text: fallbackText,
              },
            ],
          },
        } as T);
        return;
      }

      reject(
        new Error(
          `Failed to parse JSON output for openclaw args=${summarizeArgs(args)}; stdout="${truncate(
            stdout,
            220
          )}" stderr="${truncate(stderr, 220)}"`
        )
      );
    });
  });
}

async function refreshAutomationConfig(now: number) {
  if (now - lastAutomationRefreshAt < AUTOMATION_REFRESH_MS) return;
  lastAutomationRefreshAt = now;

  try {
    const config = await client.query(api.settings.getAutomationConfig);
    autoDispatchEnabled = config.autoDispatchEnabled;
  } catch (error) {
    console.error("[dispatch] failed to load automation config; keeping previous value:", error);
  }
}

async function writeDispatchProbeStart(claim: DispatchClaim, openclawAgentId: string) {
  await client.mutation(api.settings.set, {
    key: LAST_DISPATCH_STARTED_KEY,
    value: {
      at: Date.now(),
      dispatchId: claim.dispatchId,
      taskId: claim.taskId,
      taskTitle: truncate(claim.taskTitle, 140),
      targetAgentId: openclawAgentId,
      targetName: claim.targetAgentName,
      runner: RUNNER_ID,
      mode: claim.collaboratorNames?.length ? "collaborative_lane" : "single_lane",
    },
  });
}

async function writeDispatchProbeResult(
  claim: DispatchClaim,
  status: "success" | "failed" | "cancelled",
  startedAt: number,
  payload: { runId?: string; preview: string; error?: string }
) {
  await client.mutation(api.settings.set, {
    key: LAST_DISPATCH_RESULT_KEY,
    value: {
      at: Date.now(),
      durationMs: Date.now() - startedAt,
      dispatchId: claim.dispatchId,
      taskId: claim.taskId,
      taskTitle: truncate(claim.taskTitle, 140),
      targetName: claim.targetAgentName,
      status,
      runId: payload.runId,
      finalPreview: truncate(payload.preview, 400),
      error: payload.error ? truncate(payload.error, 800) : undefined,
      runner: RUNNER_ID,
    },
  });
}

async function handleDispatch(claim: DispatchClaim) {
  const cancel = await client.query(api.tasks.shouldCancelDispatch, {
    dispatchId: claim.dispatchId,
  });
  if (cancel) {
    await writeDispatchProbeResult(claim, "cancelled", Date.now(), {
      preview: "Dispatch was cancelled before execution.",
    });
    return;
  }

  const startedAt = Date.now();
  const openclawAgentId = resolveOpenClawAgentId(claim.targetSessionKey);
  const prompt = buildTaskPrompt(claim);
  const modelPlan = buildModelPlan(claim);
  const primaryModel = normalizeModelId(claim.targetThinkingModel || "");
  let activeModel = pickInitialModel(modelPlan) || primaryModel;

  try {
    await ensureAgentModel(openclawAgentId, activeModel);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(
      `[dispatch] preflight model set failed agent=${openclawAgentId} model=${activeModel || claim.targetThinkingModel}: ${truncate(
        errorMessage,
        220
      )}`
    );
  }

  await writeDispatchProbeStart(claim, openclawAgentId);
  await client.mutation(api.tasks.logSubagentUpdate, {
    taskId: claim.taskId,
    agentId: claim.targetAgentId,
    subagentName: claim.targetAgentName,
    update: `Starting dispatch lane via ${openclawAgentId}${activeModel ? ` on ${activeModel}` : ""}.`,
  });

  try {
    const attemptedModels = new Set<string>();
    let run: OpenClawAgentResult | null = null;
    let lastErrorDetail = "";

    while (true) {
      if (activeModel && !attemptedModels.has(activeModel)) {
        try {
          await ensureAgentModel(openclawAgentId, activeModel);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(
            `[dispatch] model set failed agent=${openclawAgentId} model=${activeModel}: ${truncate(
              errorMessage,
              220
            )}`
          );
        }
      }
      if (activeModel) attemptedModels.add(activeModel);

      run = await runAgentTurnWithRetry(openclawAgentId, prompt);
      let detail = extractRunErrorDetail(run);

      if (!detail) break;

      const recovered = await recoverFromLegacyKimi404(openclawAgentId, claim, detail);
      if (recovered) {
        run = await runAgentTurnWithRetry(openclawAgentId, prompt);
        detail = extractRunErrorDetail(run);
        if (!detail) break;
      }

      if (looksLikeRateLimitError(detail)) {
        const provider = modelProvider(activeModel);
        if (provider) {
          markProviderCooldown(provider);
          const remainingSec = Math.ceil(providerCooldownRemainingMs(provider) / 1000);
          console.warn(
            `[dispatch] rate-limit detected provider=${provider} cooldown=${remainingSec}s model=${activeModel}`
          );
        }

        const nextModel = pickNextModel(modelPlan, attemptedModels);
        if (nextModel) {
          activeModel = nextModel;
          await client.mutation(api.tasks.logSubagentUpdate, {
            taskId: claim.taskId,
            agentId: claim.targetAgentId,
            subagentName: claim.targetAgentName,
            update: `Rate limit detected${provider ? ` on ${provider}` : ""}; retrying lane on ${nextModel}.`,
          });
          continue;
        }
      }

      lastErrorDetail = detail;
      break;
    }

    if (!run) {
      throw new Error("OpenClaw run was empty.");
    }
    if (lastErrorDetail) {
      throw new Error(lastErrorDetail);
    }

    const responseText = responseTextFromRun(run);
    const statusSummary = statusSummaryFromRun(run);
    if (
      isFailureStatus(run.status) &&
      looksLikeExecutionError(responseText || statusSummary || "OpenClaw reported non-ok status")
    ) {
      throw new Error(responseText || statusSummary || "OpenClaw reported non-ok status");
    }
    if (looksLikeExecutionError(responseText || statusSummary)) {
      throw new Error(responseText || statusSummary);
    }

    const preview = truncate(
      responseText ||
        `${run.status ?? "ok"}${run.summary ? ` (${run.summary})` : ""}` ||
        "Agent completed without textual output.",
      800
    );

    await client.mutation(api.tasks.logSubagentUpdate, {
      taskId: claim.taskId,
      agentId: claim.targetAgentId,
      subagentName: claim.targetAgentName,
      update: `Lane finished: ${preview}`,
    });

    await client.mutation(api.tasks.completeDispatch, {
      dispatchId: claim.dispatchId,
      runId: run.runId,
      resultPreview: preview,
      verificationStatus: "unknown",
      verificationSummary: "Awaiting deliverable verification.",
    });

    await writeDispatchProbeResult(claim, "success", startedAt, {
      runId: run.runId,
      preview,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await client.mutation(api.tasks.logSubagentUpdate, {
      taskId: claim.taskId,
      agentId: claim.targetAgentId,
      subagentName: claim.targetAgentName,
      update: `Lane failed: ${truncate(errorMessage, 400)}`,
    });
    await client.mutation(api.tasks.failDispatch, {
      dispatchId: claim.dispatchId,
      error: errorMessage,
    });
    await writeDispatchProbeResult(claim, "failed", startedAt, {
      preview: "Dispatch lane failed.",
      error: errorMessage,
    });
  }
}

async function runWorker(
  runner: string,
  runOnce: boolean,
  onHandled: () => void
) {
  while (true) {
    try {
      const now = Date.now();
      await refreshAutomationConfig(now);
      if (!autoDispatchEnabled) {
        if (now - lastAutoDispatchDisabledLogAt >= 30000) {
          console.log("[dispatch] auto dispatch disabled by automation config");
          lastAutoDispatchDisabledLogAt = now;
        }
        if (runOnce) return;
        await sleep(POLL_MS);
        continue;
      }

      const claim = (await client.mutation(api.tasks.claimNextDispatch, {
        runner,
      })) as DispatchClaim | null;
      if (!claim) {
        if (runOnce) return;
        await sleep(POLL_MS);
        continue;
      }

      await handleDispatch(claim);
      onHandled();
      if (runOnce) return;
    } catch (error) {
      console.error(`[dispatch] worker ${runner} loop error:`, error);
      if (runOnce) return;
      await sleep(POLL_MS);
    }
  }
}

async function main() {
  const workerCount = RUN_ONCE ? 1 : DISPATCH_CONCURRENCY;
  console.log(
    `[dispatch] daemon started poll=${POLL_MS}ms workers=${workerCount} runner=${RUNNER_ID}${RUN_ONCE ? " runOnce=1" : ""}`
  );

  let handled = 0;
  const workers = Array.from({ length: workerCount }, (_, index) =>
    runWorker(
      workerCount === 1 ? RUNNER_ID : `${RUNNER_ID}:w${index + 1}`,
      RUN_ONCE,
      () => {
        handled += 1;
      }
    )
  );
  await Promise.all(workers);
  console.log(`[dispatch] exit handled=${handled}`);
}

main().catch((error) => {
  console.error("task-dispatcher fatal:", error);
  process.exit(1);
});
